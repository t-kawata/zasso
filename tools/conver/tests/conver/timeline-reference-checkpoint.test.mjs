// PX-434 @verifies C005 @verifies C006 @verifies C007
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFrames,
  reconcileProgressToReference,
  STAGE_ORDER,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { validateTimeline } from '../../.claude/scripts/conver/progress-gif/validator.js';
import { receiptEventsOf } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { makeModel, packageModel } from './models.mjs';

const T0 = '2026-11-04T12:00:00.000Z';
const REFERENCE = '2026-11-05T00:00:00.000Z';
const MAKE = STAGE_ORDER.indexOf('make');

// [::TICKET::] PX-434 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-434 --for-spec --no-implementation-order`.
function makePackage(overrides = {}) {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  pkg.stages = { ...pkg.stages, make: 1, ...overrides };
  return pkg;
}

// [::TICKET::] PX-434 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-434 --for-spec --no-implementation-order`.
function referenceSnapshot(stages) {
  return {
    schema: 'conver-progress-snapshot-v1',
    generatedAt: REFERENCE,
    packages: [{ id: 'pkg-1', name: 'pkg-1', path: 'pkg-1', obligations: { total: 10 }, tickets: { total: 1 }, stages }],
    runs: [],
  };
}

// [::TICKET::] PX-434 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-434 --for-spec --no-implementation-order`.
function makeEvent(at, runId = `run-${at}`) {
  return {
    t: Date.parse(at), prec: 'ms', stage: 'make', packageId: 'pkg-1', inc: 1,
    evidence: 'history', timeSource: 'history', recordId: runId, recordSource: 'history', role: 'pipeline',
  };
}

test('C005: events before the reference are scaled to the reference state, later events to the artifact end', () => {
  const pkg = makePackage();
  const events = [makeEvent('2026-11-04T10:00:00.000Z', 'before'), makeEvent('2026-11-06T10:00:00.000Z', 'after')];
  const reconciled = reconcileProgressToReference(events, [pkg], {
    referenceSnapshot: referenceSnapshot({ make: 0.5 }),
    cutoffs: { root: T0, packages: { 'pkg-1': T0 } },
  });

  const before = reconciled.events.find((event) => event.recordId === 'before');
  const after = reconciled.events.find((event) => event.recordId === 'after');
  assert.equal(before.inc, 0.5);
  assert.equal(after.inc, 0.5);
  assert.equal(reconciled.checkpointEvents.length, 0);
  assert.equal(reconciled.uncovered.length, 0);

  const model = makeModel({ packages: [pkg], events: reconciled.events });
  const final = buildFrames(model, { frames: 10 }).at(-1);
  assert.ok(Math.abs(final.pi[0][MAKE] - 1) < 1e-9);
});

test('C005: an implementation value with no earlier run is checkpointed at the reference time', () => {
  const pkg = makePackage();
  const events = [makeEvent('2026-11-06T10:00:00.000Z', 'after')];
  const reconciled = reconcileProgressToReference(events, [pkg], {
    referenceSnapshot: referenceSnapshot({ make: 0.5 }),
    cutoffs: { root: T0, packages: { 'pkg-1': T0 } },
  });

  assert.equal(reconciled.checkpointEvents.length, 1);
  assert.equal(reconciled.checkpointEvents[0].inc, 0.5);
  assert.equal(reconciled.checkpointEvents[0].recordSource, 'reference');
  assert.equal(reconciled.checkpointEvents[0].timeSource, 'history');
  assert.equal(reconciled.checkpointEvents[0].t, Date.parse(REFERENCE));
  assert.equal(reconciled.events.find((event) => event.recordId === 'after').inc, 0.5);
});

test('C005: a workspace value with no earlier run is checkpointed at the boundary', () => {
  const pkg = makePackage();
  pkg.stages = { ...pkg.stages, make: 0, educe: 1 };
  const reconciled = reconcileProgressToReference([], [pkg], {
    referenceSnapshot: referenceSnapshot({ educe: 1 }),
    cutoffs: { root: T0, packages: { 'pkg-1': T0 } },
  });

  const checkpoint = reconciled.checkpointEvents.find((event) => event.stage === 'educe');
  assert.equal(Boolean(checkpoint), true);
  assert.equal(checkpoint.t, Date.parse(T0));
});

test('C006: a previous snapshot without timelineHealth still anchors the state check', () => {
  const pkg = makePackage();
  const model = makeModel({ packages: [pkg], events: [] });
  const previousSnapshot = referenceSnapshot({ make: 1 });
  // Deliberately old shape: no timelineHealth.
  const violations = validateTimeline({
    model,
    timeline: { timeline: [] },
    previousSnapshot,
    artifactModel: { packages: [pkg] },
  });

  assert.equal(violations.some((violation) => violation.code === 'PREVIOUS_STATE_MISMATCH'), true);
});

