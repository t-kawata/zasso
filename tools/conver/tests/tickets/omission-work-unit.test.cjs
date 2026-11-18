'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * PX-443 C002 — blocking class to work kind, and clause to atom.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  WORK_KIND,
  atomsOfImplementation,
  projectContract,
  workKindOf,
} = require('../../.claude/scripts/tickets/lib/omission-work-unit.js');

/** A clause of one contract. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function clause(contractId, element, text, suffix = '0123456789abcd') {
  return {
    key: `clause|pkg-alpha|${contractId}|${element}|${suffix}${String(text.length).padStart(2, '0')}`,
    contractId,
    element,
    text,
    owners: ['P1-1'],
    source: 'N0001->N0002',
  };
}

test('C002: implementation, repair and classification are distinct work kinds', () => {
  assert.equal(workKindOf('test-missing'), WORK_KIND.IMPLEMENTATION);
  assert.equal(workKindOf('unmapped'), WORK_KIND.IMPLEMENTATION);
  assert.equal(workKindOf('proof-missing'), WORK_KIND.REPAIR);
  assert.equal(workKindOf('unstable-target'), WORK_KIND.REPAIR);
  assert.equal(workKindOf('unclassified'), WORK_KIND.CLASSIFICATION);
  assert.equal(workKindOf('disposition-unverified'), WORK_KIND.CLASSIFICATION);
  assert.equal(workKindOf('unresolved'), WORK_KIND.CLASSIFICATION);
});

test('C002: a complete inventory projects a schema-valid contract', () => {
  const inventory = {
    scope: 'pkg-alpha',
    clauses: [
      clause('C001', 'precondition', 'input is non-empty'),
      clause('C001', 'postcondition', 'the result is a user'),
      clause('C001', 'invariant', 'the id never changes'),
    ],
  };

  const contract = projectContract(inventory, 'C001');

  assert.equal(contract.id, 'C001');
  assert.equal(contract.sourceEdge, 'N0001->N0002');
  assert.equal(contract.precondition, 'input is non-empty');
  assert.equal(contract.postcondition, 'the result is a user');
  assert.equal(contract.invariant, 'the id never changes');
});

test('C002: an unprojectable contract returns null and is not guessed', () => {
  const inventory = {
    scope: 'pkg-alpha',
    clauses: [clause('C001', 'precondition', 'input is non-empty')],
  };

  assert.equal(projectContract(inventory, 'C001'), null);
});

test('C002: only implementation blockers become atoms; the rest are named sinks', () => {
  const inventory = {
    scope: 'pkg-alpha',
    clauses: [
      clause('C001', 'precondition', 'input is non-empty'),
      clause('C001', 'postcondition', 'the result is a user'),
      clause('C001', 'invariant', 'the id never changes'),
    ],
  };
  const blockers = [
    { key: 'clause|pkg-alpha|C001|precondition|0123456789abcd13', clauses: ['clause|pkg-alpha|C001|precondition|0123456789abcd13'], contractId: 'C001', group: 'pkg-alpha|C001', owner: 'P1-1', blockingClass: 'test-missing' },
    { key: 'clause|pkg-alpha|C002|precondition|0123456789abcd14', clauses: ['clause|pkg-alpha|C002|precondition|0123456789abcd14'], contractId: 'C002', group: 'pkg-alpha|C002', owner: 'P1-1', blockingClass: 'proof-missing' },
    { key: 'clause|pkg-alpha|C003|precondition|0123456789abcd15', clauses: ['clause|pkg-alpha|C003|precondition|0123456789abcd15'], contractId: 'C003', group: 'pkg-alpha|C003', owner: null, blockingClass: 'unclassified' },
    { key: 'clause|pkg-alpha|C004|precondition|0123456789abcd16', clauses: ['clause|pkg-alpha|C004|precondition|0123456789abcd16'], contractId: 'C004', group: 'pkg-alpha|C004', owner: 'P1-1', blockingClass: 'test-missing' },
  ];

  const result = atomsOfImplementation(blockers, inventory);

  assert.equal(result.atoms.length, 1);
  assert.equal(result.atoms[0].contractId, 'C001');
  assert.equal(result.atoms[0].plannedTest.id, 'omission-test:' + blockers[0].key);
  assert.equal(result.repairs.length, 1);
  assert.equal(result.classifications.length, 1);
  assert.equal(result.unprojectable.length, 1);
  assert.equal(result.unprojectable[0].contractId, 'C004');
});
