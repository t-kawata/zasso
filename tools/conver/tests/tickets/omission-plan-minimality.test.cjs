'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * PX-443 C003 — the planner emits the contiguous partition minimum, never one
 * ticket per contract, and the same input is idempotent.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { planOmissionTickets } = require('../../.claude/scripts/tickets/apply-omission-findings.js');

const BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 15,
  testUnit: 18,
  testIntegration: 6,
  modules: 4,
});

/** A canonical clause key. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function clauseKey(contractId, index) {
  return `clause|pkg-alpha|${contractId}|precondition|${String(index).padStart(16, '0')}`;
}

/** An inventory whose every contract has the three required elements. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function inventoryOf(count) {
  const clauses = [];
  for (let index = 1; index <= count; index += 1) {
    const contractId = 'C' + String(index).padStart(3, '0');
    for (const element of ['precondition', 'postcondition', 'invariant']) {
      clauses.push({
        key: `clause|pkg-alpha|${contractId}|${element}|${String(index * 3 + element.length).padStart(16, '0')}`,
        contractId,
        element,
        text: `${contractId} ${element}`,
        owners: ['P1-1'],
        source: 'N0001->N0002',
      });
    }
  }
  return { scope: 'pkg-alpha', clauses };
}

/** One implementation blocker per contract. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function blockersOf(count, blockingClass = 'test-missing') {
  return Array.from({ length: count }, (_, index) => {
    const contractId = 'C' + String(index + 1).padStart(3, '0');
    const key = clauseKey(contractId, index);
    return {
      key,
      clauses: [key],
      contractId,
      group: 'pkg-alpha|' + contractId,
      owner: 'P1-1',
      blockingClass,
    };
  });
}

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function plan(blockers, ticketsData = { phases: [] }, inventory = inventoryOf(blockers.length)) {
  return planOmissionTickets({
    remainder: blockers,
    inventory,
    ticketsData,
    phases: ticketsData.phases ?? [],
    budget: BUDGET,
    context: {},
  });
}

test('C003: 19 implementation clauses become 2 budget-bounded tickets', () => {
  const result = plan(blockersOf(19));

  assert.equal(result.created.length, 2);
  assert.deepEqual(result.created.map((ticket) => ticket.testUnit.length), [18, 1]);
  assert.equal(result.created.every((ticket) => ticket.nodeIds.length === 0), true);
  assert.equal(result.created.every((ticket) => ticket.contracts.length > 0), true);
});

test('C003: 57 implementation clauses become 4 budget-bounded tickets', () => {
  const result = plan(blockersOf(57));

  assert.equal(result.created.length, 4);
  assert.equal(result.created.reduce((total, ticket) => total + ticket.testUnit.length, 0), 57);
  assert.equal(result.created.every((ticket) => ticket.testUnit.length <= BUDGET.testUnit), true);
});

test('C003: proof repair and classification create no tickets', () => {
  const blockers = [
    ...blockersOf(3, 'proof-missing'),
    ...blockersOf(2, 'unclassified'),
  ];

  const result = plan(blockers);

  assert.equal(result.created.length, 0);
  assert.equal(result.repairs.length, 3);
  assert.equal(result.classifications.length, 2);
});

test('C003: the same plan twice creates zero new tickets', () => {
  const first = plan(blockersOf(19));
  const second = plan(blockersOf(19), first.ticketsData);

  assert.equal(first.created.length, 2);
  assert.equal(second.created.length, 0);
  assert.equal(second.reusedTickets, 2);
});

test('C003: an unprojectable contract becomes a named repair, never a dropped atom', () => {
  const inventory = inventoryOf(2);
  const blockers = blockersOf(2);
  inventory.clauses = inventory.clauses.filter((clause) => clause.contractId !== 'C002');

  const result = plan(blockers, { phases: [] }, inventory);

  assert.equal(result.created.length, 1);
  assert.equal(result.unprojectable.length, 1);
  assert.equal(result.unprojectable[0].contractId, 'C002');
});
