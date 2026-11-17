'use strict';

/**
 * PX-442 — one repair-status predicate.
 *
 * A repair record is open while it is pending or in progress. `unrepairable`
 * closes the repair record itself: its diagnostic ticket carries the remaining
 * work and is counted by the open-tickets gate. An unknown status is open by
 * default, so a new status can never silently disappear.
 */

const OPEN_REPAIR_STATUSES = Object.freeze(['pending', 'in_progress']);
const CLOSED_REPAIR_STATUSES = Object.freeze(['completed', 'false_positive', 'unrepairable']);

const OPEN_STATUS_SET = new Set(OPEN_REPAIR_STATUSES);
const CLOSED_STATUS_SET = new Set(CLOSED_REPAIR_STATUSES);

/** Whether one repair record still blocks the loop. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function isOpenRepair({ repair }) {
  const status = repair?.status;
  if (CLOSED_STATUS_SET.has(status)) return false;
  if (OPEN_STATUS_SET.has(status)) return true;
  return true;
}

/** The status of a ticket in the ticket set, or null when it is absent. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function ticketStatusOf({ ticketsData, ticketKey }) {
  if (typeof ticketKey !== 'string' || ticketKey.length === 0) return null;
  for (const phase of ticketsData?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const key = phase.id === -1 ? 'PX-' + String(ticket.id) : 'P' + String(phase.id) + '-' + String(ticket.id);
      if (key === ticketKey) return ticket.status ?? 'todo';
    }
  }
  return null;
}

module.exports = {
  CLOSED_REPAIR_STATUSES,
  OPEN_REPAIR_STATUSES,
  isOpenRepair,
  ticketStatusOf,
};
