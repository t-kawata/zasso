import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCertificate } from '../../.claude/scripts/shared-obligations/certificate.mjs';
import { decideAll } from '../../.claude/scripts/shared-obligations/decide.mjs';
import { buildWorklist } from '../../.claude/scripts/shared-obligations/judgment.mjs';
import {
  resolveCensusObligations,
  resolveMechanicalObligations,
  resolveReadingsObligations,
} from '../../.claude/scripts/shared-obligations/predicates.mjs';
import { deriveObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';
import { recordIdOf } from '../../.claude/scripts/smooth-sequences/lib/provenance.mjs';
import { ARTIFACT_DIGEST, buildClosureWorkspace } from '../fixtures/closure-workspace/index.mjs';

const READER = 'educe-sequences/generation-1';
const ATTACK_READER = 'educe-sequences/generation-1/attack';

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function evaluate(workspace) {
  const derived = deriveObligations({
    census: workspace.census,
    declaration: workspace.declaration,
    artifact: workspace.artifact,
    treeManifest: workspace.treeManifest,
    allocateManifest: workspace.allocateManifest,
    packages: [],
    readings: workspace.readings,
    mechanical: { subChecks: [] },
  });
  const mechanical = resolveMechanicalObligations(derived, { findings: [], subChecks: [] });
  const census = resolveCensusObligations(mechanical, {
    census: workspace.census,
    artifact: workspace.artifact,
    treeManifest: workspace.treeManifest,
    allocateManifest: workspace.allocateManifest,
    packages: [],
  });
  const obligations = resolveReadingsObligations(census, {
    readings: workspace.readings,
    artifactDigest: ARTIFACT_DIGEST,
  });
  const openSemantic = obligations.filter((entry) => entry.class === 'semantic' && entry.state === 'open');
  const worklist = buildWorklist(openSemantic, {}, {
    artifactDigest: ARTIFACT_DIGEST,
    reader: READER,
    attackReader: ATTACK_READER,
    requireRecordId: true,
  });
  const result = decideAll({
    obligations,
    worklist,
    judgments: workspace.readings.judgment,
    attacks: workspace.readings.attack,
    artifactDigest: ARTIFACT_DIGEST,
  });
  return { obligations, worklist, ...result };
}

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function decisionOf(result, id) {
  return result.decisions.find((entry) => entry.obligationId === id);
}

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function judgmentRecord(item) {
  const field = String(item.id).startsWith('JUDGE:')
    ? String(item.id).split(':')[1].toLowerCase()
    : String(item.id).split(':')[2];
  const source = String(item.id).startsWith('JUDGE:') ? 'contract_registry' : 'artifact';
  const basis = source === 'contract_registry'
    ? { source, boundaryId: 'boundary-001', field, value: item.obligationId }
    : { source, id: 'OpA', field, value: item.obligationId };
  const record = {
    schemaVersion: 2,
    obligationId: item.obligationId,
    contextDigest: item.contextDigest,
    worklistDigest: item.worklistDigest,
    artifactDigest: ARTIFACT_DIGEST,
    verdict: item.kind === 'risk' ? 'mitigated' : item.kind === 'property' ? 'present' : 'consistent',
    basis: [basis],
    reader: READER,
  };
  return { ...record, recordId: recordIdOf(record) };
}

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function attackRecord(item) {
  return {
    obligationId: item.obligationId,
    contextDigest: item.contextDigest,
    worklistDigest: item.worklistDigest,
    outcome: 'held',
    reader: ATTACK_READER,
    searched: { source: 'spec', path: 'spec.md', from: 1, to: 5, quote: item.obligationId },
  };
}

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function answerWorklist(result) {
  const judgments = [];
  const attacks = [];
  for (const item of result.worklist) {
    if (String(item.id).startsWith('FALSIFY:')) {
      attacks.push(attackRecord(item));
      continue;
    }
    const record = judgmentRecord(item);
    judgments.push(record);
    if (item.attackTier === 'tier1') attacks.push(attackRecord(item));
  }
  const decided = decideAll({
    obligations: result.obligations,
    worklist: result.worklist,
    judgments,
    attacks,
    artifactDigest: ARTIFACT_DIGEST,
  });
  return { judgments, attacks, decided };
}

// @verifies C001
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('the second workspace exposes one defect per inquest lens', () => {
  const result = evaluate(buildClosureWorkspace());
  assert.equal(decisionOf(result, 'READ:INQUEST:s1:omission').state, 'open');
  assert.equal(decisionOf(result, 'READ:INQUEST:s1:omission').reason, 'FINDING_OPEN');
  assert.equal(decisionOf(result, 'READ:INQUEST:s1:contradiction').state, 'open');
  assert.equal(decisionOf(result, 'READ:INQUEST:s1:contradiction').reason, 'FINDING_OPEN');
  assert.equal(decisionOf(result, 'JUDGE:TRANSLATION:boundary-001').state, 'open');
  assert.equal(decisionOf(result, 'RISK:OpA:partial-failure').state, 'open');
});

// @verifies C001
// @verifies C004
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('the four defects clear after the resolution and judgment pass', () => {
  const result = evaluate(buildClosureWorkspace({ fixed: true }));
  const answered = answerWorklist(result);
  const certificate = buildCertificate({
    obligations: result.obligations,
    decisions: answered.decided.decisions,
    checks: [],
    assurance: answered.decided.metrics,
  });
  assert.equal(decisionOf(result, 'READ:INQUEST:s1:omission').state, 'held');
  assert.equal(decisionOf(result, 'READ:INQUEST:s1:omission').source, 'reading');
  assert.equal(decisionOf(result, 'READ:INQUEST:s1:contradiction').state, 'held');
  assert.equal(
    answered.decided.decisions.find((entry) => entry.obligationId === 'JUDGE:TRANSLATION:boundary-001').state,
    'held',
  );
  assert.equal(
    answered.decided.decisions.find((entry) => entry.obligationId === 'RISK:OpA:partial-failure').state,
    'held',
  );
  assert.equal(certificate.status, 'complete');
});
