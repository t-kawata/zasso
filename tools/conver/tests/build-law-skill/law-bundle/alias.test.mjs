// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// @verifies C002
// C002 invariant: No two canonical concepts share one obligation
/**
 * Legacy ids are aliases, not new rules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoDuplicateObligation,
  resolveRuleRow,
} from '../../../.claude/skills/rust-interface-law/scripts/lib/rule-alias.mjs';

const ALIASES = {
  aliases: {
    'INV-01': { target: 'IF-02', reason: 'adapter does not implement business rules' },
    'INV-02': { target: 'IF-01', reason: 'adapter calls the operation' },
    'INV-03': { target: 'OPS-07', reason: 'authorization runs inside the operation' },
    'INV-04': { target: 'ARC-03', reason: 'core and operation carry no transport dependency' },
    'INV-05': { target: 'CONF-42', reason: 'SSO addition keeps existing contracts' },
    'INV-07': { target: 'AUTH-08', reason: 'one interface audience per token' },
    'INV-08': { target: 'OPS-06', reason: 'no side effect before authorization' },
  },
};

test('C002: a legacy id resolves to its canonical target', () => {
  const row = resolveRuleRow({ id: 'INV-08' }, ALIASES);
  assert.equal(row.disposition, 'alias');
  assert.equal(row.targetConcept, 'OPS-06');
  assert.equal(row.reason, 'no side effect before authorization');
});

test('C002: a canonical id resolves to itself', () => {
  const row = resolveRuleRow({ id: 'REST-01' }, ALIASES);
  assert.equal(row.disposition, 'concept');
  assert.equal(row.targetConcept, 'REST-01');
});

test('C002: a new legacy family becomes a canonical concept', () => {
  const row = resolveRuleRow({ id: 'FREE-01' }, ALIASES);
  assert.equal(row.disposition, 'concept');
  assert.equal(row.targetConcept, 'FREE-01');
});

test('C002: every alias names a target and a reason', () => {
  for (const [id, entry] of Object.entries(ALIASES.aliases)) {
    assert.ok(entry.target, id);
    assert.ok(entry.reason.length > 10, id);
  }
});

test('C002: one obligation cannot name two canonical concepts', () => {
  assert.throws(
    () => assertNoDuplicateObligation([
      { id: 'INV-08', obligation: 'no-side-effect-before-auth', targetConcept: 'rules/c/ops-06' },
      { id: 'OPS-06', obligation: 'no-side-effect-before-auth', targetConcept: 'rules/c/ops-07' },
    ]),
    (error) => error.code === 'ALIAS_CONFLICT',
  );
});

test('C002: an alias and its canonical rule share one target', () => {
  assert.doesNotThrow(() => assertNoDuplicateObligation([
    { id: 'INV-08', obligation: 'no-side-effect-before-auth', targetConcept: 'rules/c/ops-06' },
    { id: 'OPS-06', obligation: 'no-side-effect-before-auth', targetConcept: 'rules/c/ops-06' },
  ]));
});
