// PX-306 @verifies C004
// Every reading file, not only judgment/attack/effort, owes a write receipt. A direct edit
// to a reading file leaves no receipt and must be refused with MISSING_WRITE_RECEIPT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  EVIDENCE_FILE_PATHS,
  writeEvidence,
} from '../../.claude/scripts/shared-obligations/evidence-writer.mjs';
import {
  validateWriteReceipts,
  writeReceiptFor,
} from '../../.claude/scripts/shared-obligations/evidence.mjs';
import { writeReadingsFile } from '../../.claude/scripts/educe-sequences/rail/readings.mjs';

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'px306-receipt-'));
  mkdirSync(join(root, 'educe-sequences'), { recursive: true });
  return root;
}

test('C004 every live reading file is in the receipt surface', () => {
  for (const name of [
    'readings-judgment.jsonl',
    'readings-attack.jsonl',
    'readings-effort.jsonl',
    'readings-inquest.jsonl',
    'readings-adversarial.jsonl',
    'readings-uncovered.jsonl',
    'readings-span.jsonl',
    'readings-adjudicate.jsonl',
    'readings-reroute.jsonl',
  ]) {
    assert.ok(EVIDENCE_FILE_PATHS.some((path) => path.endsWith(name)), name);
  }
});

test('C004 a reading file without a receipt is reported', () => {
  const root = tempRoot();
  try {
    for (const path of EVIDENCE_FILE_PATHS) writeFileSync(join(root, path), '{"ok":true}\n');
    const manifest = {
      writeReceipts: EVIDENCE_FILE_PATHS
        .filter((path) => path.endsWith('readings-judgment.jsonl'))
        .map((path) => writeReceiptFor(root, { kind: 'judgment', path, generation: 2 })),
    };
    const debt = validateWriteReceipts(manifest, { root, paths: EVIDENCE_FILE_PATHS, generation: 2 });
    assert.ok(debt.stale.some((entry) => entry.code === 'MISSING_WRITE_RECEIPT' && entry.path.endsWith('readings-inquest.jsonl')));
    assert.ok(debt.stale.some((entry) => entry.code === 'MISSING_WRITE_RECEIPT' && entry.path.endsWith('readings-span.jsonl')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C004 writing a readings file appends its write receipt when a manifest exists', () => {
  const root = tempRoot();
  try {
    const runDirectory = join(root, 'educe-sequences');
    writeFileSync(join(runDirectory, 'status.json'), JSON.stringify({ generation: 2 }));
    writeFileSync(join(runDirectory, 'EVIDENCE-MANIFEST.json'), JSON.stringify({
      schemaVersion: 1, spec: null, artifact: null, generation: 2, files: [], receipts: [], writeReceipts: [],
    }));
    const path = join(runDirectory, 'readings-inquest.jsonl');
    writeReadingsFile(path, [{ subject: 'boundary-001', lens: 'input', answer: 'Yes', reader: 'reader/generation-2' }]);
    const manifest = JSON.parse(readFileSync(join(runDirectory, 'EVIDENCE-MANIFEST.json'), 'utf8'));
    assert.ok(manifest.writeReceipts.some((receipt) => receipt.path === 'educe-sequences/readings-inquest.jsonl'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C004 the writer refuses a positive generation with no start', () => {
  const root = tempRoot();
  try {
    const result = writeEvidence({
      root,
      kind: 'effort',
      records: [],
      worklist: [],
      generation: 2,
      generationStartedAt: undefined,
      now: new Date('2026-10-22T00:00:00.000Z'),
    });
    assert.equal(result.ok, false);
    assert.equal(result.rejected[0].code, 'READING_NOT_REREAD');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
