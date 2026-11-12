// [::TICKET::] PX-411 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-411 --for-spec --no-implementation-order`.
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
// [::TICKET::] PX-351 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-351 --for-spec --no-implementation-order`.
// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
// PX-350 @verifies C001 @verifies C003 @verifies C004 @verifies C005
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE_ORDER,
  STAGE_WEIGHT,
  LOOP_GROUPS,
  reconstructTicketGrowth,
  buildFrames,
  buildModel,
  buildTimeline,
  createFrameState,
  applyEvent,
  frameFromState,
  derivePackageState,
  progressAt,
  packageReviewedRatioAt,
  capGrowthMass,
  stageEventsOf,
  stageProgressOf,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { HOLD_END_FRAMES, HOLD_START_FRAMES } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { INITIAL_TIME, eventsForEveryStage, makeModel, packageModel, stageEvent, withPackageCount } from './models.mjs';
import { ticket } from './fixtures.mjs';

test('STAGE_ORDER is the fixed 16-stage order', () => {
  assert.deepEqual(STAGE_ORDER, [
    'educe', 'explain', 'grill', 'smooth', 'graphify', 'boundify', 'split',
    'make', 'plan', 'start', 'review', 'resolve', 'consolidate', 'find',
    'crystalize', 'drill',
  ]);
});

test('LOOP_GROUPS covers every stage exactly once', () => {
  const stages = LOOP_GROUPS.flatMap((group) => group.stages);
  assert.deepEqual(stages, STAGE_ORDER);
  assert.deepEqual(LOOP_GROUPS.map((group) => group.name), [
    'workspacify', 'upstream', 'implementation', 'shipping', 'evolution',
  ]);
});

test('reconstructTicketGrowth diffs snapshots and assigns the find stage', () => {
  const snapshots = [
    { path: 'Tickets-20261101000000.json', t: Date.parse('2026-11-01T00:00:00Z'), prec: 'ms', tickets: [{ phaseId: 1, id: 1 }] },
    { path: 'Tickets-20261102000000.json', t: Date.parse('2026-11-02T00:00:00Z'), prec: 'ms', tickets: [{ phaseId: 1, id: 1 }, { phaseId: 2, id: 1 }] },
  ];
  const growth = reconstructTicketGrowth({ snapshots, omissions: [], manifests: [], drills: [], tickets: [] });
  assert.equal(growth.length, 1);
  assert.equal(growth[0].stage, 'find');
  assert.deepEqual(growth[0].addedTicketKeys, ['P2-1']);
});

test('reconstructTicketGrowth uses omission, consolidation and drill evidence', () => {
  const growth = reconstructTicketGrowth({
    snapshots: [],
    omissions: [{ path: 'OMISSIONS-20261103000000.json', t: Date.parse('2026-11-03T00:00:00Z'), prec: 'ms', ticketKeys: ['P3-1'] }],
    manifests: [{ path: 'manifests/CONSOLIDATED-MANIFEST-20261104000000.json', t: Date.parse('2026-11-04T00:00:00Z'), prec: 'ms', ticketKeys: ['P4-1'] }],
    drills: [{ path: 'drills/Status.json', t: Date.parse('2026-11-05T00:00:00Z'), prec: 'ms', ticketKeys: ['P5-1'] }],
    tickets: [],
  });
  assert.equal(growth.length, 3);
  assert.deepEqual(growth.map((event) => event.stage).sort(), ['drill', 'find', 'find']);
});

test('buildModel keeps a manifests-only workspace at progress zero', () => {
  const model = buildModel({
    workspaceRoot: '/tmp/workspace',
    tree: { run: { generated_at: '2026-11-01T00:00:00.000Z' }, workspace: { packages: [] } },
    allocate: { contract_registry: [] },
    packages: [],
    events: [],
    growthEvents: [],
    warnings: [],
  });
  assert.equal(model.packages.length, 0);
  assert.equal(model.totals.packages, 0);
  assert.equal(model.events.length, 0);
  assert.equal(model.totals.reviewed, 0);
  assert.equal(model.totals.covered, 0);
});

