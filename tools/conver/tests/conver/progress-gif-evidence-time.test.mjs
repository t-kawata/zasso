// [::TICKET::] PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-411 --for-spec --no-implementation-order`.
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
// Regression tests for the two evidence-time defects found on the gaia
// workspace: a COMPLETE drill at a gate step was not credited, and an
// artifact-only grill event could drag smooth and the upstream chain past a
// drill that had already completed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeWorkspace } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { STAGE_ORDER, buildFrames, buildTimeline, derivePackageState, stageEventsOf, stageProgressOf } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { makeModel, packageModel, stageEvent } from './models.mjs';
import { writeWorkspace, ticket } from './fixtures.mjs';

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

const INITIAL_INSTANT = Date.parse('2026-11-01T00:00:00.000Z');

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function ticketArtifacts(tickets) {
  return { tickets: { phases: [{ id: 0, tickets }] } };
}

test('C006: a reviewed ticket without reviewed_at emits no implementation-stage event and warns', () => {
  const reviewed = ticket({ phaseId: 0, id: 1, status: 'reviewed', contracts: [], extra: { completedAt: '2026-11-02' } });
  const warnings = [];
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, ticketArtifacts([reviewed]), { initialT: INITIAL_INSTANT }, warnings);
  for (const stage of ['make', 'plan', 'start', 'review']) {
    assert.equal(events.filter((event) => event.stage === stage).length, 0, stage);
  }
  assert.ok(warnings.some((message) => message.startsWith('[evidence] review pkg-1') && message.includes('reviewed_at')));
});

test('C006: reviewed_at is the review event time and its status source', () => {
  const reviewed = ticket({ phaseId: 0, id: 1, status: 'reviewed', contracts: [], extra: { reviewed_at: '2026-11-03T04:05:06.000Z' } });
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, ticketArtifacts([reviewed]), { initialT: INITIAL_INSTANT }, []);
  const review = events.find((event) => event.stage === 'review');
  assert.ok(review);
  assert.equal(review.t, Date.parse('2026-11-03T04:05:06.000Z'));
  assert.equal(review.timeSource, 'status');
});

test('C003: an R3 ticket with planned_at and done_at emits plan and start', () => {
  const reviewed = ticket({
    phaseId: 0,
    id: 1,
    status: 'R3',
    contracts: [],
    extra: {
      planned_at: '2026-11-01T02:00:00.000Z',
      done_at: '2026-11-01T03:00:00.000Z',
    },
  });
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, ticketArtifacts([reviewed]), { initialT: INITIAL_INSTANT }, []);
  assert.deepEqual(
    events.filter((event) => ['plan', 'start'].includes(event.stage)).map((event) => event.stage).sort(),
    ['plan', 'start'],
  );
});

test('C006: a stage fraction without an explicit instant gets no artifact-presence event', () => {
  const reviewed = ticket({ phaseId: 0, id: 1, status: 'reviewed', contracts: [], extra: { completedAt: '2026-11-02' } });
  const state = derivePackageState({ id: 'pkg-1', name: 'pkg-1', path: 'pkg-1' }, ticketArtifacts([reviewed]), { initialT: INITIAL_INSTANT }, [], []);
  for (const stage of ['make', 'plan', 'start', 'review']) {
    assert.equal(state.events.filter((event) => event.stage === stage).length, 0, stage);
  }
});

test('C006: a resolved crime without resolved_at emits no resolve event', () => {
  const artifacts = {
    tickets: { phases: [] },
    malfeasance: { records: [{ id: 1, status: 'resolved', detected_at: '2026-11-01T00:00:00.000Z' }] },
    unresolvedStubs: 0,
  };
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, artifacts, { initialT: INITIAL_INSTANT }, []);
  assert.equal(events.filter((event) => event.stage === 'resolve').length, 0);
});

test('C006: a resolved crime with resolved_at emits one resolve event at that instant', () => {
  const artifacts = {
    tickets: { phases: [] },
    malfeasance: { records: [{ id: 1, status: 'resolved', resolved_at: '2026-11-02T03:04:05.000Z' }] },
    unresolvedStubs: 0,
  };
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, artifacts, { initialT: INITIAL_INSTANT }, []);
  const resolve = events.filter((event) => event.stage === 'resolve');
  assert.equal(resolve.length, 1);
  assert.equal(resolve[0].t, Date.parse('2026-11-02T03:04:05.000Z'));
});

