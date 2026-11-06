// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
// Regression tests for the two evidence-time defects found on the gaia
// workspace: a COMPLETE drill at a gate step was not credited, and an
// artifact-only grill event could drag smooth and the upstream chain past a
// drill that had already completed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeWorkspace } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { buildFrames, buildTimeline } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { makeModel, packageModel, stageEvent } from './models.mjs';
import { writeWorkspace } from './fixtures.mjs';

const formatIso = (t) => new Date(t).toISOString();

function drillWorkspace(status) {
  return writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/drills/Status.json': status,
    },
  });
}

function drillEventOf(model) {
  return model.events.find((event) => event.stage === 'drill' && event.packageId === 'pkg-1');
}

test('a drill marked COMPLETE at a gate step still credits the drill stage', () => {
  const root = drillWorkspace({
    state: 'COMPLETE',
    currentStep: '5-1',
    updatedAt: '2026-11-05T02:09:17.932Z',
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const drill = drillEventOf(model);
  assert.ok(drill, 'a COMPLETE drill emits a drill stage event');
  assert.equal(drill.inc, 1);

  const frames = buildFrames(model, { frames: 40 });
  assert.ok(frames.some((frame) => frame.stage === 'drill'), 'the drill stage reaches the display');
});

test('a partially finished drill keeps its phase-one fraction', () => {
  const root = drillWorkspace({
    state: 'DESIGN_DONE',
    currentStep: '1-6',
    updatedAt: '2026-11-05T02:09:17.932Z',
  });

  const drill = drillEventOf(analyzeWorkspace(root, { sourceScan: false }));
  assert.ok(drill);
  assert.equal(drill.inc, 0.5);
});

test('a drill that moved past phase one keeps the phase-one fraction complete', () => {
  const root = drillWorkspace({
    state: 'DESIGN_DONE',
    currentStep: '2-1',
    updatedAt: '2026-11-05T02:09:17.932Z',
  });

  const drill = drillEventOf(analyzeWorkspace(root, { sourceScan: false }));
  assert.ok(drill);
  assert.equal(drill.inc, 1);
});

test('an artifact-only grill yields to the earliest trusted downstream stage', () => {
  const graphifyTime = Date.parse('2026-10-28T08:39:00Z');
  const model = makeModel({
    initialT: Date.parse('2026-10-26T00:00:00Z'),
    packages: [packageModel({ id: 'pkg-1' })],
    events: [
      { ...stageEvent('grill', Date.parse('2026-11-05T00:48:55Z'), 'pkg-1', 0.3), timeSource: 'artifact' },
      { ...stageEvent('graphify', graphifyTime, 'pkg-1', 1), timeSource: 'status' },
    ],
  });

  const built = buildTimeline(model);
  assert.equal(built.timeline.find((event) => event.stage === 'grill').t, graphifyTime);
  assert.ok(built.warnings.some((message) => message.startsWith('[order] grill')));
});

test('a trusted grill time is never clamped by an artifact rule', () => {
  const grillTime = Date.parse('2026-10-30T00:00:00Z');
  const model = makeModel({
    initialT: Date.parse('2026-10-01T00:00:00Z'),
    packages: [packageModel({ id: 'pkg-1' })],
    events: [
      { ...stageEvent('grill', grillTime, 'pkg-1', 0.3), timeSource: 'status' },
      { ...stageEvent('graphify', Date.parse('2026-10-28T08:39:00Z'), 'pkg-1', 1), timeSource: 'status' },
    ],
  });

  const built = buildTimeline(model);
  assert.equal(built.timeline.find((event) => event.stage === 'grill').t, grillTime);
  assert.ok(!built.warnings.some((message) => message.startsWith('[order] grill')));
});

test('a late artifact grill cannot drag smooth past a completed drill', () => {
  const graphifyTime = Date.parse('2026-10-28T08:39:00Z');
  const smoothTime = Date.parse('2026-10-29T03:49:34Z');
  const splitTime = Date.parse('2026-11-02T06:25:00Z');
  const drillTime = Date.parse('2026-11-04T23:57:00Z');
  const model = makeModel({
    initialT: Date.parse('2026-10-26T00:00:00Z'),
    packages: [packageModel({ id: 'pkg-1' })],
    events: [
      { ...stageEvent('grill', Date.parse('2026-11-05T00:48:55Z'), 'pkg-1', 0.3), timeSource: 'artifact' },
      { ...stageEvent('graphify', graphifyTime, 'pkg-1', 1), timeSource: 'status' },
      { ...stageEvent('boundify', Date.parse('2026-10-29T12:48:00Z'), 'pkg-1', 1), timeSource: 'status' },
      { ...stageEvent('split', splitTime, 'pkg-1', 1), timeSource: 'status' },
      { ...stageEvent('smooth', smoothTime, null, 1), timeSource: 'status' },
      { ...stageEvent('drill', drillTime, 'pkg-1', 1), timeSource: 'status' },
    ],
  });

  const built = buildTimeline(model);
  const smooth = built.timeline.find((event) => event.stage === 'smooth');
  const firstDrill = Math.min(...built.timeline
    .filter((event) => event.stage === 'drill')
    .map((event) => event.t));
  assert.ok(smooth.t < firstDrill,
    `smooth ${formatIso(smooth.t)} must precede the first drill ${formatIso(firstDrill)}`);
  const late = built.timeline.filter((event) => event.stage !== 'drill' && event.t >= firstDrill);
  assert.deepEqual(late.map((event) => event.stage), []);
});
