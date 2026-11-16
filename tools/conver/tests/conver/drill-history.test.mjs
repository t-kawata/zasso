// PX-433 @verifies C005
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTimeline,
  createFrameState,
  applyEvent,
  drillProgressFraction,
  replayHistoryProgress,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { makeModel, packageModel } from './models.mjs';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
test('C005: drill status yields the progress fraction', () => {
  assert.equal(drillProgressFraction({ state: 'COMPLETE', currentStep: '1-12' }), 1);
  assert.equal(drillProgressFraction({ state: 'IN_PROGRESS', currentStep: '1-6' }), 0.5);
  assert.equal(drillProgressFraction({ state: 'IN_PROGRESS', currentStep: '5-1' }), 1);
  assert.equal(drillProgressFraction({ state: 'REPAIR_NO_PROGRESS', currentStep: '0' }), 0);
});

test('C005: drill status is a stage event; repair attempts are evolution markers', () => {
  const packages = [packageModel({ id: 'pkg-1', total: 10 })];
  const records = [
    { v: 1, runId: 'drill-1', event: 'finish', command: 'drill-rfc-down', stage: 'drill', packageId: 'pkg-1', at: '2026-11-05T00:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [], role: 'evolution', delta: 1 },
    { v: 1, runId: 'drill-2', event: 'finish', command: 'drill-rfc-down', stage: 'drill', packageId: 'pkg-1', at: '2026-11-13T04:28:00.000Z', status: 'REPAIR_NO_PROGRESS', addedTicketKeys: [], role: 'evolution' },
  ];
  const replay = replayHistoryProgress(records, packages);

  assert.equal(replay.events.filter((event) => event.stage === 'drill').length, 1);
  assert.equal(replay.events.find((event) => event.stage === 'drill').inc, 1);
  assert.equal(replay.runs.filter((run) => run.stage === 'drill').length, 2);
  assert.equal(replay.runs.every((run) => run.role === 'evolution'), true);
});

test('C005: evolution runs move the headline to DRILL', () => {
  const model = makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] });
  const state = createFrameState(model, buildTimeline(model));
  applyEvent(state, { kind: 'run', stage: 'drill', packageId: 'pkg-1', t: 2000, evidenceT: 2000, role: 'evolution', seq: 0 });
  assert.equal(state.lastStage, 'drill');
});
