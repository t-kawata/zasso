// layout.ts — deterministic, aligned header lines for the progress dashboard.
//
// One row per package, that package's own phases in ascending id order, and a
// right-aligned percent. Phases of one row are adjacent, separated by a single
// space; only the percent column is aligned across rows. The renderer is pure:
// it receives a snapshot and returns strings. Color is optional so tests can
// assert the exact text without ANSI noise.
import chalk from "chalk";
import type { ProgressPackage, ProgressPhase, ProgressSnapshot } from "./model.js";
import { packagePercent, symbolForStatus } from "./model.js";
import { stripCommonPrefix } from "./short-name.js";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export interface HeaderOptions {
  terminalWidth: number;
  color: boolean;
}

export const HEADER_BACKGROUND = "#0b1f3a";
/** Dark red for status marks: visibly red on the navy header without glaring. */
export const STATUS_SYMBOL_RED = "#d32f2f";
const PALE_YELLOW = "#f5e6a8";
const NAME_GAP = "  ";
const PERCENT_WIDTH = 4;
const STATUS_SYMBOLS = new Set(["x", "_", "|", "/"]);

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

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}…`;
}

interface PhaseBlock {
  plain: string;
  colored: string;
}

/**
 * Return one package's own phases, ordered by id. Absent phases are not
 * fabricated: padding a block to a sibling package's width is what broke the
 * single-space contract between phases.
 */
function phaseBlocks(packageEntry: ProgressPackage): PhaseBlock[] {
  return [...packageEntry.phases]
    .sort((left, right) => left.id - right.id)
    .map((phase) => ({ plain: phasePlain(phase), colored: phaseColored(phase) }));
}

/** Visible width of the phase area: blocks plus one separator between them. */
function phaseAreaWidth(blocks: readonly PhaseBlock[]): number {
  if (blocks.length === 0) return 0;
  return blocks.reduce((sum, block) => sum + block.plain.length, 0) + blocks.length - 1;
}

/**
 * Render one row's content to exactly `contentWidth` columns. The percent
 * suffix is appended by the caller, so an omitted phase marker can never
 * consume the percent column.
 */
function renderRowContent(
  name: string,
  nameWidth: number,
  blocks: readonly PhaseBlock[],
  contentWidth: number,
  color: boolean,
): string {
  const nameField = `${name.padEnd(nameWidth)}${NAME_GAP}`;
  if (nameField.length > contentWidth) {
    // A very narrow terminal cannot show both the name gap and phases. Keep
    // the percent column by trimming only the name.
    const clippedName = truncate(name, contentWidth);
    return clippedName + " ".repeat(Math.max(0, contentWidth - clippedName.length));
  }

  const fitted: PhaseBlock[] = [];
  let used = nameField.length;
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

  let content = nameField;
  if (fitted.length > 0) {
    content += fitted.map((block) => (color ? block.colored : block.plain)).join(" ");
  }
  if (omitted) {
    const markerText = fitted.length === 0 ? "…" : " …";
    if (used + markerText.length <= contentWidth) {
      content += markerText;
      used += markerText.length;
    } else {
      // A silent drop is worse than a compact marker. Reclaim the last phase
      // if necessary and attach the marker directly.
      while (fitted.length > 0 && used + 1 > contentWidth) {
        const removed = fitted.pop()!;
        const separatorWidth = fitted.length === 0 ? 0 : 1;
        used -= separatorWidth + removed.plain.length;
      }
      content = nameField;
      if (fitted.length > 0) {
        content += fitted.map((block) => (color ? block.colored : block.plain)).join(" ");
      }
      if (used + 1 <= contentWidth) {
        content += "…";
        used += 1;
      } else {
        content = `${content.slice(0, Math.max(0, contentWidth - 1))}…`;
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

  const short = stripCommonPrefix(snapshot.packages.map((entry) => entry.name));
  const nameWidth = Math.max(...short.names.map((name) => name.length));

  const rows = snapshot.packages.map((packageEntry, index) => {
    const name = short.names[index] ?? packageEntry.name;
    const blocks = phaseBlocks(packageEntry);
    const percent = `${String(packagePercent(packageEntry)).padStart(PERCENT_WIDTH)}%`;
    return {
      name,
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
    const content = renderRowContent(
      row.name,
      nameWidth,
      row.blocks,
      contentWidth,
      options.color,
    );
    const line = `${content} ${row.percent}`;
    if (!options.color) return line;
    const backgroundPadding = Math.max(
      0,
      options.terminalWidth - (contentWidth + 1 + row.percent.length),
    );
    return chalk.bgHex(HEADER_BACKGROUND)(line + " ".repeat(backgroundPadding));
  });
}