test('buildFrames warps stage time so a flood of grill events cannot dominate', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 100 });
  const events = [];
  let tick = INITIAL_TIME;
  for (const stage of STAGE_ORDER) {
    const count = stage === 'grill' ? 4000 : 10;
    for (let index = 0; index < count; index += 1) {
      events.push(stageEvent(stage, tick, pkg.id, 0.001));
      tick += 1000;
    }
  }
  const model = makeModel({ packages: [pkg], events });
  const frames = buildFrames(model, { frames: 120, fps: 10 });
  const body = frames.slice(HOLD_START_FRAMES, frames.length - HOLD_END_FRAMES);
  const grillFrames = body.filter((frame) => frame.stage === 'grill').length;
  assert.ok(grillFrames / body.length <= 0.40, `grill share ${grillFrames}/${body.length}`);
  assert.ok(body.some((frame) => frame.stage === 'explain'));
  assert.ok(body.some((frame) => frame.stage === 'drill'));
});

test('buildFrames holds the final state and never resets to the initial frame', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  const model = makeModel({
    packages: [pkg],
    events: [stageEvent('educe', INITIAL_TIME, pkg.id, 0.1), stageEvent('split', INITIAL_TIME + 10, pkg.id, 1)],
  });
  const frames = buildFrames(model, { frames: 120, fps: 10 });
  const last = frames.at(-1);
  const previous = frames.at(-2);
  assert.equal(last.t, INITIAL_TIME + 10);
  assert.equal(last.stage, 'split');
  assert.deepEqual(last.pi, previous.pi);
  assert.notEqual(last.stage, 'educe');
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index].t >= frames[index - 1].t);
  }
});

test('per-package stage progress never decreases and displayed time is monotonic', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  const events = STAGE_ORDER.map((stage, index) => stageEvent(stage, INITIAL_TIME + index * 1000, pkg.id, 0.25));
  const frames = buildFrames(makeModel({ packages: [pkg], events }), { frames: 60, fps: 10 });
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index].t >= frames[index - 1].t);
    for (let stage = 0; stage < STAGE_ORDER.length; stage += 1) {
      assert.ok(frames[index].pi[0][stage] >= frames[index - 1].pi[0][stage]);
    }
  }
});

test('ticket growth increases area inline, persists, and never lowers the contract completion ratio', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 100, reviewed: 10 });
  pkg.obligations.ticketOnly = 7;
  const model = makeModel({
    packages: [pkg],
    growthEvents: [{
      packageId: pkg.id,
      t: INITIAL_TIME + 50,
      prec: 'ms',
      stage: 'find',
      addedTicketKeys: ['P1-1'],
      addedContracts: 7,
      addedReviewed: 0,
      evidence: 'Tickets-20261102000000.json',
      confidence: 'snapshot',
    }],
  });
  const frames = buildFrames(model, { frames: 120, fps: 10 });
  const growthFrame = frames.findIndex((frame) => frame.growth.length > 0);
  assert.ok(growthFrame > 0);
  assert.equal(frames[growthFrame - 1].packages[0].total, 93);
  assert.equal(frames[growthFrame].packages[0].total, 100);
  assert.equal(frames[growthFrame].growth[0].addedMass, 7);
  assert.equal(
    frames[growthFrame].packages[0].reviewedRatio,
    frames[growthFrame - 1].packages[0].reviewedRatio,
  );
  assert.equal(frames[growthFrame].packages[0].reviewedRatio, 0.1);
  assert.equal(frames.at(-1).packages[0].total, 100);
});

test('C001: reviewedRatio counts unique reviewed contract ids at the frame instant', () => {
  const T0 = INITIAL_TIME;
  const pkg = {
    ...packageModel({ id: 'pkg-1', total: 4, reviewed: 3 }),
    contractLog: [
      { presentAt: T0, reviewedAt: T0 + 1000, contractIds: ['a', 'b'] },
      { presentAt: T0, reviewedAt: T0 + 2000, contractIds: ['b', 'c'] },
    ],
  };
  assert.equal(packageReviewedRatioAt(pkg, T0), 0);
  assert.equal(packageReviewedRatioAt(pkg, T0 + 1000), 0.5);
  assert.equal(packageReviewedRatioAt(pkg, T0 + 2000), 0.75);

  const model = makeModel({
    packages: [pkg],
    events: [
      stageEvent('educe', T0, pkg.id, 0.1),
      stageEvent('explain', T0 + 2000, pkg.id, 0.1),
    ],
  });
  const frames = buildFrames(model, { frames: 30 });
  assert.equal(frames[0].packages[0].reviewedRatio, 0);
  assert.equal(frames.at(-1).packages[0].reviewedRatio, 0.75);
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index].packages[0].reviewedRatio >= frames[index - 1].packages[0].reviewedRatio);
  }
});

