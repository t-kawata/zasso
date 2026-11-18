'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * PX-443 C001 — one contract group retains every non-proven clause.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { blockerEntriesOf } = require('../../.claude/scripts/tickets/lib/blocker-plan.js');

/** A canonical clause key with a unique hash suffix. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
function clauseKey(contractId, element, suffix) {
  return `clause|pkg-alpha|${contractId}|${element}|${String(suffix).padStart(16, '0')}`;
}

test('C001: a contract group carries every sibling clause of the same contract', () => {
  const keys = [
    clauseKey('C001', 'precondition', 1),
    clauseKey('C001', 'postcondition', 2),
    clauseKey('C001', 'invariant', 3),
  ];
  const coverage = { clauses: keys.map((key) => ({ key, status: 'TEST_MISSING' })) };

  const entries = blockerEntriesOf({ inventory: { scope: 'pkg-alpha', clauses: [] }, coverage });

  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].clauses, [...keys].sort());
});

test('C001: a conflict group carries every conflicting key', () => {
  const keys = [clauseKey('C002', 'precondition', 4), clauseKey('C002', 'postcondition', 5)];
  const inventory = { scope: 'pkg-alpha', clauses: [], conflicts: [{ code: 'CONFLICTING_TEXT', contractId: 'C002', keys }] };

  const entries = blockerEntriesOf({ inventory, coverage: { clauses: [] } });

  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].clauses, [...keys].sort());
});

test('C001: the sum of group clauses equals the non-proven clause count', () => {
  const keys = Array.from({ length: 149 }, (_, index) => clauseKey(`C${String((index % 57) + 1).padStart(3, '0')}`, 'precondition', index));
  const coverage = { clauses: keys.map((key) => ({ key, status: 'TEST_MISSING' })) };

  const entries = blockerEntriesOf({ inventory: { scope: 'pkg-alpha', clauses: [] }, coverage });
  const retained = entries.flatMap((entry) => entry.clauses);

  assert.equal(entries.length, 57);
  assert.equal(retained.length, 149);
  assert.equal(new Set(retained).size, 149);
});
