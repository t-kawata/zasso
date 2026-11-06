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

// PX-386 @verifies C002
// An inapplicable seed proves nothing about the detector, so it is recorded as not
// measured. It must not fail the calibration; an applicable seed that was not
// detected must still fail it.

test('PX-386 C002: an inapplicable seed is notMeasured, not a failure', () => {
// [::TICKET::] PX-386 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-386 --for-spec --no-implementation-order`.
  assert.deepEqual(
    calibrationVerdict({ seeds: [
      { checkId: 'S7.sequence-steps-undistributed', applicable: true, detected: true },
      { checkId: 'S7.active-operation-residual', applicable: true, detected: true },
      { checkId: 'S7.distribution-map', applicable: true, detected: true },
      { checkId: 'S7.rfc-boundary-missing', applicable: true, detected: true },
      { checkId: 'S7.sequence-step-order', applicable: false, detected: false },
    ] }),
    { ok: true, notMeasured: ['S7.sequence-step-order'] },
  );
});

test('PX-386 C002: an applicable undetected seed still fails', () => {
  assert.deepEqual(
    calibrationVerdict({ seeds: [
      { checkId: 'S7.sequence-steps-undistributed', applicable: true, detected: false },
      { checkId: 'S7.sequence-step-order', applicable: false, detected: false },
    ] }),
    { ok: false, code: 'CALIBRATION_FAILED' },
  );
});

test('PX-386 C002: fewer than four applicable seeds fail even when the inapplicable ones exist', () => {
  assert.deepEqual(
    calibrationVerdict({ seeds: [
      { checkId: 'S7.a', applicable: true, detected: true },
      { checkId: 'S7.b', applicable: true, detected: true },
      { checkId: 'S7.c', applicable: true, detected: true },
      { checkId: 'S7.d', applicable: false, detected: false },
    ] }),
    { ok: false, code: 'CALIBRATION_FAILED' },
  );
});
