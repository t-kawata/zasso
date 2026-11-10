// next-action.ts — derive exactly one next command from the current Tickets.json.
//
// The loop never decides what to run from a remembered plan. Before every
// execution it reads the package's Tickets.json and asks this function. The
// derivation is deliberately total: every status either maps to one command,
// reaches a package boundary, or fails with a named error. Guessing a fallback
// would let the loop skip a ticket or a phase, which the strict order forbids.
import type { Ticket, TicketsJson } from "./tickets.js";
import { isTerminalStatus, ticketKeyOf } from "./ticket-status.js";

/** The four commands that advance one ticket through its phase pipeline. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export type CommandName =
  | "/make-ticket"
  | "/plan-ticket"
  | "/start-ticket"
  | "/review-ticket";

/** The single action the package loop must execute next. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export type NextAction =
  | {
      kind: "command";
      command: CommandName;
      ticketKey: string;
      phaseId: number;
      status: string;
    }
  | { kind: "resolve"; ticketKey: string }
  | { kind: "consolidate" }
  | { kind: "find" }
  | { kind: "complete" };

/** Per-package counters that are not represented in Tickets.json. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface PackageProgress {
  /** Reviewed tickets since the last resolve. */
  reviewedSinceResolve: number;
  /** Resolve cadence; 0 disables periodic resolve. */
  resolveEvery: number;
  /** True after /consolidate-stubs ran for the current ticket set. */
  consolidateDone: boolean;
  /** True after /find-omissions ran for the current ticket set. */
  findDone: boolean;
  /** Number of find executions in this package. */
  findRounds: number;
  /** Maximum find executions before the loop stops. */
  maxFindRounds: number;
  /** When true, find is skipped entirely. */
  noFind: boolean;
}

/** A ticket status that the strict mapping does not know how to advance. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export class InvalidTicketStatusError extends Error {
  constructor(
    readonly ticketKey: string,
    readonly status: string,
  ) {
    super(`Ticket ${ticketKey} has status "${status}", which has no next command`);
    this.name = "InvalidTicketStatusError";
  }
}

/** The find loop exceeded its bounded number of rounds. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export class FindRoundLimitError extends Error {
  constructor(
    readonly findRounds: number,
    readonly maxFindRounds: number,
  ) {
    super(
      `find ran ${findRounds} times, reaching the limit of ${maxFindRounds} rounds`,
    );
    this.name = "FindRoundLimitError";
  }
}

/** The status-to-command table. Every entry is a one-step advance. */
const COMMAND_FOR_STATUS: Readonly<Record<string, CommandName>> = Object.freeze({
  todo: "/make-ticket",
  made: "/plan-ticket",
  planned: "/start-ticket",
  done: "/review-ticket",
});

/**
 * Return the first ticket that is not terminal, in phase-array then
 * ticket-array order. This is the only ticket the loop may work on.
 */
export function firstNonTerminalTicket(
  data: TicketsJson,
): { phaseId: number; ticket: Ticket } | null {
  for (const phase of data.phases) {
    for (const ticket of phase.tickets) {
      if (!isTerminalStatus(ticket.status)) {
        return { phaseId: phase.id, ticket };
      }
    }
  }
  return null;
}

/** The key of the last ticket in array order, used to attribute a final resolve. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function lastTicketKey(data: TicketsJson): string {
  for (let phaseIndex = data.phases.length - 1; phaseIndex >= 0; phaseIndex--) {
    const phase = data.phases[phaseIndex];
    const lastTicket = phase.tickets[phase.tickets.length - 1];
    if (lastTicket !== undefined) {
      return ticketKeyOf(phase.id, lastTicket.id);
    }
  }
  return "";
}

/**
 * Derive the one action the package loop must execute next.
 *
 * Order of decisions:
 *   1. a pending resolve when the cadence is reached;
 *   2. the one-step command for the first non-terminal ticket;
 *   3. the package boundary: resolve, consolidate, find, complete.
 */
export function deriveNextAction(
  data: TicketsJson,
  progress: PackageProgress,
): NextAction {
  const first = firstNonTerminalTicket(data);

  if (first !== null) {
    const ticketKey = ticketKeyOf(first.phaseId, first.ticket.id);
    if (progress.reviewedSinceResolve > 0 && progress.resolveEvery > 0
      && progress.reviewedSinceResolve >= progress.resolveEvery) {
      return { kind: "resolve", ticketKey };
    }
    const command = COMMAND_FOR_STATUS[first.ticket.status];
    if (command === undefined) {
      throw new InvalidTicketStatusError(ticketKey, first.ticket.status);
    }
    return {
      kind: "command",
      command,
      ticketKey,
      phaseId: first.phaseId,
      status: first.ticket.status,
    };
  }

  if (progress.reviewedSinceResolve > 0 && progress.resolveEvery > 0) {
    return { kind: "resolve", ticketKey: lastTicketKey(data) };
  }
  if (!progress.consolidateDone) {
    return { kind: "consolidate" };
  }
  if (!progress.noFind && !progress.findDone) {
    if (progress.findRounds >= progress.maxFindRounds) {
      throw new FindRoundLimitError(progress.findRounds, progress.maxFindRounds);
    }
    return { kind: "find" };
  }
  return { kind: "complete" };
}
