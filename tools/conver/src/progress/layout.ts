// layout.ts — deterministic, aligned header lines for the progress dashboard.
//
// One row per package, that package's own phases in ascending id order, and a
// right-aligned percent. Phases of one row are adjacent, separated by a single
// space; only the percent column is aligned across rows. The renderer is pure:
// it receives a snapshot and returns strings. Color is optional so tests can
// assert the exact text without ANSI noise.
import chalk from "chalk";
import stringWidth from "string-width";
import type { CurrentActivity, ProgressPackage, ProgressPhase, ProgressSnapshot } from "./model.js";
import { packagePercent, symbolForStatus } from "./model.js";
import { stripCommonPrefix } from "./short-name.js";
import { sanitizeTerminalText } from "../display/terminal-text.js";

// [::TICKET::] PX-404, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-404|PX-449) --for-spec --no-implementation-order`.
export interface HeaderOptions {
  terminalWidth: number;
  color: boolean;
  /** Names supplied by the dashboard so rows and the NOW line agree. */
  shortNames?: readonly string[];
  /** Full package names selected with -P; their names render bold yellow. */
  highlightNames?: readonly string[];
}

export const HEADER_BACKGROUND = "#0b1f3a";
/** Dark red for status marks: visibly red on the navy header without glaring. */
export const STATUS_SYMBOL_RED = "#d32f2f";
/** Dark green for the NOW row: distinct from the navy package rows. */
export const ACTIVITY_BACKGROUND = "#14532d";
const PALE_YELLOW = "#f5e6a8";
const NAME_GAP = "  ";
const PERCENT_WIDTH = 4;
const STATUS_SYMBOLS = new Set(["x", "_", "|", "/"]);
const ACTIVITY_LABEL = "NOW:";
const ACTIVITY_IDLE = "NOW: idle";
const ELLIPSIS = "…";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function phaseLabel(phaseId: number): string {
  return phaseId === -1 ? "PX" : `P${phaseId}`;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function phasePlain(phase: ProgressPhase): string {
  const symbols = phase.tickets.map((ticket) => symbolForStatus(ticket)).join(" ");
  return `${phaseLabel(phase.id)} [ ${symbols} ]`;
}

// [::TICKET::] PX-404, PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-404|PX-408) --for-spec --no-implementation-order`.
function colorSymbol(symbol: string): string {
  if (/^\d+$/.test(symbol)) return chalk.white(symbol);
  if (STATUS_SYMBOLS.has(symbol)) return chalk.hex(STATUS_SYMBOL_RED)(symbol);
  return chalk.cyan(symbol);
}

// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
function phaseColored(phase: ProgressPhase): string {
  const symbols = phase.tickets
    .map((ticket) => colorSymbol(symbolForStatus(ticket)))
    .join(" ");
  return `${chalk.hex(PALE_YELLOW)(phaseLabel(phase.id))} [ ${symbols} ]`;
}

/** Visible columns of a string; wide characters count as two. */
export function visibleColumns(value: string): number {
  return stringWidth(value.replace(/\x1b\[[0-9;]*m/g, ""));
}

/** Options for the single fixed row that names the running command. */
// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
export interface ActivityLineOptions {
  terminalWidth: number;
  color: boolean;
  /** The workspace-wide short name of the active package. */
  shortPackageName?: string;
}

/**
 * Remove every escape and control character from data that will sit on the
 * fixed row. The shared log sanitizer keeps SGR so log text can be colored;
 * activity text is untrusted and must not change any terminal state.
 */
// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
function sanitizeActivityText(value: string): string {
  return sanitizeTerminalText(value)
    .replace(/\x1b\[[0-9;]*m/g, "")
    // C1 controls (0x80-0x9f) are single-byte CSI/OSC introducers on some
    // terminals even without ESC; they are never legitimate in a name.
    .replace(/[\u0080-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fit one line to `width` columns by code point, never splitting a surrogate. */
// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
function truncateToColumns(value: string, width: number): string {
  if (width <= 0) return "";
  if (visibleColumns(value) <= width) return value;
  const target = Math.max(0, width - 1);
  let kept = "";
  for (const character of value) {
    if (visibleColumns(kept + character) > target) break;
    kept += character;
  }
  return `${kept}${ELLIPSIS}`;
}

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
function padToColumns(value: string, width: number): string {
  const missing = width - visibleColumns(value);
  return missing > 0 ? value + " ".repeat(missing) : value;
}

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
function formatActivity(activity: CurrentActivity, shortPackageName?: string): string {
  const packageName = sanitizeActivityText(shortPackageName ?? activity.packageName);
  const command = sanitizeActivityText(activity.command);
  const parts = [ACTIVITY_LABEL, `[${packageName}]`];
  if (command !== "") parts.push(command);
  if (activity.ticketKey !== null) {
    const ticketKey = sanitizeActivityText(activity.ticketKey);
    if (ticketKey !== "") parts.push(ticketKey);
  }
  return parts.join(" ");
}

/**
 * Render the fixed NOW row. It is always one row: data is sanitized, truncated
 * by visible width and padded so the background covers the whole terminal.
 */
// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
export function renderActivityLine(
  activity: CurrentActivity | null,
  options: ActivityLineOptions,
): string {
  if (options.terminalWidth <= 0) return "";
  const text = activity === null
    ? ACTIVITY_IDLE
    : formatActivity(activity, options.shortPackageName);
  const fitted = padToColumns(
    truncateToColumns(text, options.terminalWidth),
    options.terminalWidth,
  );
  if (!options.color) return fitted;
  return chalk.bgHex(ACTIVITY_BACKGROUND)(chalk.white(fitted));
}

// [::TICKET::] PX-404, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-404|PX-449) --for-spec --no-implementation-order`.
function truncate(value: string, width: number): string {
  if (visibleColumns(value) <= width) return value;
  if (width <= 1) return Array.from(value).slice(0, Math.max(0, width)).join("");
  return `${truncateToColumns(value, width)}`;
}

interface PhaseBlock {
  plain: string;
  colored: string;
}

/**
 * The package's compact workspacify stage bracket, or null when it carries no tokens.
 *
 * The bracket is one block rather than ten, so the existing fitter drops it as a unit and
 * a partial bracket can never reach the screen.
 */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function stageBlock(packageEntry: ProgressPackage): PhaseBlock | null {
  const stages = packageEntry.stages;
  if (stages === undefined || stages.length === 0) return null;
  const text = `[${stages.join(",")}]`;
  return { plain: text, colored: text };
}

/**
 * Return one package's row blocks: the stage bracket first, then its own phases by id.
 *
 * Absent phases are not fabricated: padding a block to a sibling package's width is what
 * broke the single-space contract between phases. The bracket leads so it is fitted
 * before any phase block and the row keeps the pipeline context on a narrow terminal.
 */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function rowBlocks(packageEntry: ProgressPackage): PhaseBlock[] {
  const phases = [...packageEntry.phases]
    .sort((left, right) => left.id - right.id)
    .map((phase) => ({ plain: phasePlain(phase), colored: phaseColored(phase) }));
  const stage = stageBlock(packageEntry);
  return stage === null ? phases : [stage, ...phases];
}

/** Visible width of the phase area: blocks plus one separator between them. */
function phaseAreaWidth(blocks: readonly PhaseBlock[]): number {
  if (blocks.length === 0) return 0;
  return blocks.reduce((sum, block) => sum + block.plain.length, 0) + blocks.length - 1;
}

/** A -P selection matches a package by exact name or by substring. */
function isHighlighted(
  packageName: string,
  requested: readonly string[] | undefined,
): boolean {
  if (requested === undefined || requested.length === 0) return false;
  return requested.some(
    (name) => name.length > 0 && (packageName === name || packageName.includes(name)),
  );
}

/**
 * Render one row's content to exactly `contentWidth` columns. The percent
 * suffix is appended by the caller, so an omitted phase marker can never
 * consume the percent column.
 *
 * Width math uses the plain name field; the painted field differs only by
 * zero-width SGR codes, so highlighting can never shift the percent column.
 */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
interface RowContentInput {
  readonly name: string;
  readonly nameWidth: number;
  readonly blocks: readonly PhaseBlock[];
  readonly contentWidth: number;
  readonly color: boolean;
  readonly highlight: boolean;
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function renderRowContent(input: RowContentInput): string {
  const { name, nameWidth, blocks, contentWidth, color, highlight } = input;
  const namePadding = " ".repeat(Math.max(0, nameWidth - name.length));
  const nameFieldWidth = nameWidth + NAME_GAP.length;
  const paintName = (value: string): string =>
    color && highlight ? chalk.bold.yellow(value) : value;

  if (nameFieldWidth > contentWidth) {
    // A very narrow terminal cannot show both the name gap and phases. Keep
    // the percent column by trimming only the name.
    const clippedName = truncate(name, contentWidth);
    return paintName(clippedName) + " ".repeat(Math.max(0, contentWidth - clippedName.length));
  }

  const nameFieldPlain = `${name}${namePadding}${NAME_GAP}`;
  const nameFieldPainted = `${paintName(name)}${namePadding}${NAME_GAP}`;

  const fitted: PhaseBlock[] = [];
  let used = nameFieldWidth;
  let omitted = false;
  for (const block of blocks) {
    const separatorWidth = fitted.length === 0 ? 0 : 1;
    const blockWidth = separatorWidth + block.plain.length;
    if (used + blockWidth <= contentWidth) {
      fitted.push(block);
      used += blockWidth;
    } else {
      omitted = true;
      break;
    }
  }

  let content = nameFieldPainted;
  if (fitted.length > 0) {
    content += fitted.map((block) => (color ? block.colored : block.plain)).join(" ");
  }
  if (omitted) {
    const markerText = fitted.length === 0 ? "…" : " …";
    if (used + markerText.length <= contentWidth) {
      content += markerText;
      used += markerText.length;
    } else {
      // A silent drop is worse than a compact marker, so reclaim the last
      // phase when needed and attach the marker directly.
      while (fitted.length > 0 && used + 1 > contentWidth) {
        const removed = fitted.pop()!;
        const separatorWidth = fitted.length === 0 ? 0 : 1;
        used -= separatorWidth + removed.plain.length;
      }
      content = nameFieldPainted;
      if (fitted.length > 0) {
        content += fitted.map((block) => (color ? block.colored : block.plain)).join(" ");
      }
      if (used + 1 <= contentWidth) {
        content += "…";
        used += 1;
      } else {
        // The name field exactly fills the line. Drop its last column so the
        // omission marker still fits, painting the name prefix only.
        content = `${paintName(name)}${nameFieldPlain.slice(name.length, Math.max(0, contentWidth - 1))}…`;
        used = contentWidth;
      }
    }
  }
  return content + " ".repeat(Math.max(0, contentWidth - used));
}

/** Render the header; color mode adds ANSI and a dark-navy background. */
export function renderHeader(
  snapshot: ProgressSnapshot,
  options: HeaderOptions,
): string[] {
  if (snapshot.packages.length === 0) return [];

  const suppliedNames = options.shortNames;
  const short = suppliedNames !== undefined
    && suppliedNames.length === snapshot.packages.length
    ? { names: [...suppliedNames] }
    : stripCommonPrefix(snapshot.packages.map((entry) => entry.name));
  const nameWidth = Math.max(...short.names.map((name) => name.length));

  const rows = snapshot.packages.map((packageEntry, index) => {
    const name = short.names[index] ?? packageEntry.name;
    const blocks = rowBlocks(packageEntry);
    const percent = `${String(packagePercent(packageEntry)).padStart(PERCENT_WIDTH)}%`;
    return {
      name,
      highlight: isHighlighted(packageEntry.name, options.highlightNames),
      blocks,
      percent,
      contentLength:
        name.padEnd(nameWidth).length + NAME_GAP.length + phaseAreaWidth(blocks),
    };
  });

  const percentWidth = Math.max(...rows.map((row) => row.percent.length));
  const maximumContent = Math.max(...rows.map((row) => row.contentLength));
  // Reserve the percent column first. Content that exceeds this limit is
  // truncated by whole phase blocks, never by cutting the assembled line.
  const contentLimit = Math.max(1, options.terminalWidth - percentWidth - 1);
  const contentWidth = Math.min(maximumContent, contentLimit);

  return rows.map((row) => {
    const content = renderRowContent({
      name: row.name,
      nameWidth,
      blocks: row.blocks,
      contentWidth,
      color: options.color,
      highlight: row.highlight,
    });
    const line = `${content} ${row.percent}`;
    if (!options.color) return line;
    const backgroundPadding = Math.max(
      0,
      options.terminalWidth - (contentWidth + 1 + row.percent.length),
    );
    return chalk.bgHex(HEADER_BACKGROUND)(line + " ".repeat(backgroundPadding));
  });
}
