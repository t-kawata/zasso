/**
 * Read a package's ticket ledger and name each ticket as one visible token.
 *
 * The ledger is the directory's own `Tickets.json`, the same file `split-to-tickets`
 * writes and `list-phases-and-tickets.js` reorders. This module reads it without ever
 * writing it: the order view is a reading surface, so the PX-first write belongs to the
 * listing command alone.
 *
 * The token vocabulary follows `list-phases-and-tickets.js` except todo, which renders
 * as a dot here because a space inside the bracket strip would be invisible.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TICKETS_FILE_NAME } from './workspace.mjs';

/** The one-character token each base status prints. `todo` is the view's own spelling. */
export const TICKET_MARKS = Object.freeze({
  todo: '.',
  made: '_',
  planned: '|',
  done: '/',
  reviewed: 'x',
  remanded: '!',
});

/** A ticket deferred to the next round prints this arrow instead of its status. */
export const NEXT_ROUND_MARK = '→';

/** Round-aware statuses record a completed past round; they keep their round number. */
const ROUND_STATUS = /^R[1-9]\d*$/;

/** Whether a status means the ticket has been reviewed, including a past round. */
// [::TICKET::] PX-393 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-393 --for-spec --no-implementation-order`.
export function isReviewedStatus(status) {
  return status === 'reviewed' || ROUND_STATUS.test(status ?? '');
}

/** The token a ticket contributes to the bracket strip. */
export function ticketTokenOf(ticket) {
  if (ticket?.forNextRound === true) return NEXT_ROUND_MARK;
  const status = ticket?.status;
  if (ROUND_STATUS.test(status ?? '')) return status;
  return TICKET_MARKS[status] ?? TICKET_MARKS.todo;
}

/** Every ticket of a document, flattened in phase and ticket order. */
export function flattenTickets(document) {
  return (document?.phases ?? []).flatMap((phase) =>
    (phase?.tickets ?? []).map((ticket) => ({
      ...ticket,
      phaseId: ticket.phaseId ?? phase.id,
    })));
}

/**
 * The ledger of one document, or null when the document itself is absent.
 *
 * A document with no phases is a zero-ticket ledger, not an absent one: the file exists
 * and the renderer can say `0/0` without inventing a ticket.
 */
export function readTicketLedger(document) {
  if (document === null || document === undefined) return null;
  const tickets = flattenTickets(document);
  return {
    tokens: tickets.map(ticketTokenOf),
    reviewed: tickets.filter((ticket) => isReviewedStatus(ticket.status)).length,
    total: tickets.length,
  };
}

/**
 * Read one package's Tickets.json, or null when the file is absent or unreadable.
 *
 * A malformed ledger is treated as absent rather than as zero: printing `0/0` for a
 * file whose contents cannot be read would state a count the file never carried.
 */
export function loadTicketsDocument({ root, packagePath }) {
  const path = join(root, packagePath, TICKETS_FILE_NAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
