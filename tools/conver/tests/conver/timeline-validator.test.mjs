// PX-433 @verifies C006 @verifies C008
// PX-450 @verifies C001 @verifies C002 @verifies C003 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertNoViolations,
  buildExpectedFinalState,
  compareFinalState,
  isFatalViolation,
  validateTimeline,
} from '../../.claude/scripts/conver/progress-gif/validator.js';
import { makeModel, packageModel } from './models.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main as validateMain } from '../../.claude/scripts/conver/validate-timeline.js';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
test('C006: a collapsed order bucket is a violation', () => {
  const model = makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] });
  const timeline = {
    timeline: [
      { kind: 'stage', stage: 'explain', packageId: 'pkg-1', orderT: 9000, evidenceT: 1000, seq: 0 },
      { kind: 'stage', stage: 'grill', packageId: 'pkg-1', orderT: 9000, evidenceT: 70000, seq: 1 },
    ],
  };
  const violations = validateTimeline({ model, timeline, previousSnapshot: null });

  assert.equal(violations.some((violation) => violation.code === 'COLLAPSED_ORDER_TIME'), true);
  assert.throws(() => assertNoViolations(violations), /COLLAPSED_ORDER_TIME/);
});

test('C006: a history stage event without a record is a violation', () => {
  const model = makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] });
  model.timelineMode = 'history';
  const timeline = {
    timeline: [{ kind: 'stage', stage: 'explain', packageId: 'pkg-1', orderT: 2000, evidenceT: 2000, seq: 0 }],
  };
  const violations = validateTimeline({ model, timeline, previousSnapshot: null });

  assert.equal(violations.some((violation) => violation.code === 'MISSING_STAGE_RECORD'), true);
});

test('C006: a clean history timeline has no violations', () => {
  const model = makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] });
  model.timelineMode = 'history';
  const timeline = {
    timeline: [{ kind: 'stage', stage: 'explain', packageId: 'pkg-1', orderT: 2000, evidenceT: 2000, recordId: 'r1', seq: 0 }],
  };
  const violations = validateTimeline({ model, timeline, previousSnapshot: null });

  assert.deepEqual(violations, []);
});

test('C008: final-state parity reports a named mismatch', () => {
  const historyModel = { packages: [{ id: 'pkg-1', stages: { make: 1, plan: 1, start: 1, review: 1 } }] };
  const artifactModel = { packages: [{ id: 'pkg-1', stages: { make: 0, plan: 0, start: 0, review: 0 } }] };
  const result = compareFinalState(historyModel, artifactModel, { tolerance: 0.01 });

  assert.equal(result.ok, false);
  assert.equal(result.discrepancies[0].code, 'FINAL_STATE_MISMATCH');
  assert.equal(result.discrepancies[0].packageId, 'pkg-1');
});


test('C006: validate-timeline --model reads a model file', () => {
  const modelPath = path.join(os.tmpdir(), `px433-model-${Date.now()}.json`);
  fs.writeFileSync(modelPath, JSON.stringify(makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] })));
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  let exitCode;
  try {
    exitCode = validateMain([`--model=${modelPath}`]);
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.equal(exitCode, 0);
});

// [::TICKET::] PX-450 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-450 --for-spec --no-implementation-order`.
function zeroedPackage(id = 'pkg-1') {
  return packageModel({ id });
}

// [::TICKET::] PX-450 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-450 --for-spec --no-implementation-order`.
function previousSnapshotWith(stages) {
  return { packages: [{ id: 'pkg-1', stages }] };
}

// [::TICKET::] PX-450 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-450 --for-spec --no-implementation-order`.
function validateParity({ artifact, previousSnapshot = null, finalStages, uncovered = [] }) {
  const finalModel = { packages: [{ id: artifact.id, stages: finalStages }] };
  return validateTimeline({
    model: makeModel({ packages: [artifact] }),
    timeline: { timeline: [] },
    previousSnapshot,
    artifactModel: { packages: [artifact] },
    finalModel,
    uncovered,
  });
}

test('C001: a reference above the artifact is a warning and the frame holds at the reference', () => {
  const artifact = zeroedPackage();
  artifact.stages = { ...artifact.stages, boundify: 0.5 };
  const violations = validateParity({
    artifact,
    previousSnapshot: previousSnapshotWith({ boundify: 1 }),
    finalStages: { ...artifact.stages, boundify: 1 },
  });

  const regression = violations.find((entry) => entry.code === 'ARTIFACT_REGRESSION');
  assert.equal(Boolean(regression), true);
  assert.equal(regression.severity, 'warning');
  assert.equal(regression.packageId, 'pkg-1');
  assert.equal(regression.stage, 'boundify');
  assert.equal(violations.some((entry) => entry.code === 'FINAL_STATE_MISMATCH' && entry.severity !== 'warning'), false);
});

