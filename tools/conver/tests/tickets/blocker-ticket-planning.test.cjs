'use strict';

/**
 * PX-442 C009 — every v3 blocker group becomes a ticket, once.
 *
 * Conflict, unclassified, unmapped, proof-missing and unstable-target classes
 * are grouped by contract. A conflict stays a blocker even when every
 * conflicting clause is PROVEN.
 *
 * @verifies C009
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { clauseKey } = require('../../.claude/scripts/tickets/lib/contract-clause.js');
const { blockerEntriesOf } = require('../../.claude/scripts/tickets/lib/blocker-plan.js');
const { planOmissionTickets } = require('../../.claude/scripts/tickets/apply-omission-findings.js');

const KEY_C001_A = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'invariant', text: 'conflict text one' });
const KEY_C001_B = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'invariant', text: 'conflict text two' });
const KEY_C002 = clauseKey({ scope: 'pkg-alpha', contractId: 'C002', element: 'precondition', text: 'unmapped work' });
const KEY_C003 = clauseKey({ scope: 'pkg-alpha', contractId: 'C003', element: 'precondition', text: 'proof work' });
const KEY_C004 = clauseKey({ scope: 'pkg-alpha', contractId: 'C004', element: 'precondition', text: 'unclassified work' });
const KEY_C005 = clauseKey({ scope: 'pkg-alpha', contractId: 'C005', element: 'precondition', text: 'resolved work' });

/** An inventory carrying one conflict and five clause owners. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function inventory() {
  return {
    scope: 'pkg-alpha',
    digest: 'sha256:inventory',
    clauses: [
      { key: KEY_C001_A, contractId: 'C001', element: 'invariant', owners: ['P0-1'] },
      { key: KEY_C001_B, contractId: 'C001', element: 'invariant', owners: ['P0-1'] },
      { key: KEY_C002, contractId: 'C002', element: 'precondition', owners: ['P0-1'] },
      { key: KEY_C003, contractId: 'C003', element: 'precondition', owners: ['P0-1'] },
      { key: KEY_C004, contractId: 'C004', element: 'precondition', owners: ['P0-1'] },
      { key: KEY_C005, contractId: 'C005', element: 'precondition', owners: ['P5-1'] },
    ],
    conflicts: [{ code: 'CLAUSE_TEXT_CONFLICT', contractId: 'C001', element: 'invariant', keys: [KEY_C001_A, KEY_C001_B] }],
  };
}

/** Every blocking class in one coverage map. */
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
function coverage() {
  return {
    version: 1,
    clauses: [
      { key: KEY_C001_A, status: 'PROVEN', applicability: 'TESTABLE' },
      { key: KEY_C001_B, status: 'PROVEN', applicability: 'TESTABLE' },
      { key: KEY_C002, status: 'UNMAPPED', applicability: 'TESTABLE' },
      { key: KEY_C003, status: 'CLAUSE_PROOF_MISSING', applicability: 'TESTABLE' },
      { key: KEY_C004, status: 'UNCLASSIFIED', applicability: 'UNCLASSIFIED' },
      { key: KEY_C005, status: 'NOT_APPLICABLE_VERIFIED', applicability: 'NOT_APPLICABLE' },
    ],
  };
}

test('C009 Postcondition: every blocking class emits one deduplicated group per contract', () => {
  const entries = blockerEntriesOf({ inventory: inventory(), coverage: coverage(), testIndex: { tests: [] } });
  const groups = entries.map((entry) => entry.group);

  assert.equal(new Set(groups).size, groups.length);
  assert.equal(entries.length, 4);
  assert.equal(entries.every((entry) => entry.contractId !== 'C005'), true);

  const byClass = new Map(entries.map((entry) => [entry.blockingClass, entry]));
  assert.equal(byClass.get('conflict').contractId, 'C001');
  assert.equal(byClass.get('unmapped').contractId, 'C002');
  assert.equal(byClass.get('proof-missing').contractId, 'C003');
  assert.equal(byClass.get('unclassified').contractId, 'C004');
});

test('C009 Invariant: a conflict stays a blocker when every conflicting clause is PROVEN', () => {
  const entries = blockerEntriesOf({
    inventory: inventory(),
    coverage: { version: 1, clauses: [
      { key: KEY_C001_A, status: 'PROVEN', applicability: 'TESTABLE' },
      { key: KEY_C001_B, status: 'PROVEN', applicability: 'TESTABLE' },
    ] },
    testIndex: { tests: [] },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].blockingClass, 'conflict');
  assert.equal(entries[0].group, 'pkg-alpha|C001');
});

test('C009 Boundary: a resolved non-testable disposition produces no group', () => {
  const entries = blockerEntriesOf({
    inventory: { ...inventory(), conflicts: [] },
    coverage: { version: 1, clauses: [{ key: KEY_C005, status: 'NOT_APPLICABLE_VERIFIED', applicability: 'NOT_APPLICABLE' }] },
    testIndex: { tests: [] },
  });

  assert.deepEqual(entries, []);
});

test('C009 Postcondition: the planner creates one ticket per group and reuses all on the second call', () => {
  const entries = blockerEntriesOf({ inventory: inventory(), coverage: coverage(), testIndex: { tests: [] } });
  const ticketsData = { title: 'fixture', phases: [] };

  const first = planOmissionTickets({ remainder: entries, ticketsData, phases: ticketsData.phases });
  assert.equal(first.created.length, 4);

  const second = planOmissionTickets({ remainder: entries, ticketsData: first.ticketsData, phases: first.ticketsData.phases });
  assert.equal(second.created.length, 0);
  assert.equal(second.reusedTickets, 4);
});
