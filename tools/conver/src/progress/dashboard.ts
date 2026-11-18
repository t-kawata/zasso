// dashboard.ts — the fixed progress header above the streaming log.
//
// The header uses DECSTBM: rows 1..N are fixed, the log scrolls below. Writes
// are composed into one string per redraw so a timer tick cannot interleave
// with a log line. Non-TTY output is untouched; scrolling and automatic follow
// are caller-controlled.
import type { WorkspaceModel } from "../workspace.js";
import type { CurrentActivity, ProgressSnapshot } from "./model.js";
import chalk from "chalk";
import { HEADER_BACKGROUND, renderActivityLine, renderHeader, visibleColumns } from "./layout.js";
import { stripCommonPrefix } from "./short-name.js";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export interface DashboardOptions {
  workspace: WorkspaceModel;
  intervalMs: number;
  isTty: boolean;
  write: (chunk: string) => void;
  readSnapshot: () => ProgressSnapshot;
  terminalSize: () => { columns: number; rows: number };
  now: () => number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  setRawMode?: (enabled: boolean) => void;
  log?: (message: string) => void;
}

const LOG_MIN_ROWS = 4;
/** The NOW row is always present, idle or running. */
export const NOW_ROWS = 1;
/** Up and down hidden-package indicators, reserved only when they fit. */
const INDICATOR_ROWS = 2;
const SAVE_CURSOR = "\x1b7";
const RESTORE_CURSOR = "\x1b8";
const RESET_SCROLL_REGION = "\x1b[r";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_SCREEN = "\x1b[1;1H\x1b[2J";
const ERASE_LINE = "\x1b[2K";

/** How many package and indicator rows the fixed region may paint. */
// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
export interface FixedBudget {
  packageRows: number;
  indicatorRows: number;
  fixedRows: number;
}

/**
 * Reserve the NOW row first, then spend what remains on package and indicator
 * rows. The result always leaves LOG_MIN_ROWS below the fixed region; a
 * terminal shorter than NOW + LOG_MIN_ROWS gets fixedRows 0 and no dashboard.
 */
// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
export function computeFixedBudget(
  terminalRows: number,
  packageCount: number,
): FixedBudget {
  if (terminalRows < LOG_MIN_ROWS + NOW_ROWS) {
    return { packageRows: 0, indicatorRows: 0, fixedRows: 0 };
  }
  const capacity = Math.max(0, terminalRows - LOG_MIN_ROWS - NOW_ROWS);
  const hidden = packageCount > capacity;
  // Two indicator rows are only safe when one package row still fits beside
  // them. Below that, indicators would push the fixed region past its budget.
  const indicatorRows = hidden && capacity >= INDICATOR_ROWS + 1 ? INDICATOR_ROWS : 0;
  const packageRows = Math.min(packageCount, Math.max(0, capacity - indicatorRows));
  return {
    packageRows,
    indicatorRows,
    fixedRows: NOW_ROWS + packageRows + indicatorRows,
  };
}

// [::TICKET::] PX-404, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-404|PX-449) --for-spec --no-implementation-order`.
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

// [::TICKET::] PX-404, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-404|PX-449) --for-spec --no-implementation-order`.
function padTo(columns: number, line: string): string {
  const width = visibleColumns(line);
  return width >= columns ? line : line + " ".repeat(columns - width);
}

// [::TICKET::] PX-404, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-404|PX-449) --for-spec --no-implementation-order`.
export class ProgressDashboard {
  readonly #options: DashboardOptions;
  #timer: ReturnType<typeof setInterval> | null = null;
  #snapshot: ProgressSnapshot | null = null;
  #activeIndex = 0;
  #windowOffset = 0;
  #manual = false;
  #headerRows = 0;
  #regionRows = 0;
  #regionColumns = 0;
  #cleared = false;
  #lastVisibleCount = 1;
  #running = false;
  #activity: CurrentActivity | null = null;

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
  constructor(options: DashboardOptions) {
    this.#options = options;
  }

