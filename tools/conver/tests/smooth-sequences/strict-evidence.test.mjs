// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';
import { decideAll } from '../../.claude/scripts/shared-obligations/decide.mjs';
import { buildWorklist } from '../../.claude/scripts/shared-obligations/judgment.mjs';
import { validateManifestReceipts } from '../../.claude/scripts/shared-obligations/evidence.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const ARTIFACT_DIGEST = 'artifact-1';
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const obligation = {
  id: 'PROP:OpA:purpose',
  class: 'semantic',
  state: 'open',
  kind: 'property',
  subject: 'OpA:purpose',
  claim: 'purpose is present for OpA',
};
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const context = {
  obligationId: obligation.id,
  subject: obligation.subject,
  anchorSet: { artifact: [{ id: 'OpA', field: 'purpose' }] },
};
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const artifact = { operations: [{ id: 'OpA', purpose: 'the purpose text' }] };

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function item(requireEffort = true) {
  return buildWorklist([obligation], { [obligation.id]: context }, {
    artifactDigest: ARTIFACT_DIGEST,
    reader: 'reader-1',
    attackReader: 'reader-1/attack',
    requireRecordId: false,
    requireEffort,
  })[0];
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function record(worklistItem) {
  return {
    schemaVersion: 2,
    obligationId: obligation.id,
    contextDigest: worklistItem.contextDigest,
    worklistDigest: worklistItem.worklistDigest,
    artifactDigest: ARTIFACT_DIGEST,
    verdict: 'present',
    basis: [{ source: 'artifact', id: 'OpA', field: 'purpose', quote: 'the purpose text' }],
    reader: 'reader-1',
  };
}

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const effort = {
  obligationId: obligation.id,
  searched: [
    { source: 'artifact', path: 'artifact.json', line: 1, quote: 'the purpose text' },
    { source: 'spec', path: 'spec.md', line: 2, quote: 'the purpose clause' },
  ],
  alternatives: [{
    verdict: 'absent',
    rejectedBecause: 'the operation row states the purpose text',
    evidence: { id: 'OpA', field: 'purpose' },
  }],
  counterexampleAttempt: {
    candidate: 'the purpose field is empty on the operation row',
    source: { path: 'spec.md', line: 2, quote: 'the purpose clause' },
    whyItFails: 'the artifact row carries a non-empty purpose value',
  },
  discriminator: {
    basisRef: 'operations[OpA].purpose',
    ifAbsentOrFalse: 'absent',
  },
  uncertainty: { level: 'low' },
};

// @verifies C015
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a strict run rejects a held record that carries no effort trace', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const worklistItem = item(true);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = decideAll({
    obligations: [obligation],
    worklist: [worklistItem],
    judgments: [record(worklistItem)],
    artifactDigest: ARTIFACT_DIGEST,
    artifact,
  });
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'EFFORT_MISSING');
});

// @verifies C015
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a strict run holds a record whose effort trace and basis resolve', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const worklistItem = item(true);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = decideAll({
    obligations: [obligation],
    worklist: [worklistItem],
    judgments: [record(worklistItem)],
    effort: [effort],
    artifactDigest: ARTIFACT_DIGEST,
    artifact,
  });
  assert.equal(result.decisions[0].state, 'held');
  assert.equal(result.metrics.basisResolvedRatio, 1);
  assert.equal(result.metrics.effortCoverage, 1);
});

// @verifies C016
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a strict FALSIFY obligation with a non-blind attack stays open', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const falsify = {
    id: 'FALSIFY:OpA',
    class: 'semantic',
    state: 'open',
    kind: 'judgment',
    subject: 'OpA',
    claim: 'the operation is ordered and covered',
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const worklistItem = buildWorklist([falsify], {
    'FALSIFY:OpA': { obligationId: 'FALSIFY:OpA', subject: 'OpA', anchorSet: {} },
  }, {
    artifactDigest: ARTIFACT_DIGEST,
    reader: 'reader-1',
    attackReader: 'reader-1/attack',
    requireRecordId: false,
    requireEffort: true,
  })[0];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const attack = {
    obligationId: 'FALSIFY:OpA',
    contextDigest: worklistItem.contextDigest,
    worklistDigest: worklistItem.worklistDigest,
    outcome: 'held',
    reader: 'reader-1/attack',
    searched: { source: 'spec', path: 'spec.md', from: 1, to: 1, quote: 'the clause' },
    attack: 'searched the OpA definition; none was found.',
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = decideAll({
    obligations: [falsify],
    worklist: [worklistItem],
    attacks: [attack],
    artifactDigest: ARTIFACT_DIGEST,
  });
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'BLIND_ATTACK_REQUIRED');
});

