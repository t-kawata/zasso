// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildFrames, buildTimeline, progressAt } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { INITIAL_TIME, makeModel, packageModel, stageEvent } from './models.mjs';

/** One history run at a fixed instant. */
// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
function historyRun(stage, at, packageId = 'pkg-1', runId = `${stage}-run`, status = 'COMPLETE') {
  return { t: at, prec: 'ms', stage, packageId, status, runId, evidence: 'history' };
}

/** One stage event carrying an explicit time source. */
// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
function timedEvent(stage, at, packageId, timeSource = 'status') {
  return { ...stageEvent(stage, at, packageId, 1), timeSource };
}

/** The first frame at or after `after` whose displayed stage is `stage`. */
// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
function firstFrameOf(frames, stage, after = -1) {
  return frames.findIndex((frame, index) => index > after && frame.stage === stage);
}

/** The frame carrying one run marker. */
// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
function frameOfRun(frames, runId) {
  return frames.findIndex((frame) => (frame.runs || []).some((run) => run.runId === runId));
}

// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
test('C001: a grill rerun after drill is drawn after drill', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [
      timedEvent('drill', INITIAL_TIME + 1000, pkg.id),
      timedEvent('grill', INITIAL_TIME + 3000, pkg.id),
    ],
    runs: [
      historyRun('drill', INITIAL_TIME + 1000, pkg.id, 'drill-run'),
      historyRun('grill', INITIAL_TIME + 3000, pkg.id, 'grill-run'),
    ],
  });

  const frames = buildFrames(model, { frames: 120 });
  const drillFrame = firstFrameOf(frames, 'drill');
  const grillAfterDrill = firstFrameOf(frames, 'grill', drillFrame);

  assert.ok(drillFrame >= 0, 'the drill stage is displayed');
  assert.ok(grillAfterDrill > drillFrame, 'the grill rerun is displayed after drill');
  assert.ok(
    frameOfRun(frames, 'grill-run') > frameOfRun(frames, 'drill-run'),
    'the grill run marker follows the drill run marker',
  );
});

// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
test('C002: alternating educe and explain runs are drawn in run order', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [
      timedEvent('educe', INITIAL_TIME + 1000, pkg.id),
      timedEvent('explain', INITIAL_TIME + 2000, pkg.id),
      timedEvent('educe', INITIAL_TIME + 3000, pkg.id),
      timedEvent('explain', INITIAL_TIME + 4000, pkg.id),
    ],
    runs: [
      historyRun('educe', INITIAL_TIME + 1000, pkg.id, 'educe-1'),
      historyRun('explain', INITIAL_TIME + 2000, pkg.id, 'explain-1'),
      historyRun('educe', INITIAL_TIME + 3000, pkg.id, 'educe-2'),
      historyRun('explain', INITIAL_TIME + 4000, pkg.id, 'explain-2'),
    ],
  });

  const transitions = [];
  for (const frame of buildFrames(model, { frames: 120 })) {
    if (transitions.at(-1) !== frame.stage) transitions.push(frame.stage);
  }

  assert.deepEqual(transitions, ['educe', 'explain', 'educe', 'explain']);
});

// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
test('C003: a stage event for a package with no run uses the display estimate', () => {
  const pkg1 = packageModel({ id: 'pkg-1' });
  const pkg2 = packageModel({ id: 'pkg-2' });
  const model = makeModel({
    packages: [pkg1, pkg2],
    events: [
      timedEvent('grill', INITIAL_TIME + 5000, pkg1.id, 'history'),
      timedEvent('grill', INITIAL_TIME - 1000, pkg2.id, 'artifact'),
    ],
    runs: [historyRun('grill', INITIAL_TIME + 5000, pkg1.id, 'grill-run')],
  });

  const built = buildTimeline(model);
  const estimate = built.displayDate.get('grill');
  const pkg2Event = built.timeline.find(
    (event) => event.kind === 'stage' && event.stage === 'grill' && event.packageId === pkg2.id,
  );

  assert.ok(Number.isFinite(estimate), 'the grill stage has a display estimate');
  assert.ok(pkg2Event, 'the pkg-2 grill event is in the timeline');
  assert.equal(pkg2Event.orderT, estimate, 'pkg-2 uses the stage estimate, not pkg-1 run time');
});

// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
test('C004: a model with no runs keeps the ordinal timeline', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [
      timedEvent('explain', INITIAL_TIME + 2000, pkg.id),
      timedEvent('educe', INITIAL_TIME + 1000, pkg.id),
    ],
  });

  const built = buildTimeline(model);
  assert.equal(built.chronological, false);

  const transitions = [];
  for (const frame of buildFrames(model, { frames: 120 })) {
    if (transitions.at(-1) !== frame.stage) transitions.push(frame.stage);
  }
  assert.deepEqual(transitions, ['educe', 'explain']);
});

// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
test('C005: the chronological order key never decreases and each run appears once', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [
      timedEvent('educe', INITIAL_TIME + 1000, pkg.id),
      timedEvent('explain', INITIAL_TIME + 2000, pkg.id),
      timedEvent('educe', INITIAL_TIME + 3000, pkg.id),
    ],
    runs: [
      historyRun('educe', INITIAL_TIME + 1000, pkg.id, 'educe-1'),
      historyRun('explain', INITIAL_TIME + 2000, pkg.id, 'explain-1'),
      historyRun('educe', INITIAL_TIME + 3000, pkg.id, 'educe-2'),
    ],
  });

  const built = buildTimeline(model);
  const keys = built.timeline.map((event) => event.orderT);
  assert.ok(keys.every((value, index) => index === 0 || value >= keys[index - 1]));

  const occurrences = new Map();
  for (const frame of buildFrames(model, { frames: 120 })) {
    for (const run of frame.runs || []) occurrences.set(run.runId, (occurrences.get(run.runId) || 0) + 1);
  }
  for (const run of model.runs) {
    assert.equal(occurrences.get(run.runId), 1, `${run.runId} is drawn once`);
  }
});

// [::TICKET::] PX-391 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-391 --for-spec --no-implementation-order`.
test('C006: progressAt uses the order key on the chronological path', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [
      timedEvent('drill', INITIAL_TIME + 1000, pkg.id),
      timedEvent('grill', INITIAL_TIME + 2000, pkg.id),
    ],
    runs: [
      historyRun('drill', INITIAL_TIME + 1000, pkg.id, 'drill-run'),
      historyRun('grill', INITIAL_TIME + 1000, pkg.id, 'grill-run'),
    ],
  });
  const drillOnly = makeModel({
    packages: [pkg],
    events: [timedEvent('drill', INITIAL_TIME + 1000, pkg.id)],
    runs: [historyRun('drill', INITIAL_TIME + 1000, pkg.id, 'drill-run')],
  });

  const withAnchoredGrill = progressAt(model, INITIAL_TIME + 1500);
  const withoutGrill = progressAt(drillOnly, INITIAL_TIME + 1500);

  assert.ok(
    withAnchoredGrill > withoutGrill,
    'the grill event anchored to the 1000 run is included at 1500',
  );
});
