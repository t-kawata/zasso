// [::TICKET::] PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-202 --for-spec --no-implementation-order`.
// PX-202 @verifies C003
// Canonicalisation dropped any clause group outside the frozen vocabulary, so an
// authored clause could vanish between the payload and the seed without a word.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalizeClauses } from '../../../.claude/scripts/workspacify-allocate/lib/contract-model.mjs';
import { CONTRACT_CLAUSES } from '../../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';

test('C003 an unknown clause group is refused instead of dropped', () => {
  // The caller supplies the contract id: it is the locator the message needs.
  assert.throws(
    () => canonicalizeClauses({ input: 'i', output: 'o', made_up_clause: ['x'] }, { contractId: 'contract-boundary-001' }),
    (error) => error.message.includes('made_up_clause') && error.message.includes('contract-boundary-001'),
    'the error must name the key and the contract',
  );
  // Nothing is returned when a key is unknown: the caller cannot publish a partial contract.
  assert.throws(() => canonicalizeClauses({ input: 'i', output: 'o', unknown_group: 'x' }), /unknown_group/);
});

test('C003 a valid clause set canonicalises exactly as before', () => {
  const canonical = canonicalizeClauses({ preconditions: ['b', 'a'], output: 'o', input: 'i' });
  assert.deepEqual(canonical, { input: 'i', output: 'o', preconditions: ['a', 'b'] });

  const listClauses = new Set(['preconditions', 'postconditions', 'invariants', 'errors', 'tests']);
  const full = Object.fromEntries([...CONTRACT_CLAUSES].map((clause) => [clause, listClauses.has(clause) ? ['one'] : 'statement']));
  const fullCanonical = canonicalizeClauses(full);
  assert.deepEqual(Object.keys(fullCanonical).sort(), [...CONTRACT_CLAUSES].sort());
});

test('C003 canonicalisation is lossless for every declared key', () => {
  const listClauses = new Set(['preconditions', 'postconditions', 'invariants', 'errors', 'tests']);
  for (const clause of CONTRACT_CLAUSES) {
    const canonical = canonicalizeClauses({ [clause]: listClauses.has(clause) ? ['value'] : 'value' });
    assert.ok(
      Object.prototype.hasOwnProperty.call(canonical, clause),
      `${clause} must survive canonicalisation`,
    );
  }
  const onlyCore = canonicalizeClauses({ input: 'i', output: 'o' });
  assert.deepEqual(Object.keys(onlyCore).sort(), ['input', 'output']);
});
