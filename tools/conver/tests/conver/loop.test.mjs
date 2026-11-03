// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
// PX-349 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE_ORDER,
  LOOP_GROUPS,
  reconstructTicketGrowth,
  buildFrames,
  buildModel,
} from '../../.claude/scripts/conver/progress-gif/loop.js';

const packageModel = {
  id: 'pkg-1',
  name: 'one',
  path: 'one',
  obligations: { graph: 2, boundary: 1, ticketOnly: 0, total: 3, covered: 2, reviewed: 0 },
  tickets: { total: 1, reviewed: 0, remanded: 0 },
  stages: Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0])),
};

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

test('buildFrames produces a frame for every requested index and grows the denominator at growth', () => {
  const model = buildModel({
    workspaceRoot: '/tmp/workspace',
    tree: { run: { generated_at: '2026-11-01T00:00:00.000Z' }, workspace: { packages: [] } },
    allocate: { contract_registry: [] },
    packages: [packageModel],
    events: [],
    growthEvents: [{
      t: Date.parse('2026-11-02T00:00:00Z'),
      prec: 'ms',
      stage: 'find',
      packageId: 'pkg-1',
      addedTicketKeys: ['P2-1'],
      addedContracts: 2,
      evidence: 'Tickets-20261102000000.json',
      confidence: 'snapshot',
    }],
    warnings: [],
  });
  const frames = buildFrames(model, { frames: 3, fps: 10, scale: 1 });
  assert.equal(frames.length, 3);
  assert.equal(frames[0].packages[0].covered, 0);
  assert.equal(frames[2].packages[0].covered, 2);
});