test('C006: a reference run missing from the live model is a violation', () => {
  const pkg = makePackage();
  const model = makeModel({ packages: [pkg], events: [], runs: [] });
  const previousSnapshot = referenceSnapshot({ make: 1 });
  previousSnapshot.runs = [{ t: Date.parse('2026-11-04T13:00:00.000Z'), stage: 'make', packageId: 'pkg-1', runId: 'run-lost', status: 'COMPLETE' }];
  const violations = validateTimeline({
    model,
    timeline: { timeline: [] },
    previousSnapshot,
    artifactModel: { packages: [pkg] },
  });

  assert.equal(violations.some((violation) => violation.code === 'PREVIOUS_RUN_MISSING'), true);
});

test('C007: explain before educe is a causal-order violation', () => {
  const model = makeModel({ packages: [makePackage()] });
  const timeline = {
    timeline: [
      { kind: 'stage', stage: 'explain', packageId: null, orderT: 1000, evidenceT: 1000, recordId: 'explain-1', inc: 1 },
      { kind: 'stage', stage: 'educe', packageId: null, orderT: 2000, evidenceT: 2000, recordId: 'educe-1', inc: 1 },
    ],
  };
  const violations = validateTimeline({ model, timeline, previousSnapshot: null, artifactModel: null });

  assert.equal(violations.some((violation) => violation.code === 'CAUSAL_ORDER_VIOLATION'), true);
});

test('C007: educe before explain passes the causal-order check', () => {
  const model = makeModel({ packages: [makePackage()] });
  const timeline = {
    timeline: [
      { kind: 'stage', stage: 'educe', packageId: null, orderT: 1000, evidenceT: 1000, recordId: 'educe-1', inc: 1 },
      { kind: 'stage', stage: 'explain', packageId: 'pkg-1', orderT: 2000, evidenceT: 2000, recordId: 'explain-1', inc: 1 },
    ],
  };
  const violations = validateTimeline({ model, timeline, previousSnapshot: null, artifactModel: null });

  assert.equal(violations.some((violation) => violation.code === 'CAUSAL_ORDER_VIOLATION'), false);
});

test('C007: an uncovered artifact target is a named violation', () => {
  const pkg = makePackage();
  const model = makeModel({ packages: [pkg] });
  const violations = validateTimeline({
    model,
    timeline: { timeline: [] },
    previousSnapshot: null,
    artifactModel: { packages: [pkg] },
    uncovered: [{ code: 'UNCOVERED_ARTIFACT_STAGE', stage: 'make', packageId: 'pkg-1', detail: 'no run' }],
  });

  assert.equal(violations.some((violation) => violation.code === 'UNCOVERED_ARTIFACT_STAGE'), true);
});

test('C008: omission stamps become exact find and consolidate receipts', () => {
  const at = Date.parse('2026-11-15T02:33:40.000Z');
  const receipts = receiptEventsOf('pkg-1', {
    omissions: [{ name: 'OMISSIONS-20261115023340.json', t: at }],
    manifests: [],
  });

  assert.equal(receipts.some((receipt) => receipt.stage === 'find' && receipt.t === at), true);
  assert.equal(receipts.some((receipt) => receipt.stage === 'consolidate' && receipt.t === at), true);
});

test('C008: a status receipt becomes the stage receipt', () => {
  const receipts = receiptEventsOf('pkg-1', {
    boundifyStatus: { receipt: { recordedAt: '2026-11-14T17:12:57.958Z' } },
  });

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].stage, 'boundify');
  assert.equal(receipts[0].t, Date.parse('2026-11-14T17:12:57.958Z'));
});

test('C008: an exact receipt completes a post-reference target', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  pkg.stages = {
    ...pkg.stages,
    make: 1, plan: 1, start: 1, review: 1, resolve: 1, consolidate: 1, find: 1,
  };
  const reference = referenceSnapshot({
    make: 1, plan: 1, start: 1, review: 1, resolve: 1, consolidate: 0, find: 0,
  });
  const receipt = {
    stage: 'consolidate', packageId: 'pkg-1', t: Date.parse('2026-11-14T17:33:40.000Z'),
    timeSource: 'history', recordSource: 'status', recordId: 'receipt-consolidate',
  };
  const findEvent = makeEvent('2026-11-14T17:45:51.145Z', 'find-1');
  findEvent.stage = 'find';
  const reconciled = reconcileProgressToReference([findEvent], [pkg], {
    referenceSnapshot: reference,
    cutoffs: { root: T0, packages: { 'pkg-1': T0 } },
    receiptEvents: [receipt],
  });

  assert.equal(reconciled.completionEvents.length, 1);
  assert.equal(reconciled.completionEvents[0].stage, 'consolidate');
  assert.equal(reconciled.uncovered.length, 0);
});
