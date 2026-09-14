/**
 * A module whose names reach consumers only through the entry point's re-export.
 *
 * The doc comment deliberately does not quote the re-export syntax: the
 * declaration pins that construct to the line that performs it, and a marker
 * quoted in prose would pin it here instead.
 */

/** The number the re-export test reads back through the entry point. */
export const ALPHA = 1;

/** A helper that is not re-exported, so it stays private to this module. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function untitled(): number {
  return ALPHA;
}

export function doubled(): number {
  return untitled() * 2;
}
