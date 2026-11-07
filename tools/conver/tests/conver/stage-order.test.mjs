// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
// PX-375 @verifies C001 @verifies C002 @verifies C003 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeWorkspace } from '../../.claude/scripts/conver/draw-progress-gif.js';
import {
  STAGE_ORDER,
  applyEvent,
  buildFrames,
  buildTimeline,
  createFrameState,
  frameFromState,
  progressAt,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { INITIAL_TIME, makeModel, packageModel, stageEvent } from './models.mjs';
import { writeWorkspace } from './fixtures.mjs';

/** A stage event carrying an explicit evidence source. */
// [::TICKET::] PX-375 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-375 --for-spec --no-implementation-order`.
function eventAt(iso, stage, packageId, timeSource) {
  return { ...stageEvent(stage, Date.parse(iso), packageId, 1), timeSource };
}

// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
test('C001: growth markers never advance the displayed stage on the ordinal path', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [stageEvent('educe', INITIAL_TIME, 'pkg-1', 1)],
    growthEvents: [{
      t: INITIAL_TIME + 500,
      stage: 'split',
      packageId: 'pkg-1',
      addedTicketKeys: ['T1'],
      addedMass: 1,
    }],
  });

  const timeline = buildTimeline(model);
  assert.equal(timeline.chronological, false);
  const state = createFrameState(model, timeline);
  for (const event of timeline.timeline) applyEvent(state, event);
  assert.equal(state.lastStageIndex, 0);
  assert.equal(state.lastStage, 'educe');

  const frames = buildFrames(model, { frames: 20 });
  assert.ok(frames.every((frame) => frame.stage === 'educe'));
});

// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
test('C001: a run marker advances the displayed stage on the execution-order path', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [stageEvent('educe', INITIAL_TIME, 'pkg-1', 1)],
    runs: [{
      t: INITIAL_TIME + 1000,
      prec: 'ms',
      stage: 'drill',
      packageId: 'pkg-1',
      status: 'BLOCKED_PREREQUISITE',
      runId: 'r1',
      evidence: 'history',
    }],
    growthEvents: [{
      t: INITIAL_TIME + 500,
      stage: 'split',
      packageId: 'pkg-1',
      addedTicketKeys: ['T1'],
      addedMass: 1,
    }],
  });

  const timeline = buildTimeline(model);
  assert.equal(timeline.chronological, true);
  const state = createFrameState(model, timeline);
  for (const event of timeline.timeline) applyEvent(state, event);
  assert.equal(state.lastStageIndex, STAGE_ORDER.indexOf('drill'));
  assert.equal(state.lastStage, 'drill');

  const frames = buildFrames(model, { frames: 20 });
  assert.equal(frames.at(-1).stage, 'drill');
  assert.ok(frames.some((frame) => frame.stage === 'educe'));
});

test('C002: an artifact-only explain is clamped to the earliest trusted downstream stage', () => {
  const initialT = Date.parse('2026-10-26T00:35:54Z');
  const lateModel = makeModel({
    initialT,
    packages: [packageModel({ id: 'pkg-1' })],
    events: [
      eventAt('2026-10-26T00:35:54Z', 'educe', 'pkg-1', 'status'),
      eventAt('2026-11-05T09:48:55Z', 'explain', 'pkg-1', 'artifact'),
      eventAt('2026-10-28T08:39:00Z', 'graphify', 'pkg-1', 'status'),
    ],
  });

  const lateTimeline = buildTimeline(lateModel);
  const explain = lateTimeline.timeline.find((event) => event.stage === 'explain');
  assert.equal(explain.t, Date.parse('2026-10-28T08:39:00Z'));
  assert.ok((lateTimeline.warnings ?? []).some((message) => message.startsWith('[order] explain')));

  const inRangeModel = makeModel({
    initialT,
    packages: [packageModel({ id: 'pkg-1' })],
    events: [
      eventAt('2026-10-26T00:38:14Z', 'explain', 'pkg-1', 'artifact'),
      eventAt('2026-10-28T08:39:00Z', 'graphify', 'pkg-1', 'status'),
    ],
  });
  const inRangeTimeline = buildTimeline(inRangeModel);
  assert.equal(
    inRangeTimeline.timeline.find((event) => event.stage === 'explain').t,
    Date.parse('2026-10-26T00:38:14Z'),
  );
  assert.deepEqual(inRangeTimeline.warnings ?? [], []);

  const unboundedModel = makeModel({
    initialT,
    packages: [packageModel({ id: 'pkg-1' })],
    events: [eventAt('2026-11-05T09:48:55Z', 'explain', 'pkg-1', 'artifact')],
  });
  assert.equal(
    buildTimeline(unboundedModel).timeline.find((event) => event.stage === 'explain').t,
    Date.parse('2026-11-05T09:48:55Z'),
  );
});

test('C003: drill stage events are clamped after split', () => {
  const initialT = Date.parse('2026-10-26T00:35:54Z');
  const splitTime = Date.parse('2026-11-02T06:25:00Z');
  const earlyModel = makeModel({
    initialT,
    packages: [packageModel({ id: 'pkg-1' })],
    events: [
      { ...stageEvent('split', splitTime, 'pkg-1', 1), timeSource: 'status' },
      { ...stageEvent('drill', Date.parse('2026-11-01T00:00:00Z'), 'pkg-1', 1), timeSource: 'status' },
    ],
  });
  const earlyTimeline = buildTimeline(earlyModel).timeline;
  const earlyDrill = earlyTimeline.find((event) => event.stage === 'drill');
  const earlySplit = earlyTimeline.find((event) => event.stage === 'split');
  assert.ok(earlyDrill.t >= earlySplit.t);

  const lateModel = makeModel({
    initialT,
    packages: [packageModel({ id: 'pkg-1' })],
    events: [
      { ...stageEvent('split', splitTime, 'pkg-1', 1), timeSource: 'status' },
      { ...stageEvent('drill', Date.parse('2026-11-04T23:57:00Z'), 'pkg-1', 1), timeSource: 'status' },
    ],
  });
  assert.equal(
    buildTimeline(lateModel).timeline.find((event) => event.stage === 'drill').t,
    Date.parse('2026-11-04T23:57:00Z'),
  );
});

