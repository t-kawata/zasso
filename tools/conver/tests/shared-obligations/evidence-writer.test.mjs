// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readManifestAt,
  sha256File,
  validateWriteReceipts,
} from '../../.claude/scripts/shared-obligations/evidence.mjs';
import {
  validateForKind,
  writeEvidence,
} from '../../.claude/scripts/shared-obligations/evidence-writer.mjs';

// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
const GENERATION = 47;
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
const GENERATION_STARTED_AT = '2026-10-23T00:00:00.000Z';
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
const NOW = new Date('2026-10-23T01:00:00.000Z');
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
const ARTIFACT = { operations: [{ id: 'OpA', purpose: 'the purpose text' }] };
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
const ARTIFACT_DIGEST = 'a1';
// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-297 --for-spec --no-implementation-order`.
const JUDGMENT_FILE = 'educe-sequences/readings-judgment.jsonl';

// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function item(overrides = {}) {
  return {
    obligationId: 'PROP:OpA:purpose',
    subject: 'OpA:purpose',
    kind: 'property',
    contextDigest: 'c1',
    worklistDigest: 'w1',
    artifactDigest: ARTIFACT_DIGEST,
    reader: 'reader-1',
    attackReader: 'reader-1/attack',
    requireRecordId: true,
    requireEffort: true,
    generation: GENERATION,
    generationStartedAt: GENERATION_STARTED_AT,
    attackTier: 'tier1',
    answerVocabulary: ['present', 'absent'],
    ...overrides,
  };
}

// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function judgment(overrides = {}) {
  return {
    schemaVersion: 2,
    obligationId: 'PROP:OpA:purpose',
    contextDigest: 'c1',
    worklistDigest: 'w1',
    artifactDigest: ARTIFACT_DIGEST,
    verdict: 'present',
    basis: [{ source: 'artifact', id: 'OpA', field: 'purpose', quote: 'the purpose text' }],
    reader: 'reader-1',
    ...overrides,
  };
}

// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function write(root, records, options = {}) {
  return writeEvidence({
    root,
    kind: 'judgment',
    records,
    worklist: { items: [item(options.item)] },
    judgments: [],
    artifact: ARTIFACT,
    artifactDigest: ARTIFACT_DIGEST,
    generation: GENERATION,
    generationStartedAt: GENERATION_STARTED_AT,
    now: NOW,
    ...options,
  });
}

