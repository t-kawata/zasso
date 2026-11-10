// layout.ts — deterministic, aligned header lines for the progress dashboard.
//
// One row per package, one fixed column per phase id, and a right-aligned
// percent. The renderer is pure: it receives a snapshot and returns strings.
// Color is optional so tests can assert the exact text without ANSI noise.
import chalk from "chalk";
import type { ProgressPackage, ProgressSnapshot } from "./model.js";
import { packagePercent, symbolForStatus } from "./model.js";
import { stripCommonPrefix } from "./short-name.js";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export interface HeaderOptions {
  terminalWidth: number;
  color: boolean;
}

export const HEADER_BACKGROUND = "#0b1f3a";
const PALE_YELLOW = "#f5e6a8";
const NAME_GAP = "  ";
const PERCENT_WIDTH = 4;

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function phaseLabel(phaseId: number): string {
  return phaseId === -1 ? "PX" : `P${phaseId}`;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function phasePlain(packageEntry: ProgressPackage, phaseId: number): string {
  const phase = packageEntry.phases.find((candidate) => candidate.id === phaseId);
  if (phase === undefined) return "";
  const symbols = phase.tickets.map((ticket) => symbolForStatus(ticket)).join(" ");
  return `${phaseLabel(phaseId)} [ ${symbols} ]`;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function phaseColored(packageEntry: ProgressPackage, phaseId: number): string {
  const phase = packageEntry.phases.find((candidate) => candidate.id === phaseId);
  if (phase === undefined) return "";
  const symbols = phase.tickets
    .map((ticket) => {
      const symbol = symbolForStatus(ticket);
      return /^\d+$/.test(symbol) ? chalk.white(symbol) : chalk.cyan(symbol);
    })
    .join(" ");
  return `${chalk.hex(PALE_YELLOW)(phaseLabel(phaseId))} [ ${symbols} ]`;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}…`;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function padToWidth(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

/** Render the header; color mode adds ANSI and a dark-navy background. */
export function renderHeader(
  snapshot: ProgressSnapshot,
  options: HeaderOptions,
): string[] {
  if (snapshot.packages.length === 0) return [];

  const short = stripCommonPrefix(snapshot.packages.map((entry) => entry.name));
  const nameWidth = Math.max(...short.names.map((name) => name.length));

  const phaseIds: number[] = [];
  for (const packageEntry of snapshot.packages) {
    for (const phase of packageEntry.phases) {
      if (!phaseIds.includes(phase.id)) phaseIds.push(phase.id);
    }
  }

  const blockWidths = phaseIds.map((phaseId) =>
    Math.max(...snapshot.packages.map((entry) => phasePlain(entry, phaseId).length)),
  );

  return snapshot.packages.map((packageEntry, index) => {
    const name = short.names[index] ?? packageEntry.name;
    const percent = `${String(packagePercent(packageEntry)).padStart(PERCENT_WIDTH)}%`;

    const blocksPlain = phaseIds.map((phaseId, blockIndex) =>
      padToWidth(phasePlain(packageEntry, phaseId), blockWidths[blockIndex] ?? 0),
    );
    const blocksColored = phaseIds.map((phaseId, blockIndex) => {
      const plain = phasePlain(packageEntry, phaseId);
      const colored = phaseColored(packageEntry, phaseId);
      const padding = Math.max(0, (blockWidths[blockIndex] ?? plain.length) - plain.length);
      return colored + " ".repeat(padding);
    });

    const plainLine = truncate(
      `${name.padEnd(nameWidth)}${NAME_GAP}${blocksPlain.join(" ")} ${percent}`,
      options.terminalWidth,
    );

    if (!options.color) return plainLine;

    if (plainLine.length >= options.terminalWidth) {
      // A narrow terminal is already truncated; keep the line inside the
      // header area instead of letting colored tokens widen it again.
      return chalk.bgHex(HEADER_BACKGROUND)(plainLine);
    }
    const coloredLine = `${name.padEnd(nameWidth)}${NAME_GAP}${blocksColored.join(" ")} ${percent}`;
    return chalk.bgHex(HEADER_BACKGROUND)(coloredLine + " ".repeat(options.terminalWidth - plainLine.length));
  });
}
