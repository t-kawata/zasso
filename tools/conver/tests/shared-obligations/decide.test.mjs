import test from 'node:test';
import assert from 'node:assert/strict';

import { decideAll } from '../../.claude/scripts/shared-obligations/decide.mjs';
import { fixture, OBLIGATION_ID } from '../fixtures/closure-core/records.mjs';

// [::TICKET::] PX-291, PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-291|PX-292|PX-293) --for-spec --no-implementation-order`.
function decide({ item, obligation, record, attack }, extra = {}) {
  return decideAll({
    obligations: obligation === null ? [] : [obligation],
    worklist: item === null ? [] : [item],
    judgments: record === null ? [] : [record],
    attacks: attack === null ? [] : [attack],
    artifactDigest: 'artifact-1',
    ...extra,
  });
}

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a validated judgment with a held attack decides the obligation held', () => {
  const parts = fixture();
  const result = decide(parts);
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].state, 'held');
  assert.equal(result.decisions[0].source, 'judgment');
  assert.equal(result.rejected.length, 0);
  assert.equal(result.metrics.anchoredRatio, 1);
  assert.equal(result.metrics.independentAttacks, 1);
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a conflicting verdict never closes a translation judgment', () => {
  const parts = fixture({ record: { verdict: 'conflicting' } });
  const result = decide(parts);
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'VERDICT_NOT_ALLOWED');
  assert.equal(result.rejected[0].code, 'VERDICT_NOT_ALLOWED');
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('context, worklist and artifact digests bind the record to the current run', () => {
  const contextMismatch = decide(fixture({ record: { contextDigest: 'other' } }));
  assert.equal(contextMismatch.decisions[0].reason, 'CONTEXT_MISMATCH');
  const worklistMismatch = decide(fixture({ record: { worklistDigest: 'other' } }));
  assert.equal(worklistMismatch.decisions[0].reason, 'WORKLIST_MISMATCH');
  const stale = decide(fixture({ record: { artifactDigest: 'older' } }));
  assert.equal(stale.decisions[0].reason, 'STALE_EVIDENCE');
  assert.equal(stale.metrics.staleRecords, 1);
});

// @verifies C005
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a legacy or provisional record is rejected and never closes the obligation', () => {
  const legacy = decide(fixture({ record: { schemaVersion: 1 } }));
  assert.equal(legacy.decisions[0].reason, 'LEGACY_RECORD');
  assert.equal(legacy.decisions[0].state, 'open');
  const provisional = decide(fixture({ record: { provisional: true } }));
  assert.equal(provisional.decisions[0].reason, 'PROVISIONAL_EVIDENCE');
  assert.equal(provisional.metrics.provisionalRecords, 1);
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a Tier 1 judgment without an attack is open and counted unattacked', () => {
  const result = decide(fixture({ attack: null }));
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'NO_ATTACK');
  assert.equal(result.metrics.unattackedTier1, 1);
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('an attack written by the judgment reader is rejected', () => {
  const result = decide(fixture({ attack: { reader: 'judge/generation-1' } }));
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'SELF_ATTACK');
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a broken attack decides broken and an unresolved attack decides stuck', () => {
  const broken = decide(fixture({
    attack: {
      outcome: 'broken',
      counterexample: { source: 'contract_registry', boundaryId: 'bd-1', field: 'translation', value: 'the opposite' },
    },
  }));
  assert.equal(broken.decisions[0].state, 'broken');
  const unresolved = decide(fixture({ attack: { outcome: 'unresolved', reason: 'the clause is ambiguous' } }));
  assert.equal(unresolved.decisions[0].state, 'stuck');
});

// @verifies C004
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a quote must occur on the cited line', () => {
  const parts = fixture({
    item: { anchorSet: { spec: [{ path: 'spec.md', line: 2 }] } },
    record: {
      basis: [{ source: 'spec', path: 'spec.md', line: 2, quote: 'not on this line' }],
    },
  });
  const result = decide(parts, { linesByPath: { 'spec.md': ['first line', 'the clause holds'] } });
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'QUOTE_NOT_FOUND');
});

// @verifies C004
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a basis line outside the obligation anchors is rejected as generic', () => {
  const parts = fixture({
    item: { anchorSet: { spec: [{ path: 'spec.md', line: 2 }] } },
    record: {
      basis: [{ source: 'spec', path: 'spec.md', line: 1, quote: 'the specification' }],
    },
  });
  const result = decide(parts, { linesByPath: { 'spec.md': ['the specification', 'the clause holds'] } });
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'BASIS_OUT_OF_SCOPE');
  assert.equal(result.metrics.genericBasis, 1);
});

