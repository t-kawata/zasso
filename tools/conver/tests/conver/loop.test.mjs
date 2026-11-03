// [::TICKET::] PX-350 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-350 --for-spec --no-implementation-order`.
// PX-350 @verifies C001 @verifies C003 @verifies C004 @verifies C005
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE_ORDER,
  LOOP_GROUPS,
  reconstructTicketGrowth,
  buildFrames,
  buildModel,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { HOLD_END_FRAMES, HOLD_START_FRAMES } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { INITIAL_TIME, makeModel, packageModel, stageEvent } from './models.mjs';

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

test('ticket growth increases area inline, persists, and may lower the completion ratio', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 100, reviewed: 10 });
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
  assert.ok(frames[growthFrame].packages[0].fill < frames[growthFrame - 1].packages[0].fill);
  assert.equal(frames.at(-1).packages[0].total, 100);
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

test('a growth event without contract mass still adds one scope unit per ticket', () => {
  const pkg = packageModel({ id: 'pkg-1', total: 10 });
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
