// model.ts — the package/phase/ticket snapshot behind the fixed header.
//
// The dashboard polls every package Tickets.json. A malformed file is a
// transient read during a write, so the caller keeps the previous snapshot
// instead of losing the header; this module reports the failure with the
// package path so the caller can log it.
import { readFileSync } from "node:fs";
import type { WorkspaceModel } from "../workspace.js";
import { isTerminalStatus } from "../ticket-status.js";
import { createOnceReporter, readStageTokens } from "./stage-progress.js";

// A workspace that cannot yield the workspacify model leaves the header on ticket
// phases; the failure is reported once so a five-second poll cannot flood stderr.
const reportStageReadFailure = createOnceReporter((message) => {
  process.stderr.write(`[conver] stage progress read failed: ${message}\n`);
});

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export interface ProgressTicket {
  id: number;
  status: string;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export interface ProgressPhase {
  id: number;
  tickets: ProgressTicket[];
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
export interface ProgressPackage {
  name: string;
  path: string;
  phases: ProgressPhase[];
  /**
   * Compact workspacify stage tokens for the row, in FIELD_SEQUENCE order. Absent when
   * the workspacify model could not be read, which keeps the row on ticket phases alone.
   */
  stages?: readonly string[];
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export interface ProgressSnapshot {
  packages: ProgressPackage[];
}

/**
 * The command the runner is executing right now. Absent activity means the
 * loop is between commands (deriving the next action, waiting for a time
 * window, or finished), which the dashboard renders as `NOW: idle`.
 */
// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
export interface CurrentActivity {
  packageName: string;
  command: string;
  ticketKey: string | null;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export class ProgressReadError extends Error {
  constructor(
    readonly ticketsPath: string,
    cause: unknown,
  ) {
    super(
      `cannot read ${ticketsPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "ProgressReadError";
  }
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
type TicketDocument = {
  phases?: Array<{
    id?: unknown;
    tickets?: Array<{ id?: unknown; status?: unknown }>;
  }>;
};

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function defaultRead(ticketsPath: string): string {
  return readFileSync(ticketsPath, "utf-8");
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function parsePackage(name: string, path: string, text: string): ProgressPackage {
  const document = JSON.parse(text) as TicketDocument;
  if (!Array.isArray(document.phases)) {
    throw new Error("phases is not an array");
  }
  return {
    name,
    path,
    phases: document.phases
      .filter((phase): phase is { id: number; tickets?: Array<{ id?: unknown; status?: unknown }> } =>
        typeof phase.id === "number",
      )
      .map((phase) => ({
        id: phase.id,
        tickets: (phase.tickets ?? [])
          .filter((ticket): ticket is { id: number; status: string } =>
            typeof ticket.id === "number" && typeof ticket.status === "string",
          )
          .map((ticket) => ({ id: ticket.id, status: ticket.status })),
      })),
  };
}

/**
 * Read every package's Tickets.json in workspace order. The injected reader
 * makes the snapshot deterministic in tests.
 */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
export function readProgressSnapshot(
  workspace: WorkspaceModel,
  read: (ticketsPath: string) => string = defaultRead,
): ProgressSnapshot {
  const packages = workspace.packages.map((packageEntry) => {
    let text: string;
    try {
      text = read(packageEntry.ticketsPath);
    } catch (error) {
      throw new ProgressReadError(packageEntry.ticketsPath, error);
    }
    try {
      return parsePackage(packageEntry.name, packageEntry.path, text);
    } catch (error) {
      throw new ProgressReadError(packageEntry.ticketsPath, error);
    }
  });
  // The stage tokens live beside the ticket phases so every caller of the snapshot
  // gets one header shape; a workspace without a root simply carries no tokens.
  const tokens = typeof workspace.root === "string" && workspace.root.length > 0
    ? readStageTokens(workspace, reportStageReadFailure)
    : new Map<string, string[]>();
  return attachStageTokens({ packages }, tokens);
}

/**
 * Attach the stage tokens to each package by relative path, returning a new snapshot.
 *
 * Mapping by path and not by display name keeps a renamed package from inheriting
 * another package's stages. A package without tokens keeps its row exactly as it was.
 */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
export function attachStageTokens(
  snapshot: ProgressSnapshot,
  tokensByPath: ReadonlyMap<string, readonly string[]>,
): ProgressSnapshot {
  return {
    packages: snapshot.packages.map((packageEntry) => {
      const stages = tokensByPath.get(packageEntry.path);
      return stages === undefined ? packageEntry : { ...packageEntry, stages };
    }),
  };
}

/** Floor percent of reviewed tickets in one package. */
export function packagePercent(packageEntry: ProgressPackage): number {
  const tickets = packageEntry.phases.flatMap((phase) => phase.tickets);
  if (tickets.length === 0) return 0;
  const reviewed = tickets.filter((ticket) => isTerminalStatus(ticket.status)).length;
  return Math.floor((reviewed / tickets.length) * 100);
}

/** The header symbol for a ticket status; todo shows its number. */
export function symbolForStatus(ticket: ProgressTicket): string {
  if (isTerminalStatus(ticket.status)) return "x";
  switch (ticket.status) {
    case "made":
      return "_";
    case "planned":
      return "|";
    case "done":
      return "/";
    case "todo":
      return String(ticket.id);
    default:
      return "?";
  }
}
