import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  validateAttackRecord,
  validateBasisEntry,
  validateEscape,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';
import { validateBlindAttack } from '../../.claude/scripts/shared-obligations/blind-attack.mjs';
import { resolveReadingsObligations, validateReadingCitation } from '../../.claude/scripts/shared-obligations/predicates.mjs';
import {
  sha256File,
  validateManifestReceipts,
  validateWriteReceipts,
} from '../../.claude/scripts/shared-obligations/evidence.mjs';
import { buildCertificate, V3_ASSURANCE_KEYS } from '../../.claude/scripts/shared-obligations/certificate.mjs';
import { EVIDENCE_FILE_BY_KIND } from '../../.claude/scripts/shared-obligations/evidence-writer.mjs';
import { propertyObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';
import { assertSingleReader } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';
import { pinnedColumnGroundingProblems } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { resolveActPatterns } from '../../.claude/scripts/smooth-sequences/lib/act-vocabulary.mjs';
import { validateWorklistDigest } from '../../.claude/scripts/smooth-sequences/lib/worklist.mjs';

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
// The evidence is authored inside the open regeneration transaction, so the staging
// root takes precedence: a run against it proves the ticket without touching live data.
const GAIA_ROOT = process.env.STAGING_ROOT || process.env.GAIA_ROOT || null;
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const SKIP = GAIA_ROOT === null ? 'STAGING_ROOT or GAIA_ROOT is not set' : false;
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const SPEC_NAME = 'GaiaSekkeiShiyousho_v32.md';
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const ARTIFACT_NAME = 'GaiaSekkeiShiyousho_v32-sequences.json';

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
function readJson(root, relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
function readJsonl(root, relative) {
  const path = join(root, relative);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
function subjectOf(obligationId) {
  const parts = String(obligationId ?? '').split(':');
  // FALSIFY carries one part after the prefix; JUDGE, DIST and READ carry two
  // (a kind and a subject), so slicing them together would drop the FALSIFY subject.
  if (parts[0] === 'FALSIFY') return parts.slice(1).join(':');
  if (parts[0] === 'JUDGE' || parts[0] === 'DIST' || parts[0] === 'READ') {
    return parts.slice(2).join(':');
  }
  if (parts[0] === 'RISK' || parts[0] === 'PROP') return parts.slice(1).join(':');
  return String(obligationId ?? '');
}

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
function loadContext() {
  const artifact = readJson(GAIA_ROOT, ARTIFACT_NAME);
  const allocate = readJson(GAIA_ROOT, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
  const tree = readJson(GAIA_ROOT, 'WORKSPACIFY-TREE-MANIFEST.json');
  const linesByPath = { [SPEC_NAME]: readFileSync(join(GAIA_ROOT, SPEC_NAME), 'utf8').split('\n') };
  const rfcByPackage = {};
  for (const pkg of tree.workspace?.packages ?? []) {
    const path = join(GAIA_ROOT, pkg.path, 'RFC.md');
    if (existsSync(path)) rfcByPackage[pkg.id] = { path: join(pkg.path, 'RFC.md'), lines: readFileSync(path, 'utf8').split('\n') };
  }
  return {
    artifact,
    contractRegistry: allocate.contract_registry ?? [],
    rfcByPackage,
    linesByPath,
  };
}

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
function currentReceiptDigests(root) {
  const digests = {
    spec: sha256File(join(root, SPEC_NAME)),
    artifact: sha256File(join(root, ARTIFACT_NAME)),
  };
  const declaration = join(root, 'educe-sequences', 'declaration.json');
  if (existsSync(declaration)) digests.declaration = sha256File(declaration);
  const worklist = join(root, 'educe-sequences', 'worklist.txt');
  if (existsSync(worklist)) digests.worklist = sha256File(worklist);
  return digests;
}

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const context = loadContext();
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const judgments = readJsonl(GAIA_ROOT, join('educe-sequences', 'readings-judgment.jsonl'));
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const attacks = readJsonl(GAIA_ROOT, join('educe-sequences', 'readings-attack.jsonl'));
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const inquest = readJsonl(GAIA_ROOT, join('educe-sequences', 'readings-inquest.jsonl'));
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const uncovered = readJsonl(GAIA_ROOT, join('educe-sequences', 'readings-uncovered.jsonl'));
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const status = readJson(GAIA_ROOT, join('educe-sequences', 'status.json'));
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
const generation = status.generation;

// @verifies C001
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C001 every judgment basis resolves and carries the current generation', { skip: SKIP }, () => {
  assert.ok(judgments.length > 0, 'no judgment records were read');
  for (const record of judgments) {
    for (const basis of record.basis ?? []) {
      const result = validateBasisEntry(basis, {}, {
        ...context,
        subject: subjectOf(record.obligationId),
      });
      assert.equal(result.ok, true, `${record.obligationId}: ${result.code}`);
    }
    assert.equal(record.readerGeneration, generation, record.obligationId);
    assert.equal(typeof record.readAt, 'string', record.obligationId);
  }
});

// @verifies C002
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C002 every non-adversarial attack is blind, literal and independent', { skip: SKIP }, () => {
  const reader = `educe-sequences/generation-${generation}`;
  const attackReader = `${reader}/attack`;
  for (const attack of attacks) {
    if (String(attack.obligationId).startsWith('READ:ADVERSARIAL:')) continue;
    const judgment = judgments.find((record) => record.obligationId === attack.obligationId);
    const result = validateBlindAttack(attack, {
      obligationId: attack.obligationId,
      subject: subjectOf(attack.obligationId),
      reader,
      attackReader,
      basisQuotes: (judgment?.basis ?? []).map((basis) => basis.quote).filter(Boolean),
    });
    assert.equal(result.ok, true, `${attack.obligationId}: ${result.code}`);
  }
});

