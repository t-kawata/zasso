'use strict';

// @verifies C001
// [::TICKET::] PX-444: a multi-ticket omission phase names its budget split.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { planOmissionTickets } = require('../../.claude/scripts/tickets/apply-omission-findings.js');
const {
  collectPartitionFindings,
  WORKLOAD_COMPONENTS,
} = require('../../.claude/scripts/tickets/lib/ticket-workload.js');

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

/** Plan the standard fixture under one budget. */
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function plan(budget = zeroBudget()) {
  return planOmissionTickets({
    remainder: unprovenRemainder(),
    inventory: contractInventory(),
    ticketsData: { phases: [] },
    budget,
    components: WORKLOAD_COMPONENTS,
    context: {},
  });
}

test('C001: every ticket in a multi-ticket phase records the budget split', () => {
  const result = plan();

  assert.ok(result.created.length > 1, 'the zero budget forces more than one ticket');
  for (const ticket of result.created) {
    assert.equal(ticket.splitReason, 'budget', `${ticket.title} records why it is separate`);
  }
});

test('C001: the planned multi-ticket phase passes the partition gate', () => {
  const result = plan();
  const findings = collectPartitionFindings(result.phases[0], zeroBudget(), {}, {
    components: WORKLOAD_COMPONENTS,
  });

  assert.deepEqual(findings, []);
});

test('C001: a single-ticket phase carries no splitReason', () => {
  const result = plan(SINGLE_TICKET_BUDGET);

  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].splitReason, undefined);
});