test('C001: reviewedRatio clamps at one and legacy models fall back to the static count', () => {
  const T0 = INITIAL_TIME;
  assert.equal(packageReviewedRatioAt(packageModel({ id: 'pkg-zero', total: 0, reviewed: 0 }), T0), 0);
  const clamped = {
    ...packageModel({ id: 'pkg-c', total: 2, reviewed: 2 }),
    contractLog: [{ presentAt: T0, reviewedAt: T0, contractIds: ['a', 'b', 'c'] }],
  };
  assert.equal(packageReviewedRatioAt(clamped, T0), 1);
  assert.equal(packageReviewedRatioAt(packageModel({ id: 'pkg-l', total: 2, reviewed: 1 }), T0), 0.5);
});

test('C003: explicit instants emit one event per stage and sums equal stageProgressOf', () => {
  const artifacts = {
    tickets: { phases: [{ id: 0, tickets: [{
      id: 1,
      phaseId: 0,
      status: 'R3',
      contracts: [{ id: 'C1' }],
      made_at: '2026-11-01T01:00:00.000Z',
      planned_at: '2026-11-01T02:00:00.000Z',
      done_at: '2026-11-01T03:00:00.000Z',
      reviewed_at: '2026-11-01T04:00:00.000Z',
    }] }] },
  };
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, artifacts, { initialT: INITIAL_TIME }, []);
  const stages = stageProgressOf(artifacts, {}, 'pkg-1', []);
  const expected = {
    make: Date.parse('2026-11-01T01:00:00Z'),
    plan: Date.parse('2026-11-01T02:00:00Z'),
    start: Date.parse('2026-11-01T03:00:00Z'),
    review: Date.parse('2026-11-01T04:00:00Z'),
  };
  for (const [stage, when] of Object.entries(expected)) {
    const selected = events.filter((event) => event.stage === stage);
    assert.equal(selected.length, 1, stage);
    assert.equal(selected[0].t, when, stage);
    assert.ok(Math.abs(selected[0].inc - 1) < 1e-9, stage);
    assert.ok(Math.abs(selected[0].inc - stages[stage]) < 1e-9, stage);
  }
});

test('C003: a direct todo-to-reviewed ticket emits review only', () => {
  const artifacts = {
    tickets: { phases: [{ id: 0, tickets: [{
      id: 1,
      phaseId: 0,
      status: 'reviewed',
      contracts: [],
      reviewed_at: '2026-11-02T00:00:00.000Z',
    }] }] },
  };
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, artifacts, { initialT: INITIAL_TIME }, []);
  assert.deepEqual(events.map((event) => event.stage), ['review']);
});

test('C004: a mid-timeline growth event never lowers a ladder bar or overall progress', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 100 });
  const model = makeModel({
    packages: [pkg],
    events: [stageEvent('educe', INITIAL_TIME, pkg.id, 1)],
    growthEvents: [{
      packageId: pkg.id,
      t: INITIAL_TIME + 50,
      prec: 'ms',
      stage: 'find',
      addedTicketKeys: ['P1-1'],
      addedContracts: 7,
      addedReviewed: 0,
      evidence: 'snapshot',
      confidence: 'snapshot',
    }],
  });
  const frames = buildFrames(model, { frames: 120 });
  for (let index = 1; index < frames.length; index += 1) {
    for (let stage = 0; stage < STAGE_ORDER.length; stage += 1) {
      assert.ok(frames[index].globalStage[stage] >= frames[index - 1].globalStage[stage] - 1e-12);
    }
    assert.ok(frames[index].overallProgress >= frames[index - 1].overallProgress - 1e-12);
  }
});