// [::TICKET::] PX-297 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function rowsAt(root) {
  return readFileSync(join(root, JUDGMENT_FILE), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

test('C001 a valid batch is written with writer-stamped generation and read time', () => {
  const root = mkdtempSync(join(tmpdir(), 'px297-writer-'));
  try {
    const result = write(root, [judgment()]);
    assert.equal(result.ok, true);
    const [row] = rowsAt(root);
    assert.equal(row.readerGeneration, GENERATION);
    assert.equal(row.readAt, NOW.toISOString());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C001 a rejected batch writes nothing and leaves the previous file intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'px297-writer-'));
  try {
    write(root, [judgment()]);
    const before = readFileSync(join(root, JUDGMENT_FILE), 'utf8');
    const result = write(root, [
      judgment(),
      judgment({
        obligationId: 'PROP:OpA:missing',
        basis: [{ source: 'artifact', id: 'OpA', field: 'missing', quote: 'x' }],
      }),
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.written.length, 0);
    assert.equal(readFileSync(join(root, JUDGMENT_FILE), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a reader-supplied stamp is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'px297-writer-'));
  try {
    const result = write(root, [judgment({ readAt: NOW.toISOString(), readerGeneration: GENERATION })]);
    assert.equal(result.ok, false);
    assert.equal(result.rejected[0].code, 'WRITER_STAMPED_FIELD');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C003 a written file receives a matching write receipt', () => {
  const root = mkdtempSync(join(tmpdir(), 'px297-writer-'));
  try {
    write(root, [judgment()]);
    const manifest = readManifestAt(join(root, 'educe-sequences'));
    assert.equal(Array.isArray(manifest.writeReceipts), true);
    const receipt = manifest.writeReceipts.find((entry) => entry.path === JUDGMENT_FILE);
    assert.equal(receipt.generation, GENERATION);
    assert.equal(receipt.sha256, sha256File(join(root, JUDGMENT_FILE)));
    assert.equal(validateWriteReceipts(manifest, {
      root,
      paths: [JUDGMENT_FILE],
      generation: GENERATION,
    }).valid, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C003 a missing or mismatched write receipt is rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'px297-writer-'));
  try {
    write(root, [judgment()]);
    const missing = validateWriteReceipts({ writeReceipts: [] }, {
      root,
      paths: [JUDGMENT_FILE],
      generation: GENERATION,
    });
    assert.equal(missing.stale[0].code, 'MISSING_WRITE_RECEIPT');

    writeFileSync(join(root, JUDGMENT_FILE), 'different\n');
    const manifest = readManifestAt(join(root, 'educe-sequences'));
    const mismatched = validateWriteReceipts(manifest, {
      root,
      paths: [JUDGMENT_FILE],
      generation: GENERATION,
    });
    assert.equal(mismatched.stale[0].code, 'EVIDENCE_DIGEST_MISMATCH');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C003 an attack that copies the basis quote is rejected', () => {
  const attack = {
    obligationId: 'PROP:OpA:purpose',
    contextDigest: 'c1',
    worklistDigest: 'w1',
    outcome: 'held',
    blind: true,
    reader: 'reader-1/attack',
    searched: { source: 'artifact', path: 'artifact.json', line: 1, from: 1, to: 1, quote: 'the purpose text' },
    attack: 'searched OpA:purpose for a contradiction; none was found.',
    counterexampleAttempt: { candidate: 'the purpose is absent', whyItFails: 'the row carries it' },
  };
  const result = validateForKind('attack', attack, item(), {
    judgments: [judgment()],
    artifact: ARTIFACT,
    artifactDigest: ARTIFACT_DIGEST,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ATTACK_SAME_AS_BASIS');
});

test('C001 an effort trace that searches one row is rejected', () => {
  const effort = {
    obligationId: 'PROP:OpA:purpose',
    searched: [{ source: 'artifact', path: 'artifact.json', line: 1, quote: 'the purpose text' }],
    alternatives: [],
    counterexampleAttempt: { candidate: 'the purpose is absent from the row', whyItFails: 'the row carries it' },
    discriminator: { basisRef: 'operations[OpA].purpose', ifAbsentOrFalse: 'absent' },
    uncertainty: { level: 'low' },
  };
  const result = validateForKind('effort', effort, item());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EFFORT_SHALLOW');
});

// @verifies C001
// [::TICKET::] PX-299 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-299 --for-spec --no-implementation-order`.
test('C001 an effort trace is validated against the judgment verdict', () => {
  const effort = {
    obligationId: 'PROP:OpA:purpose',
    searched: [
      { source: 'artifact', path: 'artifact.json', line: 1, quote: 'the purpose text' },
      { source: 'spec', path: 'spec.md', line: 2, quote: 'the purpose clause' },
    ],
    alternatives: [{ verdict: 'absent', rejectedBecause: 'the operation row states the purpose text' }],
    counterexampleAttempt: {
      candidate: 'the purpose field is empty on the operation row',
      source: { path: 'spec.md', line: 2, quote: 'the purpose clause' },
      whyItFails: 'the artifact row carries a non-empty purpose value',
    },
    discriminator: { basisRef: 'operations[OpA].purpose', ifAbsentOrFalse: 'absent' },
    uncertainty: { level: 'low' },
  };
  const result = validateForKind('effort', effort, item(), { judgments: [judgment()] });
  assert.equal(result.ok, true);
});
