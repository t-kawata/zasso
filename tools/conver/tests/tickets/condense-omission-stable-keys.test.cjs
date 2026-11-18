'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * PX-443 C004 — condensation keeps every absorbed omission unit and contract.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { condensePlan } = require('../../.claude/scripts/tickets/lib/ticket-partition.js');

const BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 15,
  testUnit: 100,
  testIntegration: 100,
  modules: 4,
});
const COMPONENTS = Object.freeze(['operations', 'sequenceSteps', 'ownedContracts', 'files', 'testUnit', 'testIntegration', 'modules']);

/** One omission ticket with a live unit payload. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function omissionTicket(id, group, unitKey) {
  return {
    id,
    phaseId: 2,
    status: 'todo',
    title: 'Omission remediation: ' + group,
    nodeIds: [],
    default_files: [],
    testUnit: ['omission-test:' + group],
    testIntegration: [],
    contracts: [{ id: 'C' + String(id).padStart(3, '0'), sourceEdge: 'N0001->N0002', precondition: 'a', postcondition: 'b', invariant: 'c' }],
    omissionUnitKey: unitKey,
    omissionUnitKeys: [unitKey],
    omissionStableKeys: [group],
    omissionUnits: [{ group, contractId: 'C' + String(id).padStart(3, '0'), blockingClass: 'test-missing', clauses: ['clause|pkg-alpha|C' + String(id).padStart(3, '0') + '|precondition|0123456789abcdef'], rootTicketKey: 'P1-1' }],
    origin: { kind: 'omission', sourceTicket: 'P1-1' },
  };
}

test('C004: a merge unions omissionStableKeys, omissionUnitKeys and omissionUnits', () => {
  const phase = { id: 2, tickets: [omissionTicket(1, 'pkg-alpha|C001', 'omission-unit:aaaa'), omissionTicket(2, 'pkg-alpha|C002', 'omission-unit:bbbb')] };

  const plan = condensePlan(phase, {}, BUDGET, { components: COMPONENTS, mergeStatusPolicy: 'todo', rebuildContracts: true });

  assert.equal(plan.after, 1);
  const survivor = plan.tickets[0];
  assert.deepEqual([...survivor.omissionStableKeys].sort(), ['pkg-alpha|C001', 'pkg-alpha|C002']);
  assert.deepEqual([...survivor.omissionUnitKeys].sort(), ['omission-unit:aaaa', 'omission-unit:bbbb']);
  assert.equal(survivor.omissionUnits.length, 2);
});

test('C004: a merge preserves every omission contract even when rebuildContracts is true', () => {
  const phase = { id: 2, tickets: [omissionTicket(1, 'pkg-alpha|C001', 'omission-unit:aaaa'), omissionTicket(2, 'pkg-alpha|C002', 'omission-unit:bbbb')] };

  const plan = condensePlan(phase, {}, BUDGET, { components: COMPONENTS, mergeStatusPolicy: 'todo', rebuildContracts: true });

  assert.deepEqual(plan.tickets[0].contracts.map((contract) => contract.id).sort(), ['C001', 'C002']);
});

test('C004: a non-omission merge still rebuilds contracts when asked', () => {
  const first = { ...omissionTicket(1, 'pkg-alpha|C001', 'omission-unit:aaaa'), origin: { kind: 'derived' } };
  const second = { ...omissionTicket(2, 'pkg-alpha|C002', 'omission-unit:bbbb'), origin: { kind: 'derived' } };
  const phase = { id: 2, tickets: [first, second] };

  const plan = condensePlan(phase, {}, BUDGET, { components: COMPONENTS, mergeStatusPolicy: 'todo', rebuildContracts: true });

  assert.equal(plan.tickets[0].contracts, undefined);
});