test('C005: growth mass caps at ticketOnly and package total never exceeds obligations.total', () => {
  const capped = capGrowthMass([{ addedTicketKeys: ['P1-1'], addedContracts: 243 }], 15);
  assert.equal(capped[0].addedMass, 15);

  const pkg = packageModel({ id: 'pkg-1', total: 183, covered: 183, reviewed: 0 });
  pkg.obligations.ticketOnly = 15;
  const model = makeModel({
    packages: [pkg],
    growthEvents: [{
      packageId: pkg.id,
      t: INITIAL_TIME + 50,
      prec: 'ms',
      stage: 'find',
      addedTicketKeys: ['P1-1'],
      addedContracts: 243,
      addedReviewed: 0,
      evidence: 'omission',
      confidence: 'omission',
    }],
  });
  const frames = buildFrames(model, { frames: 120 });
  assert.equal(frames[0].packages[0].total, 168);
  assert.equal(frames.at(-1).packages[0].total, 183);
  assert.ok(frames.every((frame) => frame.packages[0].total <= 183));
});

test('C006: consolidate and find event sums match the snapshot stage fractions', () => {
  const artifacts = {
    tickets: { phases: [{ id: 0, tickets: [ticket({ phaseId: 0, id: 1, status: 'R3' })] }] },
    manifests: [{ path: '/tmp/CONSOLIDATED-MANIFEST-20261101000000.json', t: INITIAL_TIME, prec: 'ms' }],
    omissions: [{ path: '/tmp/OMISSIONS-20261101000001.json', t: INITIAL_TIME + 1000, prec: 'ms' }],
  };
  const events = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, artifacts, { initialT: INITIAL_TIME }, []);
  const sum = (stage) => events
    .filter((event) => event.stage === stage)
    .reduce((total, event) => total + event.inc, 0);
  assert.ok(Math.abs(sum('consolidate') - 1) < 1e-9);
  assert.ok(Math.abs(sum('find') - 1) < 1e-9);

  const pendingArtifacts = {
    ...artifacts,
    tickets: { phases: [{ id: 0, tickets: [{ ...ticket({ phaseId: 0, id: 1, status: 'R3' }), forNextRound: true }] }] },
  };
  const pending = stageEventsOf({ id: 'pkg-1', name: 'pkg-1' }, pendingArtifacts, { initialT: INITIAL_TIME }, []);
  const pendingFind = pending
    .filter((event) => event.stage === 'find')
    .reduce((total, event) => total + event.inc, 0);
  assert.ok(Math.abs(pendingFind - 0.5) < 1e-9);
});

test('root events advance every cell without hijacking the current stage label', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  const model = makeModel({
    packages: [pkg],
    events: [
      stageEvent('graphify', INITIAL_TIME + 1, pkg.id, 1),
      stageEvent('educe', INITIAL_TIME + 2, null, 1),
    ],
  });
  const frames = buildFrames(model, { frames: 60, fps: 10 });
  const last = frames.at(-1);
  assert.equal(last.stage, 'graphify');
  assert.ok(last.pi[0][0] > 0);
  assert.ok(last.pi[0][4] > 0);
});

test('a zero-package model still produces valid frames', () => {
  const frames = buildFrames(makeModel({ packages: [] }), { frames: 20, fps: 10 });
  assert.equal(frames.length, 20);
  assert.equal(frames[0].packages.length, 0);
  assert.equal(frames.at(-1).stage, 'educe');
  assert.equal(frames.at(-1).t, INITIAL_TIME);
});

test('overall progress is the stage-weighted ladder completion, not the reviewed ratio', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 100, reviewed: 0 });
  const events = STAGE_ORDER.map((stage, index) => stageEvent(stage, INITIAL_TIME + index * 1000, pkg.id, 1));
  const frames = buildFrames(makeModel({ packages: [pkg], events }), { frames: 60, fps: 10 });
  assert.equal(frames[0].overallProgress, 0);
  assert.ok(frames.at(-1).overallProgress > 0.99);
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index].overallProgress >= frames[index - 1].overallProgress);
  }
  const totalWeight = STAGE_WEIGHT.reduce((sum, weight) => sum + weight, 0);
  const expected = STAGE_ORDER.reduce(
    (sum, stage, index) => sum + STAGE_WEIGHT[index] * frames.at(-1).globalStage[index],
    0,
  ) / totalWeight;
  assert.ok(Math.abs(frames.at(-1).overallProgress - expected) < 1e-12);
});

