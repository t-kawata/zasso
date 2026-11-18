'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * PX-443 C003/C004 — the doors-shaped remainder (149 clauses, 57 contracts) is
 * planned as a small measured set, and every clause reaches a named sink.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { blockerEntriesOf } = require('../../.claude/scripts/tickets/lib/blocker-plan.js');
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

/** 57 contracts, 149 clauses. The last 22 contracts lack an invariant. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function fixture() {
  const clauses = [];
  const inventoryClauses = [];
  for (let index = 1; index <= 57; index += 1) {
    const contractId = 'C' + String(index).padStart(3, '0');
    const elementCount = index <= 35 ? 3 : 2;
    for (let elementIndex = 0; elementIndex < elementCount; elementIndex += 1) {
      const element = ['precondition', 'postcondition', 'invariant'][elementIndex];
      const key = `clause|pjsip-prebuilt|${contractId}|${element}|${String(index * 3 + elementIndex).padStart(16, '0')}`;
      clauses.push({ key, contractId, status: 'TEST_MISSING' });
      inventoryClauses.push({ key, contractId, element, text: `${contractId} ${element}`, owners: ['P0-1'], source: 'N0001->N0002' });
    }
  }
  return { coverage: { clauses }, inventory: { scope: 'pjsip-prebuilt', clauses: inventoryClauses } };
}

test('C003/C004: 149 clauses across 57 contracts become few measured tickets plus named repairs', () => {
  const { coverage, inventory } = fixture();
  const remainder = blockerEntriesOf({ inventory, coverage });
  const plan = planOmissionTickets({ remainder, inventory, ticketsData: { phases: [] }, phases: [], budget: BUDGET, context: {} });

  assert.equal(remainder.length, 57);
  assert.equal(remainder.flatMap((entry) => entry.clauses).length, 149);

  // 35 contracts have all three elements (105 clauses); 22 lack the invariant and
  // become named repairs rather than guessed contracts.
  assert.equal(plan.unprojectable.length, 22);
  assert.deepEqual(plan.created.map((ticket) => ticket.testUnit.length), [18, 18, 18, 18, 18, 15]);
  assert.equal(plan.created.every((ticket) => ticket.testUnit.length > 0), true);
  assert.equal(plan.created.every((ticket) => ticket.testUnit.length <= BUDGET.testUnit), true);
  assert.equal(plan.created.every((ticket) => ticket.contracts.length > 0), true);
  assert.equal(plan.created.every((ticket) => ticket.nodeIds.length === 0), true);

  const ticketed = plan.created.flatMap((ticket) => ticket.omissionUnits.flatMap((unit) => unit.clauses));
  const repaired = plan.unprojectable.flatMap((entry) => entry.clauses);
  assert.equal(ticketed.length + repaired.length, 149);
  assert.ok(ticketed.length > 0);
});

test('C003: the same doors-shaped input twice creates zero new tickets', () => {
  const { coverage, inventory } = fixture();
  const remainder = blockerEntriesOf({ inventory, coverage });
  const first = planOmissionTickets({ remainder, inventory, ticketsData: { phases: [] }, phases: [], budget: BUDGET, context: {} });
  const second = planOmissionTickets({ remainder, inventory, ticketsData: first.ticketsData, phases: first.phases, budget: BUDGET, context: {} });

  assert.equal(first.created.length, 6);
  assert.equal(second.created.length, 0);
  assert.equal(second.reusedTickets, 6);
});
