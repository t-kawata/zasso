// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  validateManifestReceipts,
  validateReceipt,
} from '../../.claude/scripts/shared-obligations/evidence.mjs';
import {
  validateWorklistDigest,
  writeWorklist,
} from '../../.claude/scripts/smooth-sequences/lib/worklist.mjs';

// @verifies C012
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C012 a receipt whose input digest differs is stale', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const stale = validateReceipt({ phase: 8, inputs: { artifact: 'old' } }, { artifact: 'new' });
  assert.equal(stale.valid, false);
  assert.equal(stale.code, 'STALE_RECEIPT');
  assert.equal(validateReceipt({ phase: 8, inputs: { artifact: 'new' } }, { artifact: 'new' }).valid, true);
});

// @verifies C012
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C012 a stale manifest receipt is recorded as STALE_RECEIPT debt', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = validateManifestReceipts({
    receipts: [
      { phase: 8, inputs: { artifact: 'old' } },
      { phase: 9, inputs: { artifact: 'new' } },
    ],
  }, { artifact: 'new' });
  assert.equal(result.valid, false);
  assert.equal(result.stale.length, 1);
  assert.equal(result.stale[0].code, 'STALE_RECEIPT');
  assert.equal(result.stale[0].phase, 8);
});

// @verifies C013
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C013 an empty worklist is written with remainingOpen zero', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const root = mkdtempSync(join(tmpdir(), 'px295-worklist-'));
  try {
    writeWorklist(root, [], { generation: 30, worklistDigest: 'w' });
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
    const body = JSON.parse(readFileSync(join(root, 'smooth-sequences', 'JUDGMENT-WORKLIST.json'), 'utf8'));
    assert.deepEqual(body.items, []);
    assert.equal(body.remainingOpen, 0);
    assert.equal(body.schemaVersion, 2);
    assert.equal(body.generation, 30);
    assert.equal(body.worklistDigest, 'w');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C013
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C013 a worklist whose digest differs from the run is stale', () => {
  assert.equal(validateWorklistDigest({ worklistDigest: 'old' }, { worklistDigest: 'new' }).code, 'WORKLIST_STALE');
  assert.equal(validateWorklistDigest({ worklistDigest: 'new' }, { worklistDigest: 'new' }).ok, true);
});