test('overall progress advances from educe before any ticket is reviewed', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 100, reviewed: 0 });
  const model = makeModel({
    packages: [pkg],
    events: [stageEvent('educe', INITIAL_TIME + 10, pkg.id, 1)],
  });
  const last = buildFrames(model, { frames: 40, fps: 10 }).at(-1);
  const totalWeight = STAGE_WEIGHT.reduce((sum, weight) => sum + weight, 0);
  assert.ok(last.overallProgress > 0);
  assert.equal(last.overallProgress, STAGE_WEIGHT[0] / totalWeight);
});

test('a workspace-level smooth event covers every package without a zero-time fallback', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  const measuredAt = '2026-11-02T00:00:00.000Z';
  const workspaceArtifacts = {
    initialT: INITIAL_TIME,
    educeStatus: null,
    smoothStatus: {
      measuredAt,
      verdict: { exitCode: 0, findings: 0, blocked: 0, readings: 0, withheld: 0 },
    },
  };
  const state = derivePackageState(pkg, {}, workspaceArtifacts, [], []);
  const smoothEvents = state.events.filter((event) => event.stage === 'smooth');
  assert.ok(smoothEvents.length > 0);
  assert.ok(smoothEvents.every((event) => event.packageId === null || event.packageId === undefined));
  assert.ok(smoothEvents.every((event) => event.t === Date.parse(measuredAt)));
});

test('C011: every ticket is present from the split completion instant', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  const splitAt = Date.parse('2026-11-05T12:00:00.000Z');
  const splitSteps = Object.fromEntries([
    '0-1', '0-2', '1', '2', '3', '4-1', '4-2', '5-1', '5-2', '5-3', '6',
  ].map((step) => [step, 'done']));
  const artifacts = {
    splitStatus: { steps: splitSteps, updatedAt: new Date(splitAt).toISOString() },
    ticketsPath: '/tmp/Tickets.json',
    tickets: {
      phases: [{ id: 0, tickets: [{ id: 1, phaseId: 0, status: 'todo', contracts: [{ id: 'C1' }] }] }],
    },
  };

  const state = derivePackageState(pkg, artifacts, { initialT: INITIAL_TIME }, [], []);

  assert.equal(state.packageModel.contractLog.length, 1);
  assert.equal(state.packageModel.contractLog[0].presentAt, splitAt);
  assert.equal(state.packageModel.contractLog[0].reviewedAt, null);
});

test('the header names smooth while smooth is the running stage', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  const events = [
    stageEvent('educe', INITIAL_TIME, null, 1),
    stageEvent('explain', INITIAL_TIME + 1000, pkg.id, 1),
    stageEvent('grill', INITIAL_TIME + 2000, pkg.id, 1),
    stageEvent('smooth', INITIAL_TIME + 5000, null, 1),
    stageEvent('graphify', INITIAL_TIME + 6000, pkg.id, 1),
  ];
  const frames = buildFrames(makeModel({ packages: [pkg], events }), { frames: 120, fps: 10 });
  const smoothStart = frames.findIndex((frame) => frame.globalStage[3] > 0);
  assert.ok(smoothStart > 0);
  assert.equal(frames[smoothStart].stage, 'smooth');
});

