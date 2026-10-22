// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-292 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorklist,
  decideJudgment,
  validateAttackRecord,
  validateJudgmentRecord,
  withinRoundCap,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';

const item = { obligationId: 'MESH:b/A', contextDigest: 'abc', falsifier: 'name a counterexample' };
const record = {
  obligationId: 'MESH:b/A',
  contextDigest: 'abc',
  verdict: 'entailed',
  basis: [{ source: 'spec.md', line: 1, quote: 'a substantive specification clause' }],
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

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('the worklist context digest changes when the cited evidence changes', () => {
  const obligation = { id: 'JUDGE:TRANSLATION:bd-1', class: 'semantic', state: 'open', kind: 'judgment', subject: 'bd-1', claim: 'translation holds' };
  const first = buildWorklist([obligation], {
    'JUDGE:TRANSLATION:bd-1': { obligationId: obligation.id, anchorSet: { spec: [{ path: 'spec.md', line: 2 }] } },
  }, { artifactDigest: 'artifact-1' })[0];
  const second = buildWorklist([obligation], {
    'JUDGE:TRANSLATION:bd-1': { obligationId: obligation.id, anchorSet: { spec: [{ path: 'spec.md', line: 3 }] } },
  }, { artifactDigest: 'artifact-1' })[0];
  assert.notEqual(first.contextDigest, second.contextDigest);
  assert.notEqual(first.worklistDigest, second.worklistDigest);
  assert.equal(first.artifactDigest, 'artifact-1');
  const repeated = buildWorklist([obligation], {
    'JUDGE:TRANSLATION:bd-1': { obligationId: obligation.id, anchorSet: { spec: [{ path: 'spec.md', line: 2 }] } },
  }, { artifactDigest: 'artifact-1' })[0];
  assert.equal(first.contextDigest, repeated.contextDigest);
  assert.equal(first.worklistDigest, repeated.worklistDigest);
});

// @verifies C004
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a basis quote must occur on the cited line', () => {
  const worklistItem = {
    ...item,
    schemaVersion: 2,
    anchorSet: { spec: [{ path: 'spec.md', line: 1 }] },
    answerVocabulary: ['entailed'],
  };
  const valid = { ...record, schemaVersion: 2, basis: [{ source: 'spec', path: 'spec.md', line: 1, quote: 'the clause' }] };
  const invalid = { ...valid, basis: [{ source: 'spec', path: 'spec.md', line: 1, quote: 'missing' }] };
  const options = { linesByPath: { 'spec.md': ['the clause holds'] } };
  assert.equal(validateJudgmentRecord(valid, worklistItem, options).ok, true);
  const result = validateJudgmentRecord(invalid, worklistItem, options);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'QUOTE_NOT_FOUND');
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('an attack must carry searched lines and a different reader', () => {
  const attack = {
    obligationId: 'JUDGE:TRANSLATION:bd-1',
    contextDigest: 'ctx',
    worklistDigest: 'worklist',
    outcome: 'held',
    reader: 'judge/generation-1',
    searched: { source: 'spec', path: 'spec.md', from: 1, to: 2, quote: 'the clause' },
  };
  const worklistItem = {
    obligationId: 'JUDGE:TRANSLATION:bd-1',
    contextDigest: 'ctx',
    worklistDigest: 'worklist',
    attackTier: 'tier1',
  };
  const judgmentRecord = { reader: 'judge/generation-1' };
  const self = validateAttackRecord(attack, judgmentRecord, worklistItem);
  assert.equal(self.ok, false);
  assert.equal(self.code, 'SELF_ATTACK');
  const ungrounded = validateAttackRecord({ ...attack, reader: 'attack/generation-1', searched: undefined }, judgmentRecord, worklistItem);
  assert.equal(ungrounded.ok, false);
  assert.equal(ungrounded.code, 'ATTACK_UNGROUNDED');
  assert.equal(withinRoundCap({ round: 2 }), true);
  assert.equal(withinRoundCap({ round: 3 }), false);
});
