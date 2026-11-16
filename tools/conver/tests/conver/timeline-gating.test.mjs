// PX-433 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFrames,
  buildModel,
  gateImplementationProgress,
  replayHistoryProgress,
  STAGE_ORDER,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { makeModel, packageModel } from './models.mjs';

const INDEX = Object.fromEntries(STAGE_ORDER.map((stage, position) => [stage, position]));

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
test('C004: later implementation stages are gated by their predecessor', () => {
  const raw = new Array(STAGE_ORDER.length).fill(0);
  raw[INDEX.make] = 1;
  raw[INDEX.plan] = 1;
  raw[INDEX.start] = 1;
  raw[INDEX.review] = 0.5;
  raw[INDEX.resolve] = 1;
  raw[INDEX.consolidate] = 1;
  raw[INDEX.find] = 1;
  const gated = gateImplementationProgress(raw);

  assert.equal(gated[INDEX.find], 0.5);
  assert.equal(gated[INDEX.consolidate], 0.5);
  assert.equal(gated[INDEX.make] >= gated[INDEX.plan], true);
});

test('C004: an idle package has all implementation stages at zero', () => {
  const gated = gateImplementationProgress(new Array(STAGE_ORDER.length).fill(0));
  assert.equal(gated.every((value) => value === 0), true);
});

test('C004: frames display the gated value when find arrives before review', () => {
  const packages = [packageModel({ id: 'pkg-1', total: 10 })];
  const records = [
    { v: 1, runId: 'r1', event: 'finish', command: 'make-ticket', stage: 'make', packageId: 'pkg-1', at: '2026-11-01T00:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [] },
    { v: 1, runId: 'r2', event: 'finish', command: 'plan-ticket', stage: 'plan', packageId: 'pkg-1', at: '2026-11-01T01:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [] },
    { v: 1, runId: 'r3', event: 'finish', command: 'start-ticket', stage: 'start', packageId: 'pkg-1', at: '2026-11-01T02:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [] },
    { v: 1, runId: 'r4', event: 'finish', command: 'review-ticket', stage: 'review', packageId: 'pkg-1', at: '2026-11-02T00:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [], delta: 0.5 },
    { v: 1, runId: 'r5', event: 'finish', command: 'resolve-ticket', stage: 'resolve', packageId: 'pkg-1', at: '2026-11-02T01:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [], delta: 0.5 },
    { v: 1, runId: 'r6', event: 'finish', command: 'consolidate-stubs', stage: 'consolidate', packageId: 'pkg-1', at: '2026-11-02T02:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [], delta: 0.5 },
    { v: 1, runId: 'r7', event: 'finish', command: 'find-omissions', stage: 'find', packageId: 'pkg-1', at: '2026-11-03T00:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [] },
  ];
  const replay = replayHistoryProgress(records, packages);
  const model = buildModel({
    ...makeModel({ packages }),
    events: replay.events,
    runs: replay.runs,
    timelineMode: 'history',
    initialT: Date.parse(records[0].at),
  });
  const frames = buildFrames(model, { frames: 24 });
  const last = frames.at(-1);

  assert.equal(last.pi[0][INDEX.find], 0.5);
  assert.equal(last.pi[0][INDEX.review], 0.5);
});