// @verifies C012
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('a stale receipt reaches the certificate as an open obligation', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const stale = validateManifestReceipts({
    receipts: [{ phase: 8, inputs: { artifact: 'old' } }],
  }, { artifact: 'new' }).stale;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const certificate = buildCertificate({
    obligations: [],
    decisions: [],
    checks: [],
    assurance: {
      basisResolvedRatio: 1,
      quoteGroundedRatio: 1,
      templateAttackRatio: 0,
      inheritedRatio: 0,
      escapeActConflictCount: 0,
      staleReceiptCount: stale.length,
      effortCoverage: 1,
      blindAttackRatio: 1,
      discriminatingRatio: 1,
      rejudgeAgreement: 1,
    },
    receiptDebt: stale,
  });
  assert.equal(certificate.status, 'incomplete');
  assert.equal(certificate.open.some((entry) => entry.code === 'STALE_RECEIPT'), true);
});

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
const GENERATION_STARTED_AT = '2026-10-23T00:00:00.000Z';

// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function generationItem() {
  return buildWorklist([obligation], { [obligation.id]: context }, {
    artifactDigest: ARTIFACT_DIGEST,
    reader: 'reader-1',
    attackReader: 'reader-1/attack',
    requireRecordId: false,
    requireEffort: true,
    generation: 47,
    generationStartedAt: GENERATION_STARTED_AT,
  })[0];
}

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function generationRecord(worklistItem, overrides = {}) {
  return {
    ...record(worklistItem),
    readerGeneration: 47,
    readAt: '2026-10-23T01:00:00.000Z',
    ...overrides,
  };
}

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
test('a judgment from an older generation stays open', () => {
  const worklistItem = generationItem();
  const result = decideAll({
    obligations: [obligation],
    worklist: [worklistItem],
    judgments: [generationRecord(worklistItem, { readerGeneration: 46 })],
    effort: [effort],
    artifactDigest: ARTIFACT_DIGEST,
    artifact,
  });
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'READER_GENERATION_STALE');
});

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
test('a judgment older than the generation start stays open', () => {
  const worklistItem = generationItem();
  const result = decideAll({
    obligations: [obligation],
    worklist: [worklistItem],
    judgments: [generationRecord(worklistItem, { readAt: '2026-10-01T00:00:00.000Z' })],
    effort: [effort],
    artifactDigest: ARTIFACT_DIGEST,
    artifact,
  });
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'READING_NOT_REREAD');
});

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
test('a current-generation judgment after the generation start is held', () => {
  const worklistItem = generationItem();
  const result = decideAll({
    obligations: [obligation],
    worklist: [worklistItem],
    judgments: [generationRecord(worklistItem)],
    effort: [effort],
    artifactDigest: ARTIFACT_DIGEST,
    artifact,
  });
  assert.equal(result.decisions[0].state, 'held');
});

// @verifies C004
// [::TICKET::] PX-299 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('a held FALSIFY attack does not owe an effort trace', () => {
  const falsify = {
    id: 'FALSIFY:OpA',
    class: 'semantic',
    state: 'open',
    kind: 'judgment',
    subject: 'OpA',
    claim: 'the operation is ordered and covered',
  };
  const worklistItem = buildWorklist([falsify], {
    'FALSIFY:OpA': { obligationId: 'FALSIFY:OpA', subject: 'OpA', anchorSet: {} },
  }, {
    artifactDigest: ARTIFACT_DIGEST,
    reader: 'reader-1',
    attackReader: 'reader-1/attack',
    requireRecordId: false,
    requireEffort: true,
  })[0];
  const attack = {
    obligationId: 'FALSIFY:OpA',
    contextDigest: worklistItem.contextDigest,
    worklistDigest: worklistItem.worklistDigest,
    outcome: 'held',
    blind: true,
    reader: 'reader-1/attack',
    searched: { source: 'spec', path: 'spec.md', from: 1, to: 1, quote: 'the clause' },
    attack: 'searched the OpA row and the cited line the clause for a step; none was found.',
    counterexampleAttempt: {
      candidate: 'a step that performs OpA on the cited line',
      source: { path: 'spec.md', line: 1, quote: 'the clause' },
      whyItFails: 'the cited line states no step',
    },
  };
  const result = decideAll({
    obligations: [falsify],
    worklist: [worklistItem],
    attacks: [attack],
    artifactDigest: ARTIFACT_DIGEST,
  });
  assert.equal(result.decisions[0].state, 'held');
  assert.equal(result.metrics.effortCoverage, 1);
});

