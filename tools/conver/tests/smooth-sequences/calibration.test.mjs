// [::TICKET::] PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-313 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';
import {
  runCalibration,
  calibrationVerdict,
  readCalibration,
} from '../../.claude/scripts/smooth-sequences/calibrate.mjs';

const CALIBRATE = fileURLToPath(new URL('../../.claude/scripts/smooth-sequences/calibrate.mjs', import.meta.url));

test('calibration seeds every check family and detects each seeded defect', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const viewPath = workspace.viewPathOf('pkg-0001');
    const before = readFileSync(viewPath, 'utf8');
    const calibration = runCalibration({ root: workspace.root, now: '2026-10-26T00:00:00.000Z' });
    assert.ok(calibration.seeds.length >= 4);
    assert.ok(calibration.seeds.every((seed) => seed.detected === true), JSON.stringify(calibration.seeds));
    assert.match(calibration.digest, /^[0-9a-f]{64}$/);
    assert.ok(existsSync(join(workspace.root, 'smooth-sequences', 'CALIBRATION.json')));
    assert.equal(readFileSync(viewPath, 'utf8'), before, 'the live workspace is never mutated');
    assert.equal(readCalibration(workspace.root).digest, calibration.digest);
  } finally {
    workspace.remove();
  }
});

test('an undetected seed makes the calibration verdict fail', () => {
  assert.deepEqual(
    calibrationVerdict({ seeds: [{ checkId: 'S7.sequence-steps-undistributed', detected: false }] }),
    { ok: false, code: 'CALIBRATION_FAILED' },
  );
});

test('a missing calibration file is CALIBRATION_MISSING, never pass', () => {
  assert.deepEqual(calibrationVerdict(null), { ok: false, code: 'CALIBRATION_MISSING' });
});

test('running calibrate.mjs in the workspace root writes CALIBRATION.json', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const result = spawnSync(process.execPath, [CALIBRATE], { cwd: workspace.root, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const calibration = readCalibration(workspace.root);
    assert.ok(calibration, 'the command must write the calibration it measures');
    assert.equal(calibrationVerdict(calibration).ok, true);
  } finally {
    workspace.remove();
  }
});

test('calibrate.mjs accepts an explicit workspace root outside the current directory', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    const result = spawnSync(process.execPath, [CALIBRATE, workspace.root], { cwd: join(workspace.root, '..'), encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(workspace.root, 'smooth-sequences', 'CALIBRATION.json')), true);
  } finally {
    workspace.remove();
  }
});
