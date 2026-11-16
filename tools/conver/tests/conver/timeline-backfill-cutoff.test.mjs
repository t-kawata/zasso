// PX-434 @verifies C001 @verifies C002 @verifies C003 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildBackfillRecords, readHistoryCutoff } from '../../.claude/scripts/conver/progress-gif/backfill.js';
import { replayHistoryProgress, STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { packageModel } from './models.mjs';

const T0 = '2026-11-10T00:00:00.000Z';

// [::TICKET::] PX-434 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-434 --for-spec --no-implementation-order`.
function finish(overrides = {}) {
  return {
    v: 1,
    runId: 'run-1',
    event: 'finish',
    command: 'make-ticket',
    stage: 'make',
    packageId: 'pkg-1',
    at: '2026-11-11T00:00:00.000Z',
    status: 'COMPLETE',
    addedTicketKeys: [],
    ...overrides,
  };
}

// [::TICKET::] PX-434 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-434 --for-spec --no-implementation-order`.
function packages() {
  return [packageModel({ id: 'pkg-1', total: 10 }), packageModel({ id: 'pkg-2', total: 10 })];
}

test('C001: backfill fills only evidence strictly before the target history cutoff', () => {
  const evidence = {
    history: [],
    status: [
      { stage: 'grill', packageId: 'pkg-1', at: '2026-11-09T00:00:00.000Z', evidenceKey: 'pkg-1/Status.json#before' },
      { stage: 'grill', packageId: 'pkg-1', at: '2026-11-11T00:00:00.000Z', evidenceKey: 'pkg-1/Status.json#after' },
    ],
    tickets: [{ stage: 'make', packageId: 'pkg-1', at: '2026-11-11T00:00:00.000Z', evidenceKey: 'pkg-1/Tickets.json' }],
    git: [
      { stage: 'explain', packageId: 'pkg-1', at: '2026-11-02T00:00:00.000Z', evidenceKey: 'pkg-1/EXPLAIN-RFC-SEED.md#before' },
      { stage: 'explain', packageId: 'pkg-1', at: '2026-11-11T00:00:00.000Z', evidenceKey: 'pkg-1/EXPLAIN-RFC-SEED.md#after' },
    ],
  };
  const records = buildBackfillRecords(evidence, {
    cutoffs: { root: T0, packages: { 'pkg-1': T0 } },
  });

  assert.deepEqual(records.map((record) => record.stage).sort(), ['explain', 'grill']);
  assert.equal(records.some((record) => record.stage === 'make'), false);
});

test('C001: the evidence bucket named tickets is emitted as the canonical ticket source', () => {
  const records = buildBackfillRecords({
    history: [],
    status: [],
    tickets: [{ stage: 'make', packageId: 'pkg-1', at: '2026-11-09T00:00:00.000Z', evidenceKey: 'pkg-1/Tickets.json' }],
    git: [],
  }, { cutoffs: { root: T0, packages: { 'pkg-1': T0 } } });

  assert.equal(records.length, 1);
  assert.equal(records[0].source, 'ticket');
  assert.equal(records[0].stage, 'make');
});

test('C001: a live history record is never re-emitted by backfill', () => {
  const live = finish({ at: '2026-11-09T00:00:00.000Z' });
  const records = buildBackfillRecords({
    history: [live],
    status: [],
    tickets: [],
    git: [],
  }, { cutoffs: { root: T0, packages: { 'pkg-1': T0 } } });

  assert.equal(records.some((record) => record.source === 'history'), false);
  assert.equal(records.length, 0);
});

test('C002: every repeated implementation run contributes progress', () => {
  const records = [
    finish({ runId: 'make-1', at: '2026-11-11T10:00:00.000Z' }),
    finish({ runId: 'make-2', at: '2026-11-11T11:00:00.000Z' }),
  ];
  const { events } = replayHistoryProgress(records, packages());

  const makeEvents = events.filter((event) => event.stage === 'make');
  assert.equal(makeEvents.length, 2);
  assert.equal(makeEvents.every((event) => event.role === 'pipeline'), true);
});

test('C002: a maintenance consolidation still contributes progress but is marked maintenance', () => {
  const records = [finish({
    runId: 'consolidate-1',
    stage: 'consolidate',
    command: 'consolidate-stubs',
    at: '2026-11-11T10:00:00.000Z',
  })];
  const { events } = replayHistoryProgress(records, packages());

  const consolidate = events.filter((event) => event.stage === 'consolidate');
  assert.equal(consolidate.length, 1);
  assert.equal(consolidate[0].role, 'maintenance');
});

test('C003: educe is workspace-scoped even when recorded against a package', () => {
  const records = [finish({
    runId: 'educe-1',
    stage: 'educe',
    command: 'workspacify-order',
    packageId: 'pkg-1',
    at: '2026-11-09T00:00:00.000Z',
  })];
  const { events } = replayHistoryProgress(records, packages());

  assert.equal(events.length, 1);
  assert.equal(events[0].stage, 'educe');
  assert.equal(events[0].packageId, null);
});

test('C004: a drill finish survives replay as an evolution marker', () => {
  const records = [finish({
    runId: 'drill-1',
    stage: 'drill',
    command: 'drill-rfc-down',
    at: '2026-11-09T00:00:00.000Z',
  })];
  const { events, runs } = replayHistoryProgress(records, packages());

  assert.equal(events.some((event) => event.stage === 'drill' && event.role === 'evolution'), true);
  assert.equal(runs.some((run) => run.stage === 'drill'), true);
});

test('C004: the stage order still contains exactly one drill stage', () => {
  assert.equal(STAGE_ORDER.includes('drill'), true);
  assert.equal(STAGE_ORDER.filter((stage) => stage === 'drill').length, 1);
});

test('C001: the cutoff is the first finish in the target history file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px434-cutoff-'));
  fs.writeFileSync(path.join(root, '.conver-history.jsonl'), [
    JSON.stringify({ event: 'start', at: '2026-11-01T00:00:00.000Z' }),
    JSON.stringify({ event: 'finish', at: '2026-11-10T00:00:00.000Z' }),
    JSON.stringify({ event: 'finish', at: '2026-11-11T00:00:00.000Z' }),
  ].join('\n'));

  assert.equal(readHistoryCutoff(root), Date.parse('2026-11-10T00:00:00.000Z'));
});

test('C001: a record exactly at the cutoff is not backfilled', () => {
  const records = buildBackfillRecords({
    history: [],
    status: [{ stage: 'grill', packageId: 'pkg-1', at: T0, evidenceKey: 'pkg-1/Status.json' }],
    tickets: [],
    git: [],
  }, { cutoffs: { root: T0, packages: { 'pkg-1': T0 } } });

  assert.equal(records.length, 0);
});