test('grill does not start until every package has finished explain', () => {
  const first = packageModel({ id: 'pkg-1', total: 10 });
  const second = packageModel({ id: 'pkg-2', total: 10 });
  const events = [
    stageEvent('educe', INITIAL_TIME, null, 1),
    stageEvent('explain', INITIAL_TIME + 1000, first.id, 1),
    stageEvent('grill', INITIAL_TIME + 2000, first.id, 1),
    stageEvent('explain', INITIAL_TIME + 3000, second.id, 1),
    stageEvent('grill', INITIAL_TIME + 4000, second.id, 1),
  ];
  const frames = buildFrames(makeModel({ packages: [first, second], events }), { frames: 120, fps: 10 });
  const firstGrill = frames.findIndex((frame) => frame.globalStage[2] > 0);
  assert.ok(firstGrill > 0);
  assert.ok(frames.slice(0, firstGrill).some((frame) => frame.globalStage[1] > 0));
  assert.ok(frames.slice(0, firstGrill).every((frame) => frame.globalStage[2] === 0));
  assert.equal(frames[firstGrill].globalStage[1], 1);
});

test('smooth is displayed after grill and before graphify even when measured later', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  const events = [
    stageEvent('educe', INITIAL_TIME, null, 1),
    stageEvent('explain', INITIAL_TIME + 1000, pkg.id, 1),
    stageEvent('grill', INITIAL_TIME + 2000, pkg.id, 1),
    stageEvent('graphify', INITIAL_TIME + 4000, pkg.id, 1),
    stageEvent('smooth', INITIAL_TIME + 9000, null, 1),
  ];
  const frames = buildFrames(makeModel({ packages: [pkg], events }), { frames: 120, fps: 10 });
  const firstFrameAt = (stageIndex) => frames.findIndex((frame) => frame.pi[0][stageIndex] > 0);
  const explain = firstFrameAt(1);
  const grill = firstFrameAt(2);
  const smooth = firstFrameAt(3);
  const graphify = firstFrameAt(4);
  assert.ok(explain >= 0);
  assert.ok(grill > explain);
  assert.ok(smooth > grill);
  assert.ok(graphify > smooth);
});

test('a growth event without contract mass still adds one scope unit per ticket', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  pkg.obligations.ticketOnly = 2;
  const model = makeModel({
    packages: [pkg],
    growthEvents: [{
      packageId: pkg.id,
      t: INITIAL_TIME + 50,
      prec: 'ms',
      stage: 'find',
      addedTicketKeys: ['P1-1', 'P1-2'],
      addedContracts: 0,
      addedReviewed: 0,
      evidence: 'OMISSIONS-20261102000000.json',
      confidence: 'omission',
    }],
  });
  const frames = buildFrames(model, { frames: 60, fps: 10 });
  const growthFrame = frames.findIndex((frame) => frame.growth.length > 0);
  assert.equal(frames[growthFrame - 1].packages[0].total, 8);
  assert.equal(frames[growthFrame].packages[0].total, 10);
  assert.equal(frames[growthFrame].growth[0].addedMass, 2);
});

// PX-374 @verifies C007 @verifies C010
test('PX-374 displayed stage is a monotonic frontier', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
  const events = [
    stageEvent('drill', INITIAL_TIME, pkg.id, 1),
    stageEvent('split', INITIAL_TIME + 1000, pkg.id, 1),
  ];
  const frames = buildFrames(makeModel({ packages: [pkg], events }), { frames: 120 });
  const indexes = frames.map((frame) => STAGE_ORDER.indexOf(frame.stage));

  assert.ok(indexes.every((value, index) => index === 0 || value >= indexes[index - 1]));
  assert.equal(frames.at(-1).t, INITIAL_TIME + 1000);
});

// PX-374 @verifies C010
test('PX-374 progressAt equals the last applied frame state', () => {
  const packages = withPackageCount(2).packages;
  const model = makeModel({ packages, events: eventsForEveryStage(packages) });
  const frames = buildFrames(model, { frames: 8000 });
  const samples = [INITIAL_TIME - 1, INITIAL_TIME, INITIAL_TIME + 1500, INITIAL_TIME + 4500, INITIAL_TIME + 20000];

  for (const timestamp of samples) {
    const built = buildTimeline(model);
    const state = createFrameState(model, built);
    for (const event of built.timeline) {
      if (event.evidenceT <= timestamp) applyEvent(state, event);
    }
    assert.equal(progressAt(model, timestamp), frameFromState(state, model, 0).overallProgress);
  }

  const before = JSON.stringify(model);
  progressAt(model, INITIAL_TIME + 1500);
  assert.equal(JSON.stringify(model), before);
});