// @verifies C003
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C003 every inquest answer is current-generation and cites its line', { skip: SKIP }, () => {
  assert.ok(inquest.length > 0, 'no inquest rows were read');
  for (const row of inquest) {
    const citation = validateReadingCitation(row, context.linesByPath);
    assert.equal(citation.ok, true, `${row.subject}:${row.lens}: ${citation.code}`);
    assert.equal(row.readerGeneration, generation, `${row.subject}:${row.lens}`);
    assert.equal(row.inheritedFrom, undefined, `${row.subject}:${row.lens}`);
  }
});

// @verifies C004
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C004 every uncovered row is a grounded escape', { skip: SKIP }, () => {
  const actPatterns = resolveActPatterns(context.artifact);
  for (const row of uncovered) {
    const result = validateEscape({
      escape: { ...row, escapeKind: row.escapeKind ?? 'no_act' },
      linesByPath: context.linesByPath,
      actPatterns,
    });
    assert.equal(result.ok, true, `${row.subject}: ${result.code}`);
  }
});

// @verifies C005
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C005 receipts and worklist match the final artifact', { skip: SKIP }, () => {
  const manifest = readJson(GAIA_ROOT, join('educe-sequences', 'EVIDENCE-MANIFEST.json'));
  const receipts = validateManifestReceipts(manifest, currentReceiptDigests(GAIA_ROOT));
  assert.equal(receipts.valid, true, `stale phases: ${receipts.stale.map((row) => row.phase).join(',')}`);
  const writeReceipts = validateWriteReceipts(manifest, {
    root: GAIA_ROOT,
    paths: Object.values(EVIDENCE_FILE_BY_KIND),
    generation,
  });
  assert.equal(writeReceipts.valid, true, `write receipt debt: ${writeReceipts.stale.map((row) => row.code).join(',')}`);
  const worklist = readJson(GAIA_ROOT, join('smooth-sequences', 'JUDGMENT-WORKLIST.json'));
  assert.equal(worklist.schemaVersion, 2);
  assert.equal(worklist.remainingOpen, worklist.items.length);
  assert.equal(validateWorklistDigest(worklist, { worklistDigest: worklist.worklistDigest }).ok, true);
});

