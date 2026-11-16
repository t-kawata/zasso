// PX-433 @verifies C002 @verifies C007
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFrames,
  buildModel,
  buildTimeline,
  replayHistoryProgress,
  STAGE_ORDER,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { makeModel, packageModel } from './models.mjs';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function finish(stage, at, overrides = {}) {
  return {
    v: 1,
    runId: `run-${stage}-${at}`,
    event: 'finish',
    command: stage,
    stage,
    packageId: 'pkg-1',
    at,
    status: 'COMPLETE',
    addedTicketKeys: [],
    ...overrides,
  };
}

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function historyModel(records) {
  const packages = [packageModel({ id: 'pkg-1', total: 10 })];
  const replay = replayHistoryProgress(records, packages);
  return buildModel({
    ...makeModel({ packages }),
    events: replay.events,
    runs: replay.runs,
    timelineMode: 'history',
    initialT: Date.parse(records[0].at),
  });
}

test('C002: history events use the record time as their order time', () => {
  const records = [finish('explain', '2026-11-02T00:00:00.000Z')];
  const model = historyModel(records);
  const timeline = buildTimeline(model);
  const event = timeline.timeline.find((entry) => entry.kind === 'stage' && entry.stage === 'explain');

  assert.equal(event.orderT, Date.parse(records[0].at));
  assert.equal(event.evidenceT, Date.parse(records[0].at));
  assert.equal(Object.hasOwn(event, 'displayDate'), false);
});

test('C002: appending a later record does not move an earlier order time', () => {
  const first = finish('explain', '2026-11-02T00:00:00.000Z');
  const later = finish('graphify', '2026-11-07T12:30:54.038Z');
  const before = buildTimeline(historyModel([first]));
  const after = buildTimeline(historyModel([first, later]));

  assert.equal(after.timeline[0].orderT, before.timeline[0].orderT);
  assert.equal(after.timeline.filter((entry) => entry.kind === 'stage').length, 2);
});

test('C002: a stage with an artifact but no history record emits no history event', () => {
  const packages = [packageModel({ id: 'pkg-1', total: 10 })];
  const replay = replayHistoryProgress([], packages);

  assert.equal(replay.events.length, 0);
});

test('C002: no-history model renders the estimated timeline mode', () => {
  const model = makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] });
  const frames = buildFrames(model, { frames: 12 });

  assert.equal(frames[0].timelineMode, 'estimated');
  assert.equal(frames.at(-1).timelineMode, 'estimated');
});

test('C002: history model renders the history timeline mode', () => {
  const model = historyModel([finish('explain', '2026-11-02T00:00:00.000Z')]);
  const frames = buildFrames(model, { frames: 12 });

  assert.equal(frames[0].timelineMode, 'history');
  assert.equal(frames[0].stage, 'explain');
  assert.equal(STAGE_ORDER.includes(frames[0].stage), true);
});
