// dashboard.ts — the fixed progress header above the streaming log.
//
// The header uses DECSTBM: rows 1..N are fixed, the log scrolls below. Writes
// are composed into one string per redraw so a timer tick cannot interleave
// with a log line. Non-TTY output is untouched; scrolling and automatic follow
// are caller-controlled.
import type { WorkspaceModel } from "../workspace.js";
import type { ProgressSnapshot } from "./model.js";
import chalk from "chalk";
import { HEADER_BACKGROUND, renderHeader } from "./layout.js";

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
const SAVE_CURSOR = "\x1b7";
const RESTORE_CURSOR = "\x1b8";
const RESET_SCROLL_REGION = "\x1b[r";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_SCREEN = "\x1b[1;1H\x1b[2J";
const ERASE_LINE = "\x1b[2K";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function visibleLength(value: string): number {
  return value.replace(/\x1b\[[0-9;]*m/g, "").length;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function padTo(columns: number, line: string): string {
  const width = visibleLength(line);
  return width >= columns ? line : line + " ".repeat(columns - width);
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
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
    const maximumHeaderRows = Math.max(0, Math.min(rows - 2, rows - LOG_MIN_ROWS));
    if (maximumHeaderRows <= 0 || packages.length === 0) return;

    const capacity = Math.min(packages.length, maximumHeaderRows);
    const needsIndicators = packages.length > capacity;
    const visibleCount = Math.max(1, capacity - (needsIndicators ? 2 : 0));
    this.#lastVisibleCount = visibleCount;
    const maximumStart = Math.max(0, packages.length - visibleCount);
    const start = this.#manual
      ? clamp(this.#windowOffset, 0, maximumStart)
      : clamp(this.#activeIndex - Math.floor(visibleCount / 2), 0, maximumStart);
    const end = Math.min(packages.length, start + visibleCount);

    const visible = packages.slice(start, end);
    const header = renderHeader({ packages: visible }, { terminalWidth: columns, color: true });
    const indicator = (text: string): string =>
      chalk.bgHex(HEADER_BACKGROUND)(padTo(columns, text));
    const lines = [
      ...(start > 0 ? [indicator(`↑ ${start} more`)] : []),
      ...header,
      ...(end < packages.length ? [indicator(`↓ ${packages.length - end} more`)] : []),
    ];
    if (lines.length === 0) return;

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
      // Rows that used to hold header lines are now log rows. Erase them so a
      // shrunken header cannot leave navy remnants behind the stream.
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
