// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
// P22-11 @verifies C002
// T5: the logical architecture is held as a layer of its own above the physical
// layout. Agreement is not the pass condition — a mismatch that nobody wrote
// down is. That is the whole point: the existing technical debt must be recorded
// rather than frozen into the canonical record as if it were a design.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ARCHITECTURE_DELTA_FILE_NAME,
  assertDeltaRecorded,
  loadArchitectureDelta,
  recordArchitectureDelta,
} from '../../../.claude/scripts/workspacify-tree/lib/architecture-delta.mjs';

// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
test('T5 names the artefact it records into', () => {
  assert.equal(ARCHITECTURE_DELTA_FILE_NAME, 'ARCHITECTURE-DELTA.json');
});

test('T5 records a mismatch when the delta already names it', () => {
  const differences = [{ kind: 'extra', path: 'src/audio', layer: 'core' }];
  const delta = recordArchitectureDelta({ differences, recorded: [...differences] });
  assert.equal(delta.unrecorded.length, 0);
  assert.equal(delta.recorded.length, 1);
  assert.deepEqual(delta.recorded[0], { kind: 'extra', path: 'src/audio', layer: 'core' });
  assert.deepEqual(delta.differences, differences);
});

test('T5 treats a mismatch recorded with a different direction as unrecorded', () => {
  const delta = recordArchitectureDelta({
    differences: [{ kind: 'missing', path: 'src/api' }],
    recorded: [{ kind: 'extra', path: 'src/api' }],
  });
  assert.deepEqual(delta.unrecorded, [{ kind: 'missing', path: 'src/api' }]);
});

test('T5 fails on an unrecorded mismatch and names every path it found', () => {
  const record = assertDeltaRecorded({
    differences: [
      { kind: 'missing', path: 'src/api' },
      { kind: 'extra', path: 'src/audio' },
    ],
    recorded: [{ kind: 'extra', path: 'src/audio' }],
    deltaFileExists: true,
  });
  assert.equal(record.gateId, 'T5');
  assert.equal(record.status, 'FAIL');
  assert.deepEqual(record.unrecorded, ['src/api']);
  assert.equal(record.counts.differences, 2);
  assert.equal(record.counts.unrecorded, 1);
  assert.match(record.reasons.join('\n'), /src\/api/);
});

test('T5 passes on a recorded mismatch, because agreement is not the pass condition', () => {
  const record = assertDeltaRecorded({
    differences: [{ kind: 'extra', path: 'src/audio' }],
    recorded: [{ kind: 'extra', path: 'src/audio' }],
    deltaFileExists: true,
  });
  assert.equal(record.status, 'PASS');
  assert.equal(record.counts.differences, 1);
  assert.equal(record.counts.unrecorded, 0);
  assert.match(record.reasons.join('\n'), /recorded/i);
});

test('T5 still requires the record to exist when there is no mismatch at all', () => {
  const present = assertDeltaRecorded({ differences: [], recorded: [], deltaFileExists: true });
  assert.equal(present.status, 'PASS');
  assert.equal(present.counts.differences, 0);

  const absent = assertDeltaRecorded({ differences: [], recorded: [], deltaFileExists: false });
  assert.equal(absent.status, 'FAIL');
  assert.match(absent.reasons.join('\n'), /ARCHITECTURE-DELTA\.json/);
});

test('T5 reads the authored delta file and reports its absence rather than inventing an empty one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workspacify-tree-delta-'));
  try {
    const deltaPath = join(dir, ARCHITECTURE_DELTA_FILE_NAME);
    const beforeAuthoring = loadArchitectureDelta(deltaPath);
    assert.equal(beforeAuthoring.exists, false);
    assert.deepEqual(beforeAuthoring.mismatches, []);

    writeFileSync(deltaPath, JSON.stringify({ mismatches: [{ kind: 'extra', path: 'src/audio' }] }, null, 2));
    const afterAuthoring = loadArchitectureDelta(deltaPath);
    assert.equal(afterAuthoring.exists, true);
    assert.deepEqual(afterAuthoring.mismatches, [{ kind: 'extra', path: 'src/audio' }]);
    assert.match(readFileSync(deltaPath, 'utf8'), /src\/audio/, 'the authored record is what the gate reads');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('T5 rejects a delta file that carries no mismatch list', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workspacify-tree-delta-'));
  try {
    const deltaPath = join(dir, ARCHITECTURE_DELTA_FILE_NAME);
    writeFileSync(deltaPath, JSON.stringify({ note: 'the architecture looked fine to me' }));
    assert.throws(() => loadArchitectureDelta(deltaPath), /mismatches/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