// PX-311 @verifies C004
// Two obligations that searched the same rows are one effort, however different the
// subjects are. The strict gate must name the second one instead of holding both.
const SECOND_ARTIFACT = {
  operations: [{
    id: 'OpA',
    purpose: 'the purpose text',
    cancellation_rule: 'cancellable before the first external action',
  }],
};

const secondObligation = {
  id: 'PROP:OpA:cancellation',
  class: 'semantic',
  state: 'open',
  kind: 'property',
  subject: 'OpA:cancellation',
  claim: 'the cancellation rule is present for OpA',
};

const secondContext = {
  obligationId: secondObligation.id,
  subject: secondObligation.subject,
  anchorSet: { artifact: [{ id: 'OpA', field: 'cancellation_rule' }] },
};

// [::TICKET::] PX-311 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-311 --for-spec --no-implementation-order`.
function strictItems() {
  return buildWorklist([obligation, secondObligation], {
    [obligation.id]: context,
    [secondObligation.id]: secondContext,
  }, {
    artifactDigest: ARTIFACT_DIGEST,
    reader: 'reader-1',
    attackReader: 'reader-1/attack',
    requireRecordId: false,
    requireEffort: true,
  });
}

// [::TICKET::] PX-311 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-311 --for-spec --no-implementation-order`.
function secondRecord(worklistItem) {
  return {
    ...record(worklistItem),
    obligationId: secondObligation.id,
    basis: [{ source: 'artifact', id: 'OpA', field: 'cancellation_rule', quote: 'cancellable before the first external action' }],
  };
}

test('C004 a searched set shared by two subjects fails E1', () => {
  const items = strictItems();
  const result = decideAll({
    obligations: [obligation, secondObligation],
    worklist: items,
    judgments: [record(items[0]), secondRecord(items[1])],
    effort: [effort, { ...effort, obligationId: secondObligation.id }],
    artifactDigest: ARTIFACT_DIGEST,
    artifact: SECOND_ARTIFACT,
  });
  const second = result.decisions.find((entry) => entry.obligationId === secondObligation.id);
  assert.equal(second.reason, 'EFFORT_NOT_SUBJECT_SPECIFIC');
  assert.equal(second.state, 'open');
});

test('C004 distinct searched sets hold both subjects and cover the effort gate', () => {
  const items = strictItems();
  const distinctEffort = {
    ...effort,
    obligationId: secondObligation.id,
    searched: [
      { source: 'artifact', path: 'artifact.json', line: 3, quote: 'cancellable before the first external action' },
      { source: 'spec', path: 'spec.md', line: 4, quote: 'the cancellation clause' },
    ],
  };
  const result = decideAll({
    obligations: [obligation, secondObligation],
    worklist: items,
    judgments: [record(items[0]), secondRecord(items[1])],
    effort: [effort, distinctEffort],
    artifactDigest: ARTIFACT_DIGEST,
    artifact: SECOND_ARTIFACT,
  });
  assert.equal(result.decisions.every((entry) => entry.state === 'held'), true);
  assert.equal(result.metrics.effortCoverage, 1);
});

test('C004 an attack that only swaps ids is measured as a reused template', () => {
  const shared = decideAll({
    obligations: [],
    worklist: [],
    judgments: [],
    attacks: [
      { obligationId: 'FALSIFY:A', attack: 'Probe whether the accepted transition handshake completes for JUDGE:TRANSLATION:bd-2' },
      { obligationId: 'FALSIFY:B', attack: 'Probe whether the accepted transition handshake completes for JUDGE:TRANSLATION:bd-3' },
    ],
    requireEffort: true,
    artifactDigest: ARTIFACT_DIGEST,
  });
  assert.equal(shared.metrics.templateAttackRatio, 1);
});

test('C004 subject-specific attack wording keeps the template ratio at zero', () => {
  const distinct = decideAll({
    obligations: [],
    worklist: [],
    judgments: [],
    attacks: [
      { obligationId: 'FALSIFY:A', attack: 'Probe whether ProduceFact returns a rejected status when the result object carries no boundary resolution' },
      { obligationId: 'FALSIFY:B', attack: 'Probe whether ConsumeFact writes the accepted status before the external handshake settles' },
    ],
    requireEffort: true,
    artifactDigest: ARTIFACT_DIGEST,
  });
  assert.equal(distinct.metrics.templateAttackRatio, 0);
});
