// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
// PX-366 @verifies C003 @verifies C004 @verifies C005 @verifies C006
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { writeWorkspace } from './fixtures.mjs';
import { analyzeWorkspace } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { STAGE_ORDER, buildFrames } from '../../.claude/scripts/conver/progress-gif/loop.js';

const GOLDEN = JSON.parse(fs.readFileSync(new URL('./fixtures/no-history-frames.json', import.meta.url), 'utf8'));
const DRILL_INDEX = STAGE_ORDER.indexOf('drill');

/** A finish record for the one package in the fixture. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function finish(runId, at, status = 'COMPLETE', addedTicketKeys = []) {
  return {
    v: 1,
    runId,
    event: 'finish',
    command: 'drill-rfc-down',
    stage: 'drill',
    packageId: 'pkg-1',
    at,
    status,
    addedTicketKeys,
  };
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function start(runId, at) {
  return {
    v: 1,
    runId,
    event: 'start',
    command: 'drill-rfc-down',
    stage: 'drill',
    packageId: 'pkg-1',
    at,
  };
}

/** Build a package with a drill status, history records, and optional extra files. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function historyWorkspace({ records = [], drillStatus = null, files = {} } = {}) {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/Tickets.json': { phases: [] },
      ...(drillStatus === null ? {} : { 'pkg-1/drills/Status.json': drillStatus }),
      ...files,
    },
  });
  if (records.length > 0) {
    fs.writeFileSync(
      path.join(root, 'pkg-1', '.conver-history.jsonl'),
      records.map((record) => JSON.stringify(record)).join('\n') + '\n',
    );
  }
  return root;
}

test('C003: a COMPLETE finish replaces the drill status time and keeps one stage event', () => {
  const root = historyWorkspace({
    drillStatus: { state: 'DONE', currentStep: '1-12', updatedAt: '2026-11-05T00:00:00.000Z' },
    records: [finish('run-1', '2026-11-04T12:00:00.000Z')],
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const drillEvents = model.events.filter((event) => event.stage === 'drill' && event.packageId === 'pkg-1');

  assert.equal(drillEvents.length, 1);
  assert.equal(drillEvents[0].t, Date.parse('2026-11-04T12:00:00.000Z'));
  assert.equal(drillEvents[0].inc, 1);
});

test('C004: two COMPLETE runs emit two markers and never exceed progress 1', () => {
  const root = historyWorkspace({
    drillStatus: { state: 'DONE', currentStep: '1-12', updatedAt: '2026-11-05T00:00:00.000Z' },
    records: [
      finish('run-1', '2026-11-04T12:00:00.000Z'),
      finish('run-2', '2026-11-04T13:00:00.000Z'),
    ],
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const frames = buildFrames(model, { frames: 40 });
  const markers = frames.flatMap((frame) => frame.runs || []).filter((run) => run.stage === 'drill');

  assert.equal(markers.length, 2);
  assert.ok(frames.every((frame) => frame.pi.every((stages) => stages[DRILL_INDEX] <= 1)));
});

test('C005: a BLOCKED_PREREQUISITE run is not drawn and adds no progress', () => {
  const root = historyWorkspace({
    drillStatus: { state: 'DONE', currentStep: '1-12', updatedAt: '2026-11-05T00:00:00.000Z' },
    records: [finish('run-1', '2026-11-04T12:00:00.000Z', 'BLOCKED_PREREQUISITE')],
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const frames = buildFrames(model, { frames: 40 });
  const markers = frames.flatMap((frame) => frame.runs || []).filter((run) => run.stage === 'drill');

  assert.equal(markers.length, 0);
  assert.ok(frames.every((frame) => frame.pi.every((stages) => stages[DRILL_INDEX] <= 1)));
});

test('C005: a start-only run is not drawn and adds no progress and no growth', () => {
  const root = historyWorkspace({
    drillStatus: { state: 'DONE', currentStep: '1-12', updatedAt: '2026-11-05T00:00:00.000Z' },
    records: [start('run-1', '2026-11-04T12:00:00.000Z')],
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const frames = buildFrames(model, { frames: 40 });
  const markers = frames.flatMap((frame) => frame.runs || []).filter((run) => run.stage === 'drill');

  assert.equal(markers.length, 0);
  assert.equal(model.growthEvents.filter((event) => event.stage === 'drill').length, 0);
});

test('C005: a BLOCKED make run cannot advance the displayed stage to MAKE', () => {
  const root = historyWorkspace({
    records: [
      { v: 1, runId: 'run-1', event: 'finish', command: 'make-ticket', stage: 'make', packageId: 'pkg-1', at: '2026-11-09T01:32:30.357Z', status: 'BLOCKED_PREREQUISITE', addedTicketKeys: [] },
      { v: 1, runId: 'run-2', event: 'finish', command: 'split-to-tickets', stage: 'split', packageId: 'pkg-1', at: '2026-11-09T02:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [] },
    ],
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const frames = buildFrames(model, { frames: 40 });
  const stages = frames.map((frame) => frame.stage);
  assert.equal(stages.includes('make'), false);
});

test('C005: a history ticket key appears once at the history time', () => {
  const root = historyWorkspace({
    drillStatus: { state: 'DONE', currentStep: '1-12', updatedAt: '2026-11-05T00:00:00.000Z' },
    records: [finish('run-1', '2026-11-04T12:00:00.000Z', 'COMPLETE', ['PX-401'])],
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const growth = model.growthEvents.filter((event) => (event.addedTicketKeys || []).includes('PX-401'));

  assert.equal(growth.length, 1);
  assert.equal(growth[0].stage, 'drill');
  assert.equal(growth[0].t, Date.parse('2026-11-04T12:00:00.000Z'));
});

test('C005: history and an omission with the same key add one growth event, not two', () => {
  const root = historyWorkspace({
    drillStatus: { state: 'DONE', currentStep: '1-12', updatedAt: '2026-11-05T00:00:00.000Z' },
    records: [finish('run-1', '2026-11-02T12:00:00.000Z', 'COMPLETE', ['PX-401'])],
    files: { 'pkg-1/OMISSIONS-20261103120000.json': { omissions: [{ ticketKey: 'PX-401' }] } },
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const frames = buildFrames(model, { frames: 60 });
  const growthEntries = frames.flatMap((frame) => frame.growth || []).filter((entry) => entry.addedMass > 0);

  assert.equal(growthEntries.length, 1);
  assert.equal(growthEntries[0].stage, 'drill');
});

test('C006: no history and no split evidence produces the frozen evidence-gated frames and no runs', () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/Tickets.json': {
        metadata: { generatedAt: '2026-11-01T00:00:00.000Z' },
        phases: [{
          id: 0,
          tickets: [{
            id: 1,
            phaseId: 0,
            status: 'reviewed',
            title: 't',
            created_at: '2026-11-01T00:00:00.000Z',
            completedAt: '2026-11-02T00:00:00.000Z',
            contracts: [{ id: 'C1' }],
          }],
        }],
      },
    },
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const frames = buildFrames(model, { frames: 20 });

  // PX-374 deliberately removed artifact-only split credit: the fixture has
  // Tickets.json but no RFC-SPLIT-Status.json and no split history, so the
  // regenerated golden still freezes every frame and the split stage stays 0.
  assert.equal(model.runs.length, 0);
  assert.equal(model.packages[0].stages.split, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(frames)), GOLDEN);
});

test('C004: run markers never change package fill or stage progress', () => {
  const withoutHistory = historyWorkspace({
    drillStatus: { state: 'DONE', currentStep: '1-12', updatedAt: '2026-11-05T00:00:00.000Z' },
  });
  const withHistory = historyWorkspace({
    drillStatus: { state: 'DONE', currentStep: '1-12', updatedAt: '2026-11-05T00:00:00.000Z' },
    records: [finish('run-1', '2026-11-04T12:00:00.000Z')],
  });

  const baseline = buildFrames(analyzeWorkspace(withoutHistory, { sourceScan: false }), { frames: 40 });
  const marked = buildFrames(analyzeWorkspace(withHistory, { sourceScan: false }), { frames: 40 });

  assert.deepEqual(marked.at(-1).pi, baseline.at(-1).pi);
  assert.deepEqual(marked.at(-1).packages, baseline.at(-1).packages);
});

test('C002: a malformed history line is a model warning and the draw survives', () => {
  const root = historyWorkspace({
    drillStatus: { state: 'DONE', currentStep: '1-12', updatedAt: '2026-11-05T00:00:00.000Z' },
  });
  fs.writeFileSync(path.join(root, 'pkg-1', '.conver-history.jsonl'), 'not-json\n');

  const model = analyzeWorkspace(root, { sourceScan: false });

  assert.equal(model.warnings.some((warning) => /line 1/.test(warning)), true);
  assert.doesNotThrow(() => buildFrames(model, { frames: 10 }));
});