const RESOLVE_INSTANT = Date.parse('2026-11-02T03:04:05.000Z');

/** One COMPLETE resolve run; packageId null means the run executed at the workspace root. */
// [::TICKET::] PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-411 --for-spec --no-implementation-order`.
function resolveHistory(packageId) {
  return {
    v: 1,
    runId: '20261102030405000-resolve-ticket-test',
    event: 'finish',
    stage: 'resolve',
    command: 'resolve-ticket',
    packageId,
    at: '2026-11-02T03:04:05.000Z',
    status: 'COMPLETE',
    addedTicketKeys: [],
  };
}

/** A package with no stubs and no recorded crime. */
// [::TICKET::] PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-411 --for-spec --no-implementation-order`.
function cleanResolveArtifacts(historyRecords = []) {
  return {
    tickets: { phases: [] },
    malfeasance: { records: [] },
    unresolvedStubs: 0,
    historyRecords,
  };
}

test('resolve stage: a completed resolve run credits the resolve stage when no crime was recorded', () => {
  const artifacts = cleanResolveArtifacts([resolveHistory('pkg-1')]);
  assert.equal(stageProgressOf(artifacts, {}, 'pkg-1', []).resolve, 1);
});

test('resolve stage: a package that never ran resolve and has nothing outstanding stays at zero', () => {
  assert.equal(stageProgressOf(cleanResolveArtifacts(), {}, 'pkg-1', []).resolve, 0);
});

test('resolve stage: a workspace-scoped resolve run credits every package', () => {
  const workspaceArtifacts = { historyRecords: [resolveHistory(null)] };
  assert.equal(stageProgressOf(cleanResolveArtifacts(), workspaceArtifacts, 'pkg-1', []).resolve, 1);
});

test('resolve stage: an unresolved stub keeps resolve below full despite a completed run', () => {
  const artifacts = { ...cleanResolveArtifacts([resolveHistory('pkg-1')]), unresolvedStubs: 1 };
  assert.equal(stageProgressOf(artifacts, {}, 'pkg-1', []).resolve, 0);
});

test('resolve stage: a clean package emits its resolve event at the package run instant', () => {
  const artifacts = cleanResolveArtifacts([resolveHistory('pkg-1')]);
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, artifacts, { initialT: INITIAL_INSTANT }, []);
  const resolve = events.filter((event) => event.stage === 'resolve');
  assert.equal(resolve.length, 1);
  assert.equal(resolve[0].t, RESOLVE_INSTANT);
  assert.equal(resolve[0].packageId, 'pkg-1');
  assert.equal(resolve[0].inc, 1);
  assert.equal(resolve[0].timeSource, 'history');
});

test('resolve stage: a workspace resolve run is credited to this package only', () => {
  const workspaceArtifacts = { initialT: INITIAL_INSTANT, historyRecords: [resolveHistory(null)] };
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, cleanResolveArtifacts(), workspaceArtifacts, []);
  const resolve = events.filter((event) => event.stage === 'resolve');
  assert.equal(resolve.length, 1);
  assert.equal(resolve[0].packageId, 'pkg-1');
  assert.equal(resolve[0].t, RESOLVE_INSTANT);
});

test('resolve stage: timed crime records leave no floating-point remainder for a history event', () => {
  const records = [1, 2, 3].map((id) => ({
    id,
    status: 'resolved',
    resolved_at: `2026-11-0${id}T00:00:00.000Z`,
  }));
  const artifacts = {
    tickets: { phases: [] },
    malfeasance: { records },
    unresolvedStubs: 0,
    historyRecords: [resolveHistory('pkg-1')],
  };
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, artifacts, { initialT: INITIAL_INSTANT }, []);
  assert.equal(events.filter((event) => event.stage === 'resolve').length, 3);
});

test('resolve stage: the RESOLVE ladder bar reaches full after the recorded resolve run', () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: { '.conver-history.jsonl': `${JSON.stringify(resolveHistory(null))}\n` },
  });
  const model = analyzeWorkspace(root, { sourceScan: false });
  const frames = buildFrames(model, { frames: 40 });
  const resolveIndex = STAGE_ORDER.indexOf('resolve');
  const last = frames[frames.length - 1];
  assert.equal(last.pi[0][resolveIndex], 1);
  assert.equal(last.globalStage[resolveIndex], 1);
});
