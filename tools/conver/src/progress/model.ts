// model.ts — the package/phase/ticket snapshot behind the fixed header.
//
// The dashboard polls every package Tickets.json. A malformed file is a
// transient read during a write, so the caller keeps the previous snapshot
// instead of losing the header; this module reports the failure with the
// package path so the caller can log it.
import { readFileSync } from "node:fs";
import type { WorkspaceModel } from "../workspace.js";
import { isTerminalStatus } from "../ticket-status.js";

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
export interface ProgressPackage {
  name: string;
  path: string;
  phases: ProgressPhase[];
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export interface ProgressSnapshot {
  packages: ProgressPackage[];
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
  return { packages };
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