  /** Start polling and draw the first header. Non-TTY is a no-op. */
  start(): void {
    if (!this.#options.isTty || this.#running) return;
    this.#running = true;
    this.#options.setRawMode?.(true);
    const setTimer = this.#options.setInterval ?? setInterval;
    this.#timer = setTimer(() => this.#redraw(), this.#options.intervalMs);
    this.#redraw();
  }

  /** Clear the timer, reset the scroll region and restore the cursor. */
  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    const clear = this.#options.clearInterval ?? clearInterval;
    if (this.#timer !== null) {
      clear(this.#timer);
      this.#timer = null;
    }
    this.#options.setRawMode?.(false);
    // A DECSTBM reset homes the cursor, which would leave the shell prompt at
    // the top-left corner and let the next write land on a header row. Save the
    // cursor around the reset so the last log position survives teardown.
    this.#options.write(
      `${SAVE_CURSOR}${RESET_SCROLL_REGION}${RESTORE_CURSOR}${SHOW_CURSOR}`,
    );
    this.#headerRows = 0;
    this.#regionRows = 0;
    this.#regionColumns = 0;
    this.#cleared = false;
  }

  /** Recompute after a terminal resize. */
  handleResize(): void {
    this.#redraw();
  }

  /** Move the visible package window by `delta` rows and leave auto-follow. */
  scroll(delta: number): void {
    this.#manual = true;
    const maximum = Math.max(0, this.#packageCount() - this.#lastVisibleCount);
    this.#windowOffset = clamp(this.#windowOffset + delta, 0, maximum);
    this.#redraw();
  }

  /** Follow the package named by the runner. */
  follow(packageName: string): void {
    const index = this.#options.workspace.packages.findIndex(
      (packageEntry) => packageEntry.name === packageName,
    );
    if (index >= 0) this.#activeIndex = index;
    this.#manual = false;
    this.#windowOffset = 0;
    if (this.#running) this.#redraw();
  }

  /**
   * Publish the command that is running now. The runner calls this before and
   * after execution so the NOW row never waits for the poll interval.
   */
  setActivity(activity: CurrentActivity | null): void {
    this.#activity = activity;
    if (this.#running) this.#redraw();
  }

  /** Handle one keypress from the terminal. */
  handleKeypress(name: string, ctrl: boolean): void {
    if (ctrl && name === "c") {
      this.stop();
      return;
    }
    switch (name) {
      case "up":
        this.scroll(-1);
        return;
      case "down":
        this.scroll(1);
        return;
      case "pageup":
        this.scroll(-this.#lastVisibleCount);
        return;
      case "pagedown":
        this.scroll(this.#lastVisibleCount);
        return;
      case "home":
        this.#manual = true;
        this.#windowOffset = 0;
        this.#redraw();
        return;
      case "end":
        this.#manual = true;
        this.#windowOffset = Math.max(0, this.#packageCount() - this.#lastVisibleCount);
        this.#redraw();
        return;
      case "f":
        this.follow(this.#options.workspace.packages[this.#activeIndex]?.name ?? "");
        return;
      default:
        return;
    }
  }

  #packageCount(): number {
    return this.#options.workspace.packages.length;
  }

  /**
   * Give the terminal back when the dashboard can no longer paint (too short,
   * or no packages). Keeping a scroll region whose start is below the new
   * height would let the next log write land outside it.
   */
  // [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
  #releaseFixedRegion(): void {
    if (this.#headerRows === 0) return;
    this.#options.write(
      `${SAVE_CURSOR}${RESET_SCROLL_REGION}${RESTORE_CURSOR}${SHOW_CURSOR}`,
    );
    this.#headerRows = 0;
    this.#regionRows = 0;
    this.#regionColumns = 0;
    this.#cleared = false;
  }

  #readSnapshot(): ProgressSnapshot {
    try {
      this.#snapshot = this.#options.readSnapshot();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      (this.#options.log ?? console.error)(`[conver] progress read failed: ${detail}`);
    }
    return this.#snapshot ?? { packages: [] };
  }

  #redraw(): void {
    if (!this.#options.isTty || !this.#running) return;
    const snapshot = this.#readSnapshot();
    const packages = snapshot.packages;
    const { columns, rows } = this.#options.terminalSize();
    const budget = computeFixedBudget(rows, packages.length);
    if (budget.fixedRows === 0 || packages.length === 0) {
      this.#releaseFixedRegion();
      return;
    }

    this.#lastVisibleCount = Math.max(1, budget.packageRows);
    const start = budget.packageRows === 0
      ? 0
      : this.#manual
        ? clamp(
            this.#windowOffset,
            0,
            Math.max(0, packages.length - budget.packageRows),
          )
        : clamp(
            this.#activeIndex - Math.floor(budget.packageRows / 2),
            0,
            Math.max(0, packages.length - budget.packageRows),
          );
    const end = budget.packageRows === 0
      ? 0
      : Math.min(packages.length, start + budget.packageRows);

    const visible = packages.slice(start, end);
    const workspaceNames = this.#options.workspace.packages.map((entry) => entry.name);
    const shortNames = stripCommonPrefix(workspaceNames).names;
    const activityIndex = this.#activity === null
      ? -1
      : workspaceNames.findIndex((name) => name === this.#activity?.packageName);
    const activityShortName = activityIndex >= 0 ? shortNames[activityIndex] : undefined;
    const header = renderHeader(
      { packages: visible },
      {
        terminalWidth: columns,
        color: true,
        shortNames: shortNames.slice(start, end),
      },
    );
    const indicator = (text: string): string =>
      chalk.bgHex(HEADER_BACKGROUND)(padTo(columns, text));
    // The budget reserves two indicator rows. Paint both whenever it does, so
    // the fixed region keeps one height while scrolling and the scroll region
    // always starts at fixedRows + 1.
    const upLine = indicator(
      start > 0 ? `↑ ${start} more` : "",
    );
    const downLine = indicator(
      end < packages.length ? `↓ ${packages.length - end} more` : "",
    );
    const lines = [
      renderActivityLine(this.#activity, {
        terminalWidth: columns,
        color: true,
        shortPackageName: activityShortName,
      }),
      ...(budget.indicatorRows > 0 ? [upLine] : []),
      ...header,
      ...(budget.indicatorRows > 0 ? [downLine] : []),
    ];

    let chunk = "";
    // The dashboard is painted over whatever the shell left on screen. Clearing
    // once drops the terminal's inherited soft-wrap state; otherwise two header
    // rows can remain one logical line (iTerm2) and stdout appears on the header.
    if (!this.#cleared) {
      chunk += CLEAR_SCREEN;
      this.#cleared = true;
    }

    const previousHeaderRows = this.#headerRows;
    const geometryChanged =
      lines.length !== this.#headerRows ||
      rows !== this.#regionRows ||
      columns !== this.#regionColumns;
    if (geometryChanged) {
      chunk += `\x1b[${lines.length + 1};${rows}r`;
      chunk += `\x1b[${lines.length + 1};1H`;
      this.#headerRows = lines.length;
      this.#regionRows = rows;
      this.#regionColumns = columns;
    }

    // Save the cursor inside the log region before any absolute painting, so
    // the restore below leaves the next stdout write below the header.
    chunk += SAVE_CURSOR;
    if (geometryChanged) {
      // Rows that used to hold fixed rows are now log rows. Erase them so a
      // shrunken header cannot leave navy or green remnants behind the stream.
      const staleLast = Math.min(previousHeaderRows, rows);
      for (let row = lines.length + 1; row <= staleLast; row += 1) {
        chunk += `\x1b[${row};1H${ERASE_LINE}`;
      }
    }
    lines.forEach((line, index) => {
      chunk += `\x1b[${index + 1};1H${ERASE_LINE}${padTo(columns, line)}`;
    });
    chunk += RESTORE_CURSOR;
    this.#options.write(chunk);
  }
}
