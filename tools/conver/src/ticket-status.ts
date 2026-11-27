// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
// ticket-status.ts — ticket status vocabulary shared by the loop and the tools.
//
// A ticket is terminal once it is reviewed or has reached a round status (R<n>).
// Keeping the predicate in one place prevents the loop, the progress display and
// the notifier from disagreeing about what "done" means.

const ROUND_STATUS_PATTERN = /^R[1-9]\d*$/;

/** The transient status /find-omissions sets while a ticket is being inspected. */
// [::TICKET::] P27-2 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-2 --for-spec --no-implementation-order`.
export const REMANDED_STATUS = "remanded";

/**
 * True when the status is terminal: "reviewed" or a round status ("R1", "R2", ...).
 * Any other value — including "remanded" and an unknown string — is not terminal.
 */
export function isTerminalStatus(status: string): boolean {
// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
// [::TICKET::] PX-403 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-403 --for-spec --no-implementation-order`.
  return status === "reviewed" || ROUND_STATUS_PATTERN.test(status);
}

/** The four statuses a one-step ticket command advances. */
const COMMAND_STATUSES: ReadonlySet<string> = new Set(["todo", "made", "planned", "done"]);

/**
 * True for every status the pipeline knows how to place.
 *
 * An unknown string is not a ticket the loop may guess about: it neither maps to a
 * command nor belongs to find. Keeping this predicate here lets the scheduler reject
 * it before any command is sent.
 */
export function isKnownTicketStatus(status: string): boolean {
  return isTerminalStatus(status) || status === REMANDED_STATUS || COMMAND_STATUSES.has(status);
}

/** Build the canonical key for a ticket: "PX-<id>" for phase -1, otherwise "P<phase>-<id>". */
export function ticketKeyOf(phaseId: number, id: number): string {
  return phaseId === -1 ? `PX-${id}` : `P${phaseId}-${id}`;
}