// @verifies C006
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C006 the final certificate is schema 3 and every v3 counter is clean', { skip: SKIP }, () => {
  const certificate = readJson(GAIA_ROOT, join('smooth-sequences', 'COMPLETION-CERTIFICATE.json'));
  assert.equal(certificate.schemaVersion, 3);
  assert.equal(certificate.assuranceSchemaVersion, 1);
  assert.equal(certificate.status, 'complete');
  assert.deepEqual(certificate.open ?? [], []);
  assert.equal(certificate.waived ?? 0, 0);
  for (const key of V3_ASSURANCE_KEYS) {
    const value = certificate.assurance[key];
    if (key === 'templateAttackRatio' || key === 'inheritedRatio'
      || key === 'escapeActConflictCount' || key === 'staleReceiptCount'
      || key === 'staleReaderGenerationCount' || key === 'generationMismatchCount') {
      assert.equal(value, 0, key);
    } else if (key !== 'rereadCount') {
      assert.equal(value, 1, key);
    }
  }
});

// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('subjectOf keeps the whole subject for every obligation prefix', () => {
  assert.equal(subjectOf('FALSIFY:CreateForum'), 'CreateForum');
  assert.equal(subjectOf('JUDGE:ERRORS:boundary-018'), 'boundary-018');
  assert.equal(subjectOf('READ:ADVERSARIAL:G-1'), 'G-1');
  assert.equal(subjectOf('RISK:CreateAssetRecord:replay'), 'CreateAssetRecord:replay');
});

// @verifies C001
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C001 every empty pinned column is grounded absent, not an open property obligation', { skip: SKIP }, () => {
  const properties = propertyObligations(context.artifact);
  assert.equal(properties.length, 106);
  assert.deepEqual(properties.filter((entry) => entry.state === 'open'), []);
  for (const entry of properties) {
    assert.equal(entry.reason, 'GROUNDED_ABSENT', entry.id);
    const ground = entry.evidence?.[0] ?? {};
    assert.equal(typeof ground.classification, 'string', entry.id);
    assert.equal(typeof ground.quote, 'string', entry.id);
  }
});

// @verifies C001
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C001 an unresolved basis names the field, the quote or the shape it lacks', () => {
  const phantom = validateBasisEntry(
    { source: 'artifact', id: 'NoSuchOperation', field: 'required_proof_classes', quote: 'x' },
    {},
    { artifact: context.artifact, subject: 'NoSuchOperation' },
  );
  assert.equal(phantom.code, 'BASIS_FIELD_UNRESOLVED');

  const missingQuote = validateBasisEntry(
    { source: 'artifact', id: 'CreateAssetRecord', field: 'allowed_status_transitions' },
    {},
    { artifact: context.artifact, subject: 'CreateAssetRecord' },
  );
  assert.equal(missingQuote.code, 'BASIS_QUOTE_MISSING');

  const noSource = validateBasisEntry({ id: 'CreateForum' }, {}, {});
  assert.equal(noSource.code, 'BASIS_SHAPE');
});

// @verifies C002
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C002 every Tier 1 subject carries a held attack that names the subject', { skip: SKIP }, () => {
  const tierOne = new Set([
    ...(context.artifact.operations ?? [])
      .filter((operation) => operation.disposition === 'active')
      .map((operation) => operation.id),
    ...(context.artifact.sequences ?? [])
      .filter((sequence) => ['direct', 'viaNeighbour', 'singleStep'].includes(sequence.outcome))
      .map((sequence) => sequence.id),
  ]);
  const heldSubjects = new Set(attacks
    .filter((attack) => attack.outcome === 'held' && typeof attack.subject === 'string')
    .map((attack) => attack.subject));
  const uncovered = [...tierOne].filter((subject) => !heldSubjects.has(subject));
  assert.deepEqual(uncovered, []);
});

