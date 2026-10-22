// PX-306 @verifies C001
// The attack and the effort trace must search the claim they decide. A green run whose
// attacks all read one generic line is the defect PX-306 closes: the check must look at
// the anchor, not at the shape of the record.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  anchorEntriesOf,
  searchedOverlapsAnchor,
  validateAttackAnchor,
  validateAttackRecord,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';
import { decideAll } from '../../.claude/scripts/shared-obligations/decide.mjs';
import { writeEvidence } from '../../.claude/scripts/shared-obligations/evidence-writer.mjs';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const worklistItem = {
  obligationId: 'JUDGE:ENTAILMENT:boundary-005',
  kind: 'judgment',
  subject: 'boundary-005/entailment',
  attackTier: 'tier1',
  attackReader: 'attack/generation-2',
  anchorSet: { contract: [{ boundaryId: 'boundary-005', field: 'entailment' }] },
};
const judgment = {
  obligationId: worklistItem.obligationId,
  reader: 'judge/generation-2',
  verdict: 'entailed',
  basis: [{ source: 'contract_registry', boundaryId: 'boundary-005', field: 'entailment', quote: 'the provider returns the order' }],
};
const anchoredAttack = {
  obligationId: worklistItem.obligationId,
  outcome: 'held',
  reader: 'attack/generation-2',
  searched: { source: 'contract_registry', boundaryId: 'boundary-005', field: 'entailment', quote: 'the consumer accepts the order' },
};
const driftedAttack = {
  ...anchoredAttack,
  searched: { source: 'spec', path: 'spec.md', from: 14147, to: 14147, quote: 'the core operation order' },
};

test('C001 an attack whose searched row is the claim anchor is accepted', () => {
  assert.equal(validateAttackRecord(anchoredAttack, judgment, worklistItem, { requireAnchor: true }).ok, true);
});

test('C001 an attack on line 14147 cannot close boundary-005', () => {
  const result = validateAttackRecord(driftedAttack, judgment, worklistItem, { requireAnchor: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ATTACK_ANCHOR_MISMATCH');
});

test('C001 an attack with no anchor at all is rejected, never silently held', () => {
  const result = validateAttackAnchor(anchoredAttack, null, { obligationId: worklistItem.obligationId, anchorSet: {} });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ATTACK_ANCHOR_MISMATCH');
});

test('C001 an anchor and a searched row overlap only when they name the same claim', () => {
  assert.equal(searchedOverlapsAnchor(
    { source: 'contract_registry', boundaryId: 'boundary-005', field: 'entailment' },
    { source: 'contract_registry', boundaryId: 'boundary-005', field: 'entailment' },
  ), true);
  assert.equal(searchedOverlapsAnchor(
    { source: 'contract_registry', boundaryId: 'boundary-005', field: 'input' },
    { source: 'contract_registry', boundaryId: 'boundary-005', field: 'entailment' },
  ), false);
  assert.equal(searchedOverlapsAnchor(
    { source: 'spec', path: 'spec.md', from: 10, to: 12 },
    { source: 'spec', path: 'spec.md', line: 11 },
  ), true);
  assert.equal(searchedOverlapsAnchor(
    { source: 'spec', path: 'spec.md', from: 10, to: 12 },
    { source: 'spec', path: 'spec.md', line: 13 },
  ), false);
});

test('C001 anchorEntriesOf carries every anchor kind with its source', () => {
  const entries = anchorEntriesOf({
    spec: [{ path: 'spec.md', line: 1 }],
    contract: [{ boundaryId: 'boundary-005', field: 'entailment' }],
    artifact: [{ id: 'op-1', field: 'idempotency_scope' }],
    view: [{ packageId: 'pkg', unitId: 'op-1' }],
    ledger: [{ packageId: 'pkg', unit: 'op-1' }],
  });
  assert.deepEqual(entries.map((entry) => entry.source).sort(), ['artifact', 'contract_registry', 'ledger', 'spec', 'view']);
});

test('C001 the evidence writer refuses an attack outside the claim anchor', () => {
  const root = mkdtempSync(join(tmpdir(), 'px306-writer-'));
  try {
    mkdirSync(join(root, 'educe-sequences'), { recursive: true });
    const item = {
      obligationId: 'JUDGE:ENTAILMENT:boundary-005',
      attackTier: 'standard',
      anchorSet: { contract: [{ boundaryId: 'boundary-005', field: 'entailment' }] },
    };
    const writerJudgment = {
      obligationId: item.obligationId,
      reader: 'judge/generation-2',
      basis: [{ source: 'contract_registry', boundaryId: 'boundary-005', field: 'entailment', quote: 'the provider returns the order' }],
    };
    const writerAttack = {
      obligationId: item.obligationId,
      outcome: 'held',
      reader: 'attack/generation-2',
      searched: { source: 'spec', path: 'spec.md', from: 14147, to: 14147, quote: 'the core operation order' },
    };
    const result = writeEvidence({
      root,
      kind: 'attack',
      records: [writerAttack],
      worklist: [item],
      judgments: [writerJudgment],
      generation: 2,
      generationStartedAt: '2026-10-22T00:00:00.000Z',
      sources: { 'spec.md': Array.from({ length: 14200 }, (_, index) => (index === 14146 ? 'the core operation order' : 'other')) },
      requireAnchor: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.rejected[0].code, 'ATTACK_ANCHOR_MISMATCH');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C001 decideAll forwards sources and requireAnchor to the attack validator', () => {
  const obligation = {
    id: worklistItem.obligationId,
    class: 'semantic',
    state: 'open',
    kind: 'judgment',
    subject: worklistItem.subject,
    claim: 'the boundary entailment holds',
  };
  const worklist = [{
    ...worklistItem,
    subjectKind: undefined,
    contextDigest: 'ctx',
    worklistDigest: 'worklist',
    answerVocabulary: ['entailed'],
  }];
  const record = {
    ...judgment,
    contextDigest: 'ctx',
    worklistDigest: 'worklist',
    reader: 'judge/generation-2',
    basis: [{ source: 'contract_registry', boundaryId: 'boundary-005', field: 'entailment', quote: 'the provider returns the order' }],
  };
  const attack = {
    ...driftedAttack,
    contextDigest: 'ctx',
    worklistDigest: 'worklist',
    searched: { source: 'spec', path: 'spec.md', from: 14147, to: 14147, quote: 'the core operation order' },
  };
  const result = decideAll({
    obligations: [obligation],
    worklist,
    judgments: [record],
    attacks: [attack],
    artifactDigest: 'artifact',
    linesByPath: { 'spec.md': Array.from({ length: 20 }, (_, index) => (index === 14146 ? 'the core operation order' : 'other')) },
    sources: { 'spec.md': Array.from({ length: 14200 }, (_, index) => (index === 14146 ? 'the core operation order' : 'other')) },
    requireAnchor: true,
  });
  assert.equal(result.decisions[0].state, 'open');
  assert.equal(result.decisions[0].reason, 'ATTACK_ANCHOR_MISMATCH');
});
