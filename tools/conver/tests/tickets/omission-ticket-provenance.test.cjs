'use strict';

// @verifies C002
// @verifies C003
// [::TICKET::] PX-444: generated omission tickets carry their generic provenance.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { planOmissionTickets } = require('../../.claude/scripts/tickets/apply-omission-findings.js');
const { WORKLOAD_COMPONENTS } = require('../../.claude/scripts/tickets/lib/ticket-workload.js');

/** A budget that keeps all three clause atoms of one contract on one ticket. */
const SINGLE_TICKET_BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 15,
  testUnit: 24,
  testIntegration: 6,
  modules: 4,
  contractCount: 8,
});

/** One contract with one clause per required element. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function contractInventory() {
  return {
    scope: 'pkg',
    clauses: [
      { key: 'clause|pkg|C001|precondition|a', contractId: 'C001', element: 'precondition', text: 'pre', source: 'E1-E2' },
      { key: 'clause|pkg|C001|postcondition|b', contractId: 'C001', element: 'postcondition', text: 'post', source: 'E1-E2' },
      { key: 'clause|pkg|C001|invariant|c', contractId: 'C001', element: 'invariant', text: 'inv', source: 'E1-E2' },
    ],
  };
}

/** Three implementation clauses that cannot share one zero-budget ticket. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function unprovenRemainder() {
  return [{
    key: 'clause|pkg|C001|unmapped|a',
    group: 'pkg|C001',
    contractId: 'C001',
    blockingClass: 'unmapped',
    clauseClasses: [
      { key: 'clause|pkg|C001|precondition|a', blockingClass: 'unmapped' },
      { key: 'clause|pkg|C001|postcondition|b', blockingClass: 'unmapped' },
      { key: 'clause|pkg|C001|invariant|c', blockingClass: 'unmapped' },
    ],
  }];
}

/** Every measured component at zero, so each atom needs its own ticket. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function zeroBudget() {
  return Object.fromEntries(WORKLOAD_COMPONENTS.map((component) => [component, 0]));
}

/** Plan the standard fixture under one budget and remainder. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function plan({ budget = zeroBudget(), remainder = unprovenRemainder() } = {}) {
  return planOmissionTickets({
    remainder,
    inventory: contractInventory(),
    ticketsData: { phases: [] },
    budget,
    components: WORKLOAD_COMPONENTS,
    context: {},
  });
}

test('C002: every created ticket records a date-only creation date', () => {
  const result = plan();
  const today = new Date().toISOString().slice(0, 10);

  assert.ok(result.created.length > 0, 'the planner creates tickets');
  for (const ticket of result.created) {
    assert.match(ticket.created_at, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(ticket.created_at.length, 10);
    assert.equal(ticket.created_at, today);
  }
});

test('C003: notes names every affected contract, the source ticket and the resolution', () => {
  const result = plan();

  for (const ticket of result.created) {
    assert.ok(ticket.notes.includes('Affected contracts: C001'));
    assert.ok(ticket.notes.includes('Resolve by mapping each clause to a test'));
    assert.ok(ticket.notes.includes('no single source ticket'));
  }
});

test('C003: a single owner is named as the source ticket', () => {
  const owned = [{
    ...unprovenRemainder()[0],
    owner: 'P1-1',
    clauseClasses: [{ key: 'clause|pkg|C001|precondition|a', blockingClass: 'unmapped' }],
  }];
  const result = plan({ budget: SINGLE_TICKET_BUDGET, remainder: owned });

  assert.equal(result.created.length, 1);
  assert.ok(result.created[0].notes.includes('source ticket P1-1'));
});

test('C003: without a project note the note is exactly the generic template', () => {
  const result = plan();
  const expected = 'Omission ticket created by the /find-omissions v3 measured-coverage flow. '
    + 'Affected contracts: C001 (no single source ticket). '
    + 'Resolve by mapping each clause to a test, proving detection with a mutation, and re-running the coverage flow.';

  for (const ticket of result.created) {
    assert.equal(ticket.notes, expected);
  }
});