// @verifies C004
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('the same basis used for two obligations is rejected on the second', () => {
  const first = fixture();
  const second = {
    ...first,
    item: { ...first.item, id: 'JUDGE:TRANSLATION:bd-2', obligationId: 'JUDGE:TRANSLATION:bd-2' },
    obligation: { ...first.obligation, id: 'JUDGE:TRANSLATION:bd-2' },
    record: { ...first.record, obligationId: 'JUDGE:TRANSLATION:bd-2' },
    attack: {
      ...first.attack,
      obligationId: 'JUDGE:TRANSLATION:bd-2',
      searched: { source: 'contract_registry', boundaryId: 'bd-1', from: 1, to: 1, quote: 'the boundary' },
    },
  };
  const result = decideAll({
    obligations: [first.obligation, second.obligation],
    worklist: [first.item, second.item],
    judgments: [first.record, second.record],
    attacks: [first.attack, second.attack],
    artifactDigest: 'artifact-1',
  });
  assert.equal(result.decisions[0].state, 'held');
  assert.equal(result.decisions[1].state, 'open');
  assert.equal(result.decisions[1].reason, 'REUSED_BASIS');
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a FALSIFY obligation is decided by its attack, not by a judgment record', () => {
  const item = {
    id: 'FALSIFY:OpA',
    obligationId: 'FALSIFY:OpA',
    kind: 'judgment',
    subject: 'OpA',
    contextDigest: 'ctx-f',
    worklistDigest: 'worklist-f',
    artifactDigest: 'artifact-1',
    schemaVersion: 2,
    anchorSet: {},
    answerVocabulary: ['consistent', 'conflicting'],
    attackTier: 'tier1',
  };
  const obligation = { id: 'FALSIFY:OpA', class: 'semantic', kind: 'judgment', state: 'open', required: true };
  const attack = {
    obligationId: 'FALSIFY:OpA',
    contextDigest: 'ctx-f',
    worklistDigest: 'worklist-f',
    outcome: 'held',
    reader: 'attack/generation-1',
    searched: { source: 'spec', path: 'spec.md', from: 1, to: 3, quote: 'no counterexample' },
  };
  const result = decideAll({
    obligations: [obligation], worklist: [item], judgments: [], attacks: [attack], artifactDigest: 'artifact-1',
  });
  assert.equal(result.decisions[0].state, 'held');
  assert.equal(result.decisions[0].source, 'judgment');
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('each risk class needs its own decision instead of a prefix close', () => {
  const items = ['idempotency', 'replay'].map((riskClass) => ({
    id: `RISK:OpA:${riskClass}`,
    obligationId: `RISK:OpA:${riskClass}`,
    kind: 'risk',
    subject: `OpA:${riskClass}`,
    contextDigest: `ctx-${riskClass}`,
    worklistDigest: 'worklist-risk',
    artifactDigest: 'artifact-1',
    schemaVersion: 2,
    anchorSet: { artifact: [{ id: 'OpA', field: riskClass }] },
    answerVocabulary: ['mitigated', 'accepted'],
    attackTier: 'tier1',
  }));
  const obligations = items.map((item) => ({
    id: item.id, class: 'semantic', kind: 'risk', state: 'open', required: true,
  }));
  const records = items.slice(0, 1).map((item) => ({
    schemaVersion: 2, obligationId: item.id, contextDigest: item.contextDigest,
    worklistDigest: item.worklistDigest, artifactDigest: 'artifact-1', verdict: 'mitigated',
    basis: [{ source: 'artifact', id: 'OpA', field: item.subject.split(':')[1], value: 'state change' }],
    reader: 'judge/generation-1',
  }));
  const attacks = items.slice(0, 1).map((item) => ({
    obligationId: item.id, contextDigest: item.contextDigest, worklistDigest: item.worklistDigest,
    outcome: 'held', reader: 'attack/generation-1',
    searched: { source: 'artifact', id: 'OpA', from: 1, to: 1, quote: 'state change' },
  }));
  const result = decideAll({
    obligations, worklist: items, judgments: records, attacks, artifactDigest: 'artifact-1',
  });
  assert.equal(result.decisions[0].state, 'held');
  assert.equal(result.decisions[1].state, 'open');
  assert.equal(result.decisions[1].reason, 'NO_JUDGMENT');
});

// @verifies C002
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('reading and mechanical closures are decisions with their own source', () => {
  const result = decideAll({
    obligations: [
      { id: 'CHECK:S1', class: 'mechanical', state: 'closed', required: true },
      { id: 'READ:INQUEST:s1:omission', class: 'semantic', state: 'closed', required: true },
    ],
    worklist: [],
    judgments: [],
    attacks: [],
    artifactDigest: 'artifact-1',
  });
  assert.equal(result.decisions[0].state, 'proven');
  assert.equal(result.decisions[0].source, 'mechanical');
  assert.equal(result.decisions[1].state, 'held');
  assert.equal(result.decisions[1].source, 'reading');
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('a semantic obligation closed without a worklist item is not trusted', () => {
  const result = decideAll({
    obligations: [{ id: OBLIGATION_ID, class: 'semantic', kind: 'judgment', state: 'closed', required: true }],
    worklist: [],
    judgments: [],
    attacks: [],
    artifactDigest: 'artifact-1',
  });
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'NO_WORKLIST_ITEM');
});

// @verifies C001
// [::TICKET::] PX-291 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-291 --for-spec --no-implementation-order`.
test('an open obligation with no judgment record stays open', () => {
  const result = decide(fixture({ record: null, attack: null, item: { attackTier: 'standard' } }));
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'NO_JUDGMENT');
});
