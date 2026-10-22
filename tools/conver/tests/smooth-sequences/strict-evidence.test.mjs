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
