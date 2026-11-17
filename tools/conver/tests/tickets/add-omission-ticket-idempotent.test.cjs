'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C003 — root owner resolution.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveRootTicketKey } = require('../../.claude/scripts/tickets/add-omission-ticket.js');

/** A three-link clone chain. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function ticketsData() {
  return {
    phases: [
      { id: 1, tickets: [{ id: 1, phaseId: 1, status: 'reviewed', originalTicketKey: null }] },
      { id: 2, tickets: [{ id: 1, phaseId: 2, status: 'R6', originalTicketKey: 'P1-1' }] },
      { id: 3, tickets: [{ id: 2, phaseId: 3, status: 'todo', originalTicketKey: 'P2-1' }] },
    ],
  };
}

test('C003: a clone chain resolves rootTicketKey to the earliest non-clone owner', () => {
  assert.equal(resolveRootTicketKey({ ticketKey: 'P3-2', ticketsData: ticketsData() }), 'P1-1');
});

test('C003: a cycle is bounded and returns a key from the cycle', () => {
  const data = { phases: [{ id: 1, tickets: [{ id: 1, phaseId: 1, status: 'todo', originalTicketKey: 'P2-1' }] }, { id: 2, tickets: [{ id: 1, phaseId: 2, status: 'todo', originalTicketKey: 'P1-1' }] }] };
  assert.equal(['P1-1', 'P2-1'].includes(resolveRootTicketKey({ ticketKey: 'P1-1', ticketsData: data })), true);
});

test('C003: a ticket without a clone link is its own root', () => {
  assert.equal(resolveRootTicketKey({ ticketKey: 'P1-1', ticketsData: ticketsData() }), 'P1-1');
});
