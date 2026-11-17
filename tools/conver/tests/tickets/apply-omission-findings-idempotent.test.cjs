'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C003/C004 — deterministic, idempotent ticket planning.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { planOmissionTickets } = require('../../.claude/scripts/tickets/apply-omission-findings.js');

const KEY = 'clause|pkg-alpha|C001|precondition|abcdef0123456789';
const GROUP = 'pkg-alpha|C001';

/** A ticket set with a completed root and a live clone. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function ticketsData() {
  return {
    phases: [
      { id: 1, tickets: [{ id: 1, phaseId: 1, status: 'reviewed', contracts: [] }] },
      { id: 2, tickets: [{ id: 1, phaseId: 2, status: 'R6', originalTicketKey: 'P1-1', contracts: [] }] },
      { id: 3, tickets: [{ id: 2, phaseId: 3, status: 'todo', originalTicketKey: 'P2-1', contracts: [] }] },
    ],
  };
}

/** One canonical clause in the remainder. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function remainderOf() {
  return [{ key: KEY, contractId: 'C001', element: 'precondition', group: GROUP, owner: 'P1-1' }];
}

test('C003: a live open ticket that owns the same contract is reused', () => {
  const data = {
    phases: [
      { id: 1, tickets: [{ id: 1, phaseId: 1, status: 'reviewed', contracts: [] }] },
      { id: 4, tickets: [{ id: 2, phaseId: 4, status: 'todo', originalTicketKey: 'P1-1', contracts: [{ id: 'C001' }] }] },
    ],
  };
  const plan = planOmissionTickets({ remainder: [{ key: KEY, contractId: 'C001', element: 'precondition', group: GROUP, owner: 'P1-1' }], ticketsData: data, phases: data.phases });

  assert.equal(plan.created.length, 0);
  assert.equal(plan.reused[0], 'P4-2');
});

test('C003: an owner in the middle of a live clone chain is reused', () => {
  const data = {
    phases: [
      { id: 1, tickets: [{ id: 1, phaseId: 1, status: 'reviewed', contracts: [] }] },
      { id: 3, tickets: [{ id: 2, phaseId: 3, status: 'R7', originalTicketKey: 'P1-1', contracts: [] }] },
      { id: 4, tickets: [{ id: 2, phaseId: 4, status: 'todo', originalTicketKey: 'P3-2', contracts: [] }] },
    ],
  };
  const plan = planOmissionTickets({ remainder: [{ key: KEY, contractId: 'C001', element: 'precondition', group: GROUP, owner: 'P3-2' }], ticketsData: data, phases: data.phases });

  assert.equal(plan.created.length, 0);
  assert.equal(plan.reused[0], 'P4-2');
});

test('C004: all clauses of one group reuse the first owner chosen for the group', () => {
  const data = { phases: [{ id: 1, tickets: [{ id: 1, phaseId: 1, status: 'reviewed', contracts: [] }] }] };
  const remainder = [
    { key: KEY, contractId: 'C001', element: 'precondition', group: GROUP, owner: 'P1-1' },
    { key: KEY + '-post', contractId: 'C001', element: 'postcondition', group: GROUP, owner: 'P9-9' },
  ];
  const plan = planOmissionTickets({ remainder, ticketsData: data, phases: data.phases });

  assert.equal(plan.created.length, 1);
  assert.equal(plan.reusedTickets, 1);
});

test('C003: a live open descendant is reused, never cloned again', () => {
  const plan = planOmissionTickets({ remainder: remainderOf(), ticketsData: ticketsData(), phases: ticketsData().phases });

  assert.equal(plan.created.length, 0);
  assert.equal(plan.reusedTickets, 1);
  assert.equal(plan.phasesCreated, 0);
  assert.equal(['P2-1', 'P3-2'].includes(plan.reused[0]), true);
});

test('C004: a second identical run creates zero tickets and zero phases', () => {
  const first = planOmissionTickets({ remainder: remainderOf(), ticketsData: { phases: [{ id: 1, tickets: [{ id: 1, phaseId: 1, status: 'reviewed', contracts: [] }] }] }, phases: [] });
  assert.equal(first.created.length, 1);
  assert.equal(first.phasesCreated, 1);

  const second = planOmissionTickets({ remainder: remainderOf(), ticketsData: first.ticketsData, phases: first.phases });
  assert.equal(second.created.length, 0);
  assert.equal(second.phasesCreated, 0);
  assert.equal(second.reusedTickets, 1);
});

test('C004: a created ticket carries omissionStableKey, rootTicketKey and a deterministic title', () => {
  const plan = planOmissionTickets({ remainder: remainderOf(), ticketsData: { phases: [{ id: 1, tickets: [{ id: 1, phaseId: 1, status: 'reviewed', contracts: [] }] }] }, phases: [] });
  const ticket = plan.created[0];

  assert.equal(ticket.omissionStableKey, GROUP);
  assert.equal(ticket.rootTicketKey, 'P1-1');
  assert.equal(/20\d\d|P\d+-\d+/.test(ticket.title), false);
});

test('C004: a finding without a canonical clause key creates no ticket', () => {
  const plan = planOmissionTickets({ remainder: [{ group: GROUP, owner: 'P1-1' }], ticketsData: ticketsData(), phases: ticketsData().phases });

  assert.equal(plan.created.length, 0);
  assert.equal(plan.backlog.length, 1);
});
