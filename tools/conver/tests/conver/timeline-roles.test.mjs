// PX-433 @verifies C003
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMAND_ROLES,
  applyEvent,
  buildTimeline,
  classifyCommandRole,
  createFrameState,
  replayHistoryProgress,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { makeModel, packageModel } from './models.mjs';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function record(overrides = {}) {
  return {
    v: 1,
    runId: `run-${Math.random().toString(16).slice(2)}`,
    event: 'finish',
    command: 'graphify-rfc',
    stage: 'graphify',
    packageId: 'pkg-1',
    at: '2026-11-07T12:00:00.000Z',
    status: 'COMPLETE',
    addedTicketKeys: [],
    ...overrides,
  };
}

test('C003: pre-review consolidate-stubs is maintenance; post-review is pipeline', () => {
  assert.equal(classifyCommandRole({ command: 'consolidate-stubs', reviewProgress: 0 }), COMMAND_ROLES.MAINTENANCE);
  assert.equal(classifyCommandRole({ command: 'consolidate-stubs', reviewProgress: 1 }), COMMAND_ROLES.PIPELINE);
  assert.equal(classifyCommandRole({ command: 'drill-rfc-down' }), COMMAND_ROLES.EVOLUTION);
  assert.equal(classifyCommandRole({ command: 'graphify-rfc', firstForPackage: false }), COMMAND_ROLES.REVISION);
});

test('C003: maintenance and revision produce run markers but no stage event', () => {
  const packages = [packageModel({ id: 'pkg-1', total: 10 })];
  const records = [
    record({ stage: 'consolidate', command: 'consolidate-stubs', at: '2026-11-14T17:18:00.000Z', role: 'maintenance' }),
    record({ stage: 'graphify', at: '2026-11-14T18:00:00.000Z', role: 'revision' }),
    record({ stage: 'make', command: 'make-ticket', at: '2026-11-14T19:00:00.000Z', role: 'pipeline' }),
  ];
  const replay = replayHistoryProgress(records, packages);

  assert.equal(replay.events.filter((event) => event.stage === 'consolidate').length, 0);
  assert.equal(replay.events.filter((event) => event.stage === 'graphify').length, 0);
  assert.equal(replay.events.filter((event) => event.stage === 'make').length, 1);
  assert.equal(replay.runs.length, 3);
  assert.equal(replay.runs.find((run) => run.stage === 'consolidate').role, 'maintenance');
});

test('C003: only pipeline and evolution runs move the headline', () => {
  const model = makeModel({ packages: [packageModel({ id: 'pkg-1', total: 10 })] });
  const state = createFrameState(model, buildTimeline(model));

  applyEvent(state, { kind: 'run', stage: 'drill', packageId: null, t: 2000, evidenceT: 2000, role: 'evolution', seq: 0 });
  assert.equal(state.lastStage, 'drill');

  applyEvent(state, { kind: 'run', stage: 'graphify', packageId: null, t: 3000, evidenceT: 3000, role: 'revision', seq: 1 });
  assert.equal(state.lastStage, 'drill');

  applyEvent(state, { kind: 'run', stage: 'make', packageId: null, t: 4000, evidenceT: 4000, role: 'pipeline', seq: 2 });
  assert.equal(state.lastStage, 'make');
});
