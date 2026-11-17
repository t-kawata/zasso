// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-436 C001/C004/C005 — additive v3 calibration.
 *
 * The v2 calibration contract counts one seed per mechanical detector in the
 * v2 registry. The v3 detectors are calibrated by a separate entry point so a
 * v2 registry keeps its established count.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { runClauseCalibration } = require('../../.claude/scripts/tickets/lib/omission-calibration.js');

const V3_DETECTORS = ['contract-inventory', 'test-index', 'clause-coverage', 'detection-proof'];

test('C001/C004/C005: every v3 detector detects its seeded defect', () => {
  const calibration = runClauseCalibration();

  assert.deepEqual(calibration.seeds.map((seed) => seed.checkId), V3_DETECTORS);
  assert.equal(calibration.seeds.every((seed) => seed.applicable === true), true);
  assert.equal(calibration.seeds.every((seed) => seed.detected === true), true);
});

test('C001/C004/C005: every v3 detector returns no finding on a clean fixture', () => {
  const calibration = runClauseCalibration();

  assert.equal(calibration.seeds.every((seed) => seed.cleanFindings.length === 0), true);
});