test('C001: gating is applied to both vectors before the componentwise maximum', () => {
  const artifact = zeroedPackage();
  artifact.stages = { ...artifact.stages, make: 0.5, plan: 1 };
  const violations = validateParity({
    artifact,
    previousSnapshot: previousSnapshotWith({ make: 1, plan: 0 }),
    finalStages: { ...artifact.stages, make: 1, plan: 0.5 },
  });

  assert.equal(violations.some((entry) => entry.code === 'FINAL_STATE_MISMATCH'), false);
  const regression = violations.find((entry) => entry.code === 'ARTIFACT_REGRESSION');
  assert.equal(regression.stage, 'make');
});

test('C001: without a reference the expected end equals the gated artifact', () => {
  const artifact = zeroedPackage();
  artifact.stages = { ...artifact.stages, make: 0.5 };
  const expected = buildExpectedFinalState({ packages: [artifact] }, null);

  assert.equal(Number(expected.packages[0].stages.make), 0.5);
  assert.deepEqual(expected.regressions, []);
});

test('C001: buildExpectedFinalState returns the gated maximum and names regressions', () => {
  const artifact = zeroedPackage();
  artifact.stages = { ...artifact.stages, make: 0.5, plan: 1 };
  const expected = buildExpectedFinalState(
    { packages: [artifact] },
    previousSnapshotWith({ make: 1, plan: 0 }),
  );

  assert.equal(Number(expected.packages[0].stages.make), 1);
  assert.equal(Number(expected.packages[0].stages.plan), 0.5);
  assert.deepEqual(expected.regressions.map((entry) => entry.stage), ['make']);
});

test('C002: an uncovered target is a warning and does not throw', () => {
  const artifact = zeroedPackage();
  const violations = validateParity({
    artifact,
    finalStages: artifact.stages,
    uncovered: [{ code: 'UNCOVERED_ARTIFACT_STAGE', stage: 'make', packageId: 'pkg-1', detail: 'no run' }],
  });

  const uncovered = violations.find((entry) => entry.code === 'UNCOVERED_ARTIFACT_STAGE');
  assert.equal(uncovered.severity, 'warning');
  assert.doesNotThrow(() => assertNoViolations(violations));
});

test('C002: an uncovered target explains the parity undershoot and suppresses the error', () => {
  const artifact = zeroedPackage();
  artifact.stages = { ...artifact.stages, make: 1 };
  const violations = validateParity({
    artifact,
    finalStages: { ...artifact.stages, make: 0.5 },
    uncovered: [{ code: 'UNCOVERED_ARTIFACT_STAGE', stage: 'make', packageId: 'pkg-1', detail: 'no run' }],
  });

  assert.equal(violations.some((entry) => entry.code === 'FINAL_STATE_MISMATCH'), false);
});

test('C004: an unexplained undershoot keeps FINAL_STATE_MISMATCH at error severity', () => {
  const artifact = zeroedPackage();
  artifact.stages = { ...artifact.stages, make: 1 };
  const violations = validateParity({ artifact, finalStages: { ...artifact.stages, make: 0.5 } });

  const mismatch = violations.find((entry) => entry.code === 'FINAL_STATE_MISMATCH');
  assert.equal(mismatch.severity, 'error');
  assert.throws(() => assertNoViolations(violations), /FINAL_STATE_MISMATCH/);
});

test('C003: strict makes a warning fatal and non-strict publishes it', () => {
  assert.equal(isFatalViolation({ severity: 'warning' }, { strict: false }), false);
  assert.equal(isFatalViolation({ severity: 'warning' }, { strict: true }), true);
  assert.equal(isFatalViolation({ severity: 'error' }, { strict: false }), true);
});

test('C004: causal order and previous-state findings keep error severity', () => {
  const model = makeModel({ packages: [zeroedPackage()] });
  const causal = validateTimeline({
    model,
    timeline: {
      timeline: [
        { kind: 'stage', stage: 'explain', packageId: null, orderT: 1000, evidenceT: 1000, recordId: 'explain-1' },
        { kind: 'stage', stage: 'educe', packageId: null, orderT: 2000, evidenceT: 2000, recordId: 'educe-1' },
      ],
    },
    previousSnapshot: null,
    artifactModel: null,
  });
  assert.equal(causal.find((entry) => entry.code === 'CAUSAL_ORDER_VIOLATION').severity, 'error');

  const previous = validateTimeline({
    model,
    timeline: { timeline: [] },
    previousSnapshot: { generatedAt: '2026-11-02T00:00:00.000Z', packages: [{ id: 'pkg-1', stages: { make: 1 } }] },
    artifactModel: null,
  });
  assert.equal(previous.find((entry) => entry.code === 'PREVIOUS_STATE_MISMATCH').severity, 'error');
});