test('C004: the other-PC model plays in workflow order, monotonically', () => {
  const initialT = Date.parse('2026-10-26T00:35:54Z');
  const model = makeModel({
    initialT,
    packages: [packageModel({ id: 'pkg-1' })],
    events: [
      eventAt('2026-10-26T00:35:54Z', 'educe', 'pkg-1', 'status'),
      eventAt('2026-11-05T09:48:55Z', 'explain', 'pkg-1', 'artifact'),
      eventAt('2026-10-27T06:36:00Z', 'grill', 'pkg-1', 'status'),
      eventAt('2026-10-27T06:36:00Z', 'smooth', null, 'status'),
      eventAt('2026-10-28T08:39:00Z', 'graphify', 'pkg-1', 'status'),
      eventAt('2026-10-29T12:48:00Z', 'boundify', 'pkg-1', 'status'),
      eventAt('2026-11-02T06:25:00Z', 'split', 'pkg-1', 'status'),
      eventAt('2026-11-04T23:57:00Z', 'drill', 'pkg-1', 'status'),
    ],
  });

  const frames = buildFrames(model, { frames: 200 });
  const firstFrameOf = new Map();
  frames.forEach((frame, index) => {
    if (!firstFrameOf.has(frame.stage)) firstFrameOf.set(frame.stage, index);
  });
  assert.deepEqual(
    [...firstFrameOf.keys()],
    ['educe', 'explain', 'grill', 'smooth', 'graphify', 'boundify', 'split', 'drill'],
  );

  const indexes = frames.map((frame) => STAGE_ORDER.indexOf(frame.stage));
  assert.ok(indexes.every((value, index) => index === 0 || value >= indexes[index - 1]));

  for (const timestamp of [initialT, Date.parse('2026-10-28T00:00:00Z'), Date.parse('2026-11-05T00:00:00Z')]) {
    const built = buildTimeline(model);
    const state = createFrameState(model, built);
    for (const event of built.timeline) {
      if (event.evidenceT <= timestamp) applyEvent(state, event);
    }
    assert.equal(progressAt(model, timestamp), frameFromState(state, model, 0).overallProgress);
  }
});

test('C004b: per-package late explain still shows grill before graphify', () => {
  const initialT = Date.parse('2026-10-26T00:35:54Z');
  const explain = (packageId) => ({
    ...stageEvent('explain', Date.parse('2026-11-05T09:48:55Z'), packageId, 1),
    timeSource: 'artifact',
  });
  const grill = (packageId) => ({
    ...stageEvent('grill', Date.parse('2026-10-27T06:36:00Z'), packageId, 1),
    timeSource: 'status',
  });
  const graphify = (packageId, iso) => ({
    ...stageEvent('graphify', Date.parse(iso), packageId, 1),
    timeSource: 'status',
  });
  const model = makeModel({
    initialT,
    packages: [packageModel({ id: 'pkg-1' }), packageModel({ id: 'pkg-2' })],
    events: [
      eventAt('2026-10-26T00:35:54Z', 'educe', 'pkg-1', 'status'),
      eventAt('2026-10-26T00:35:54Z', 'educe', 'pkg-2', 'status'),
      explain('pkg-1'),
      explain('pkg-2'),
      grill('pkg-1'),
      grill('pkg-2'),
      graphify('pkg-1', '2026-10-28T08:39:00Z'),
      graphify('pkg-2', '2026-10-29T05:11:00Z'),
    ],
  });

  const frames = buildFrames(model, { frames: 200 });
  const order = [];
  for (const frame of frames) {
    if (order.at(-1) !== frame.stage) order.push(frame.stage);
  }
  assert.ok(order.includes('grill'), `grill missing from ${order.join(' -> ')}`);
  assert.ok(order.includes('graphify'), `graphify missing from ${order.join(' -> ')}`);
  assert.ok(order.indexOf('grill') < order.indexOf('graphify'), order.join(' -> '));
});

test('IT: a fresh workspace with now-mtimes still keeps explain before graphify', () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: {
      'educe-sequences/status.json': {
        generationStartedAt: '2026-10-26T00:35:54Z',
        phases: Array.from({ length: 18 }, () => ({ status: 'done' })),
      },
      'demo-sequences.json': {},
      'pkg-1/INFO-RFC-SEED.md': '# info\n',
      'pkg-1/EXPLAIN-RFC-SEED.md': '<!-- explain-seed:facts {"sections":{"a":1}} -->\n',
      'pkg-1/RFC-GRAPHIFY-Status.json': {
        runId: `${Date.parse('2026-11-02T08:39:00Z')}000000-1`,
        steps: { 0: 'done', 1: 'done', 2: 'done', 3: 'done', 4: 'done', 5: 'done' },
      },
    },
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const timeline = buildTimeline(model).timeline;
  const graphifyTime = Date.parse('2026-11-02T08:39:00Z');
  assert.equal(timeline.find((event) => event.stage === 'graphify').t, graphifyTime);
  assert.equal(timeline.find((event) => event.stage === 'explain').t, graphifyTime);
});
