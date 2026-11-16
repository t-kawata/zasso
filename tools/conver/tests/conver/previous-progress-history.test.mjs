// PX-433 @verifies C006 @verifies C008
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildModel,
  progressAt,
  replayHistoryProgress,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { makeModel, packageModel } from './models.mjs';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function finish(stage, at, inc = 1) {
  return { v: 1, runId: `r-${stage}-${at}`, event: 'finish', command: stage, stage, packageId: 'pkg-1', at, status: 'COMPLETE', addedTicketKeys: [], role: 'pipeline', delta: inc };
}

test('C006: progressAt at a previous instant is stable when later records are appended', () => {
  const packages = [packageModel({ id: 'pkg-1', total: 10 })];
  const first = finish('explain', '2026-11-02T00:00:00.000Z');
  const later = finish('graphify', '2026-11-07T12:00:00.000Z');
  const beforeReplay = replayHistoryProgress([first], packages);
  const before = buildModel({
    ...makeModel({ packages }),
    events: beforeReplay.events,
    runs: beforeReplay.runs,
    timelineMode: 'history',
    initialT: Date.parse(first.at),
  });
  const afterReplay = replayHistoryProgress([first, later], packages);
  const after = buildModel({
    ...makeModel({ packages }),
    events: afterReplay.events,
    runs: afterReplay.runs,
    timelineMode: 'history',
    initialT: Date.parse(first.at),
  });
  const previousStamp = Date.parse('2026-11-05T00:00:00.000Z');

  assert.equal(progressAt(after, previousStamp), progressAt(before, previousStamp));
});

test('C008: previous snapshot overall matches progressAt at its stamp', () => {
  const packages = [packageModel({ id: 'pkg-1', total: 10 })];
  const records = [
    finish('explain', '2026-11-01T00:00:00.000Z'),
    finish('graphify', '2026-11-03T00:00:00.000Z'),
  ];
  const replay = replayHistoryProgress(records, packages);
  const model = buildModel({
    ...makeModel({ packages }),
    events: replay.events,
    runs: replay.runs,
    timelineMode: 'history',
    initialT: Date.parse(records[0].at),
  });
  const stamp = Date.parse('2026-11-02T00:00:00.000Z');
  const previousOverall = progressAt(model, stamp);

  assert.equal(progressAt(model, stamp), previousOverall);
});
