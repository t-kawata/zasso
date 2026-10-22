import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  validateBasisEntry,
  validateEscape,
  validatePositionDisposition,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';
import { validateBlindAttack } from '../../.claude/scripts/shared-obligations/blind-attack.mjs';
import { validateReadingCitation } from '../../.claude/scripts/shared-obligations/predicates.mjs';
import {
  sha256File,
  validateManifestReceipts,
} from '../../.claude/scripts/shared-obligations/evidence.mjs';
import {
  V3_ASSURANCE_KEYS,
} from '../../.claude/scripts/shared-obligations/certificate.mjs';
import { validateWorklistDigest } from '../../.claude/scripts/smooth-sequences/lib/worklist.mjs';

const GAIA_ROOT = process.env.GAIA_ROOT || '/Users/kawata/shyme/gaia';
const SPEC_NAME = 'GaiaSekkeiShiyousho_v32.md';
const ARTIFACT_NAME = 'GaiaSekkeiShiyousho_v32-sequences.json';
const ACT_PATTERNS = Object.freeze([
  '導入する', '追記する', '起動し', '確かめる', '記録する', '作成する', '発行する',
  '実行する', '送信する', '更新する', '削除する', '登録する', '提出する', '公開する',
  '支払う', '移転する', '承認する', '拒否する', '検証する', '付与する',
]);

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function readJsonl(path) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/** The subject named by an obligation id, without its kind prefix. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function subjectOf(obligationId) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const parts = String(obligationId ?? '').split(':');
  if (parts[0] === 'JUDGE' || parts[0] === 'DIST' || parts[0] === 'FALSIFY' || parts[0] === 'READ') {
    return parts.slice(2).join(':');
  }
  if (parts[0] === 'RISK' || parts[0] === 'PROP') return parts.slice(1).join(':');
  return String(obligationId ?? '');
}
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function readRfcByPackage(root) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const manifest = JSON.parse(readFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
  const result = {};
  for (const pkg of manifest.workspace?.packages ?? []) {
    const relative = join(pkg.path, 'RFC.md');
    const path = join(root, relative);
    if (!existsSync(path)) continue;
    result[pkg.id] = { path: relative, lines: readFileSync(path, 'utf8').split('\n') };
  }
  return result;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function currentReceiptDigests(root) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const digests = {
    spec: sha256File(join(root, SPEC_NAME)),
    artifact: sha256File(join(root, ARTIFACT_NAME)),
  };
  const declaration = join(root, 'educe-sequences', 'declaration.json');
  if (existsSync(declaration)) digests.declaration = sha256File(declaration);
  const worklist = join(root, 'educe-sequences', 'worklist.txt');
  if (existsSync(worklist)) digests.worklist = sha256File(worklist);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  return digests;
}

// [::TICKET::] PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-296 --for-spec --no-implementation-order`.
// [::TICKET::] PX-296, PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-296|PX-295, PX-296) --for-spec --no-implementation-order`.
function loadContext() {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const artifact = JSON.parse(readFileSync(join(GAIA_ROOT, ARTIFACT_NAME), 'utf8'));
  const allocate = JSON.parse(readFileSync(join(GAIA_ROOT, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), 'utf8'));
  return {
    artifact,
    contractRegistry: allocate.contract_registry ?? [],
    rfcByPackage: readRfcByPackage(GAIA_ROOT),
    linesByPath: { [SPEC_NAME]: readFileSync(join(GAIA_ROOT, SPEC_NAME), 'utf8').split('\n') },
  };
}

const context = loadContext();
const judgments = readJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-judgment.jsonl'));
const attacks = readJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-attack.jsonl'));
const uncovered = readJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-uncovered.jsonl'));
const inquest = readJsonl(join(GAIA_ROOT, 'educe-sequences', 'readings-inquest.jsonl'));
const waiverPath = join(GAIA_ROOT, 'SMOOTH-SEQUENCES-WAIVERS.json');
const waiverKeys = new Set(
  (existsSync(waiverPath) ? JSON.parse(readFileSync(waiverPath, 'utf8')).waivers ?? [] : [])
    .filter((waiver) => typeof waiver?.ground === 'string' && waiver.ground.trim() !== '')
    .map((waiver) => waiver.findingKey),
);

// @verifies C001
test('C001 every judgment basis resolves in the current artifact, registry or RFC', () => {
  assert.ok(judgments.length > 0, 'no judgment records were read');
  for (const record of judgments) {
    for (const basis of record.basis ?? []) {
      const result = validateBasisEntry(basis, {}, {
        ...context,
        subject: subjectOf(record.obligationId),
      });
      assert.equal(result.ok, true, `${record.obligationId}: ${result.code}`);
    }
  }
});

// @verifies C002
test('C002 every non-adversarial attack is blind, literal and independent', () => {
  const status = JSON.parse(readFileSync(join(GAIA_ROOT, 'educe-sequences', 'status.json'), 'utf8'));
  const reader = `educe-sequences/generation-${status.generation}`;
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
test('C003 every escape is act-consistent and every position pair is consistent', () => {
  for (const row of uncovered) {
    const result = validateEscape({
      escape: { ...row, escapeKind: row.escapeKind ?? 'no_act' },
      linesByPath: context.linesByPath,
      actPatterns: ACT_PATTERNS,
    });
    assert.equal(result.ok, true, `${row.subject}: ${result.code}`);
  }
  for (const operation of context.artifact.operations ?? []) {
    const result = validatePositionDisposition(operation);
    if (result.ok) continue;
    const key = `S6.position-disposition-conflict\u0000${operation.id}`;
    assert.equal(
      waiverKeys.has(key),
      true,
      `${operation.id}: ${result.code} without a grounded waiver`,
    );
  }
});

// @verifies C004
test('C004 every reading quote is on its line and freshness is explicit', () => {
  for (const row of inquest) {
    const citation = validateReadingCitation(row, context.linesByPath);
    assert.equal(citation.ok, true, `${row.subject}:${row.lens}: ${citation.code}`);
    assert.equal(
      row.reRead === true || row.inheritedFrom !== undefined,
      true,
      `${row.subject}:${row.lens}: neither reRead nor inheritedFrom is recorded`,
    );
  }
});

// @verifies C005
test('C005 every receipt matches the current digests and the worklist is current', () => {
  const manifest = JSON.parse(readFileSync(join(GAIA_ROOT, 'educe-sequences', 'EVIDENCE-MANIFEST.json'), 'utf8'));
  const receipts = validateManifestReceipts(manifest, currentReceiptDigests(GAIA_ROOT));
  assert.equal(receipts.valid, true, `stale phases: ${receipts.stale.map((row) => row.phase).join(',')}`);

  const worklistPath = join(GAIA_ROOT, 'smooth-sequences', 'JUDGMENT-WORKLIST.json');
  const worklist = JSON.parse(readFileSync(worklistPath, 'utf8'));
  assert.equal(worklist.schemaVersion, 2, 'the worklist is not schema 2');
  assert.equal(worklist.remainingOpen, worklist.items.length, 'remainingOpen does not match items');
  assert.equal(validateWorklistDigest(worklist, { worklistDigest: worklist.worklistDigest }).ok, true);
});

// @verifies C006
test('C006 the final certificate is schema 3 and every v3 counter is clean', () => {
  const path = join(GAIA_ROOT, 'smooth-sequences', 'COMPLETION-CERTIFICATE.json');
  const certificate = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(certificate.schemaVersion, 3);
  assert.equal(certificate.status, 'complete');
  for (const key of V3_ASSURANCE_KEYS) {
    const value = certificate.assurance[key];
    if (key === 'templateAttackRatio' || key === 'inheritedRatio'
      || key === 'escapeActConflictCount' || key === 'staleReceiptCount') {
      assert.equal(value, 0, key);
    } else {
      assert.equal(value, 1, key);
    }
  }
});
