/**
 * The public identity of a ticket.
 *
 * Ticket ids are numbered inside a phase, so the numeric id alone collides across phases:
 * P0-1 and P1-1 are different tickets. The public key already used by every command is
 * `PX-{id}` for the PX phase and `P{phaseId}-{id}` otherwise; this module is the one
 * spelling every producer and verifier uses.
 */

/** The PX phase id. */
const PX_PHASE_ID = -1;

/**
 * @param {{ id: number, phaseId?: number }} ticket
 * @returns {string}
 */
// [::TICKET::] PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function ticketIdentity(ticket) {
  const phaseId = ticket?.phaseId ?? PX_PHASE_ID;
  return phaseId === PX_PHASE_ID ? `PX-${ticket.id}` : `P${phaseId}-${ticket.id}`;
}

/**
 * @param {number} phaseId
 * @param {number} id
 * @returns {string}
 */
// [::TICKET::] PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function ticketIdentityOf(phaseId, id) {
  return phaseId === PX_PHASE_ID ? `PX-${id}` : `P${phaseId}-${id}`;
}

module.exports = { PX_PHASE_ID, ticketIdentity, ticketIdentityOf };
