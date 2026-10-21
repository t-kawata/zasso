import test from 'node:test';
import assert from 'node:assert/strict';

import { validateJudgmentRecord, decideJudgment } from '../../.claude/scripts/shared-obligations/judgment.mjs';

const item = { obligationId: 'MESH:b/A', contextDigest: 'abc', falsifier: 'name a counterexample' };
const record = {
  obligationId: 'MESH:b/A',
  contextDigest: 'abc',
  verdict: 'entailed',
  basis: [{ source: 'spec.md', line: 1, quote: 'q' }],
};

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('contextDigest binds the judgment to the worklist item', () => {
  assert.equal(validateJudgmentRecord(record, item).ok, true);
  assert.equal(validateJudgmentRecord({ ...record, contextDigest: 'other' }, item).ok, false);
});

// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('a judgment closes only after a held attack', () => {
  assert.equal(decideJudgment({ record, attack: { outcome: 'held', reason: 'no counterexample' } }).state, 'held');
  assert.equal(decideJudgment({ record, attack: { outcome: 'unresolved', reason: 'unclear' } }).state, 'stuck');
  assert.equal(decideJudgment({ record, attack: { outcome: 'broken', reason: 'counterexample', counterexample: { source: 'spec.md', line: 2, quote: 'r' } } }).state, 'broken');
});