// @verifies C002
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C002 an attack by the judgment reader or copied from the basis is refused', () => {
  const item = {
    obligationId: 'FALSIFY:CreateForum',
    subject: 'CreateForum',
    reader: 'educe-sequences/generation-14',
    attackReader: 'educe-sequences/generation-14/attack',
    attackTier: 'tier1',
  };
  const selfAttack = validateAttackRecord(
    {
      obligationId: 'FALSIFY:CreateForum',
      reader: 'educe-sequences/generation-14',
      outcome: 'held',
      searched: { source: 'spec', path: SPEC_NAME, from: 1, to: 1, quote: 'x' },
    },
    { reader: 'educe-sequences/generation-14', basis: [] },
    { ...item, attackReader: 'educe-sequences/generation-14' },
  );
  assert.equal(selfAttack.code, 'SELF_ATTACK');

  const copied = validateBlindAttack(
    {
      blind: true,
      reader: 'educe-sequences/generation-14/attack',
      searched: { quote: 'the same quote' },
      attack: 'CreateForum cannot be performed',
    },
    { obligationId: 'FALSIFY:CreateForum', subject: 'CreateForum', basisQuotes: ['the same quote'] },
  );
  assert.equal(copied.code, 'ATTACK_SAME_AS_BASIS');

  const generic = validateBlindAttack(
    {
      blind: true,
      reader: 'educe-sequences/generation-14/attack',
      searched: { quote: 'another quote' },
      attack: 'the claim is false',
    },
    { obligationId: 'FALSIFY:CreateForum', subject: 'CreateForum', basisQuotes: ['the same quote'] },
  );
  assert.equal(generic.code, 'ATTACK_SUBJECT_GENERIC');
});

// @verifies C003
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C003 a stale or inherited inquest answer reopens its obligation', () => {
  const base = {
    subject: '@object:AssetScore',
    lens: 'omission',
    question: 'is a required act absent from this subject',
    answer: 'No',
    line: 17,
    quote: 'quote',
    reader: 'educe-sequences/generation-13',
    readerGeneration: 13,
    readAt: '2026-10-22T01:53:36.462Z',
  };
  const obligation = {
    id: 'READ:INQUEST:@object:AssetScore:omission',
    kind: 'reading',
    class: 'semantic',
    state: 'open',
    subject: '@object:AssetScore:omission',
  };
  const stale = resolveReadingsObligations([obligation], {
    readings: { inquest: [base] },
    generation: 14,
  });
  assert.equal(stale[0].state, 'open');
  assert.equal(stale[0].reason, 'READER_GENERATION_STALE');

  const inherited = resolveReadingsObligations([obligation], {
    readings: { inquest: [{ ...base, readerGeneration: 14, inheritedFrom: 'educe-sequences/generation-13' }] },
    generation: 14,
    inheritedPolicy: 'block',
  });
  assert.equal(inherited[0].state, 'open');
  assert.equal(inherited[0].reason, 'INHERITED_READING');
});

// @verifies C004
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C004 no active pinned column is empty without a per-column grounding', { skip: SKIP }, () => {
  assert.deepEqual(pinnedColumnGroundingProblems(context.artifact, context.linesByPath[SPEC_NAME]), []);
});

// @verifies C005
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C005 the manifest names the artifact digest it receipts', { skip: SKIP }, () => {
  const manifest = readJson(GAIA_ROOT, join('educe-sequences', 'EVIDENCE-MANIFEST.json'));
  assert.equal(manifest.generation, generation);
  assert.equal(manifest.artifact.sha256, sha256File(join(GAIA_ROOT, ARTIFACT_NAME)));
  for (const receipt of manifest.receipts) {
    assert.equal(receipt.inputs.artifact, manifest.artifact.sha256, `phase ${receipt.phase}`);
  }
});

// @verifies C005
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C005 a receipt that names another artifact digest is stale', { skip: SKIP }, () => {
  const manifest = readJson(GAIA_ROOT, join('educe-sequences', 'EVIDENCE-MANIFEST.json'));
  // The receipt, not the manifest header, is what binds a phase to an artifact.
  const staleManifest = {
    ...manifest,
    receipts: manifest.receipts.map((receipt) => ({
      ...receipt,
      inputs: { ...receipt.inputs, artifact: '0'.repeat(64) },
    })),
  };
  const verdict = validateManifestReceipts(staleManifest, currentReceiptDigests(GAIA_ROOT));
  assert.equal(verdict.valid, false);
  assert.equal(verdict.stale.length > 0, true);
});

// @verifies C006
// [::TICKET::] PX-299 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C006 an open obligation forces an incomplete certificate', () => {
  const forced = buildCertificate({
    obligations: [{ id: 'JUDGE:ERRORS:boundary-018', kind: 'judgment', class: 'semantic', state: 'open' }],
  });
  assert.equal(forced.status, 'incomplete');
  assert.equal(forced.open.length, 1);
  assert.equal(forced.open[0].id, 'JUDGE:ERRORS:boundary-018');
  assert.equal(forced.open[0].code, 'NO_DECISION');
});
