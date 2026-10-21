import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  archiveGeneratedEvidence,
  resetManifestReceipts,
  restoreInquestReaders,
} from '../../.claude/scripts/smooth-sequences/lib/re-evidence.mjs';
import { sha256File } from '../../.claude/scripts/shared-obligations/evidence.mjs';

// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'px293-re-evidence-'));
  mkdirSync(join(root, 'educe-sequences'), { recursive: true });
  mkdirSync(join(root, 'smooth-sequences'), { recursive: true });
  writeFileSync(join(root, 'educe-sequences', 'readings-judgment.jsonl'), '{"obligationId":"X"}\n');
  writeFileSync(join(root, 'educe-sequences', 'readings-attack.jsonl'), '{"subject":"X"}\n');
  writeFileSync(join(root, 'educe-sequences', 'readings-uncovered.jsonl'), '{"subject":"X"}\n');
  writeFileSync(join(root, 'educe-sequences', 'readings-inquest.jsonl'), `${JSON.stringify({
    subject: 's1',
    lens: 'omission',
    answer: 'No',
    line: 1,
    quote: 'q',
    reader: 'remediation/PX-290',
    originalReader: 'educe-sequences/2026-10-15-generation10',
    anchor: { quote: 's1' },
  })}\n`);
  writeFileSync(join(root, 'educe-sequences', 'EVIDENCE-MANIFEST.json'), JSON.stringify({
    schemaVersion: 1,
    generation: null,
    files: [],
    receipts: [{ phase: 13, inputs: { spec: 'old' } }],
  }, null, 2));
  writeFileSync(join(root, 'smooth-sequences', 'REMEDIATION-OBLIGATIONS.json'), '{"obligations":[]}\n');
  writeFileSync(join(root, 'smooth-sequences', 'COMPLETION-CERTIFICATE.json'), '{"status":"complete"}\n');
  writeFileSync(join(root, 'smooth-sequences', 'JUDGMENT-WORKLIST.json'), '[]\n');
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}

// @verifies C001
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
test('archiving copies generated evidence with digests and removes it from the live set', () => {
  const space = workspace();
  try {
    const before = sha256File(join(space.root, 'educe-sequences', 'readings-judgment.jsonl'));
    const archived = archiveGeneratedEvidence(space.root);
    assert.equal(existsSync(join(space.root, 'educe-sequences', 'readings-judgment.jsonl')), false);
    assert.equal(existsSync(join(space.root, 'smooth-sequences', 'REMEDIATION-OBLIGATIONS.json')), false);
    assert.equal(existsSync(join(space.root, 'educe-sequences', 'readings-inquest.jsonl')), true);
    const archivedPath = join(archived.directory, 'educe-sequences', 'readings-judgment.jsonl');
    assert.equal(existsSync(archivedPath), true);
    assert.equal(sha256File(archivedPath), before);
    const index = JSON.parse(readFileSync(join(archived.directory, 'INDEX.json'), 'utf8'));
    assert.equal(index.files.find((entry) => entry.path.endsWith('readings-judgment.jsonl')).sha256, before);
  } finally {
    space.remove();
  }
});

// @verifies C002
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
test('restoring the inquest keeps the original reader and drops remediation fields', () => {
  const space = workspace();
  try {
    const report = restoreInquestReaders(space.root);
    const [row] = readFileSync(join(space.root, 'educe-sequences', 'readings-inquest.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(row.reader, 'educe-sequences/2026-10-15-generation10');
    assert.equal(row.originalReader, undefined);
    assert.equal(row.anchor, undefined);
    assert.equal(report.total, 1);
    assert.equal(report.restored, 1);
    assert.equal(report.withoutOriginal, 0);
  } finally {
    space.remove();
  }
});

// @verifies C003
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
test('resetting the manifest receipts makes a later generation re-open its read phases', () => {
  const space = workspace();
  try {
    const result = resetManifestReceipts(space.root);
    assert.equal(result.receipts, 0);
    const manifest = JSON.parse(readFileSync(join(space.root, 'educe-sequences', 'EVIDENCE-MANIFEST.json'), 'utf8'));
    assert.deepEqual(manifest.receipts, []);
  } finally {
    space.remove();
  }
});
