// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-406 — detection calibration and coverage controls.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  runCalibration,
  calibrationVerdict,
  runNegativeControl,
  runMetaControl,
} = require('../../.claude/scripts/tickets/omission-detection-gate.js');
const {
  loadRegistry,
  enumerateSurfaces,
} = require('../../.claude/scripts/tickets/lib/omission-detectors.js');
const { createSyntheticFixture, removeSyntheticFixture } = require('./helpers/omission-fixture.cjs');

/** Load the registry a fixture carries, or the bundled one. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function loadFixtureRegistry(root) {
  return loadRegistry({ cwd: root });
}

// @verifies C003
test('C003: calibration seeds at least four families and detects every seeded defect', () => {
  const root = createSyntheticFixture();
  try {
    const calibration = runCalibration({ fixtureRoot: root });

    assert.equal(calibration.seeds.length >= 4, true);
    assert.equal(calibration.seeds.every((seed) => seed.detected === true), true);
    assert.equal(calibrationVerdict(calibration).ok, true);
  } finally {
    removeSyntheticFixture(root);
  }
});

// @verifies C003
test('C003: an applicable undetected seed fails the calibration verdict', () => {
  assert.deepEqual(calibrationVerdict({ seeds: [{ checkId: 'contract-delivery', applicable: true, detected: false }] }).ok, false);
  assert.equal(calibrationVerdict({ seeds: [{ checkId: 'contract-delivery', applicable: true, detected: false }] }).code, 'CALIBRATION_FAILED');
});

// @verifies C003
test('C003: an inapplicable seed is notMeasured and does not pass', () => {
  const verdict = calibrationVerdict({
    seeds: [
      { checkId: 'a', applicable: true, detected: true },
      { checkId: 'b', applicable: true, detected: true },
      { checkId: 'c', applicable: true, detected: true },
      { checkId: 'd', applicable: true, detected: true },
      { checkId: 'formula-delivery', applicable: false, detected: false },
    ],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'CALIBRATION_NOT_MEASURED');
  assert.deepEqual(verdict.notMeasured, ['formula-delivery']);
});

// @verifies C003
test('C003: a clean fixture yields no finding (negative control)', () => {
  const root = createSyntheticFixture();
  try {
    assert.deepEqual(runNegativeControl({ fixtureRoot: root }).findings, []);
  } finally {
    removeSyntheticFixture(root);
  }
});

// @verifies C003
test('C003: removing a detector makes the meta control report an uncovered surface', () => {
  const root = createSyntheticFixture();
  try {
    const registry = loadFixtureRegistry(root);
    const surfaces = enumerateSurfaces({ cwd: root, ticketsPath: path.join(root, 'Tickets.json') });
    const meta = runMetaControl({ registry, surfaces });

    assert.equal(meta.findings.some((finding) => finding.code === 'SURFACE_UNCOVERED'), true);
  } finally {
    removeSyntheticFixture(root);
  }
});
