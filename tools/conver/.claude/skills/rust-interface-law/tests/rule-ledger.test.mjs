import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateRuleId } from '../scripts/lib/rule-ledger.mjs';

test('rule allocation returns the next stable numeric id', () => {
  const existing = new Set(['REST-18', 'REST-19', 'WS-32']);
  assert.equal(allocateRuleId(existing, 'REST'), 'REST-20');
  assert.equal(allocateRuleId(existing, 'WS'), 'WS-33');
  assert.equal(allocateRuleId(existing, 'IMP'), 'IMP-1');
});

test('rule allocation rejects an invalid prefix', () => {
  assert.throws(() => allocateRuleId(new Set(), 'rest'), /prefix/);
});
