// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
// PX-374 @verifies C001 @verifies C002 @verifies C003 @verifies C008 @verifies C009 @verifies C010
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { analyzeWorkspace } from '../../.claude/scripts/conver/draw-progress-gif.js';
import {
  STAGE_ORDER,
  applyEvent,
  buildFrames,
  buildTimeline,
  countFactSectionsIn,
  createFrameState,
  frameFromState,
  progressAt,
  stageProgressOf,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { INITIAL_TIME, eventsForEveryStage, makeModel, packageModel, stageEvent, withPackageCount } from './models.mjs';
import { writeWorkspace } from './fixtures.mjs';

/** A workspace with exactly one package. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function onePackage(files = {}) {
  return writeWorkspace({
    packages: [{ id: 'pkg-1', name: 'pkg-1', path: 'pkg-1' }],
    files,
  });
}

/** Append history records for one directory. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function writeHistory(root, records, directory = 'pkg-1') {
  fs.writeFileSync(
    path.join(root, directory, '.conver-history.jsonl'),
    records.map((record) => JSON.stringify(record)).join('\n') + '\n',
  );
}

/** One finish record; the runId is unique per timestamp. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function finish({ stage = 'split', packageId = 'pkg-1', at, status = 'COMPLETE', command = 'split-to-tickets' }) {
  return {
    v: 1,
    runId: `run-${at}`,
    event: 'finish',
    command,
    stage,
    packageId,
    at,
    status,
    addedTicketKeys: [],
  };
}

/** A split status file; the renderer derives the split time from the runId epoch. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function splitStatus(runId, steps = { 6: 'done' }) {
  return { currentStep: '6', steps, runId, sourceFile: 'RFC.md', graphFile: 'RFC-GRAPH.json' };
}

/** A Tickets.json with no tickets. */
// [::TICKET::] PX-374 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-374 --for-spec --no-implementation-order`.
function emptyTickets(generatedAt = '2026-11-05') {
  return { metadata: { generatedAt }, phases: [{ id: 0, tickets: [] }] };
}

test('C001: Tickets.json without split status or split history yields zero credit and a warning', () => {
  const root = onePackage({ 'pkg-1/Tickets.json': emptyTickets() });
  const model = analyzeWorkspace(root, { sourceScan: false });

  assert.equal(model.events.filter((event) => event.stage === 'split').length, 0);
  assert.equal(model.packages[0].stages.split, 0);
  assert.ok(model.warnings.some((warning) =>
    warning.includes('[evidence] split pkg-1') && warning.includes('Tickets.json')));
});

test('C001: an artifact-only split stays uncredited even with a millisecond generatedAt', () => {
  const root = onePackage({ 'pkg-1/Tickets.json': emptyTickets('2026-11-05T00:00:00.000Z') });
  const model = analyzeWorkspace(root, { sourceScan: false });

  assert.equal(model.events.filter((event) => event.stage === 'split').length, 0);
  assert.equal(model.packages[0].stages.split, 0);
});

test('C003: a split status supplies the runId epoch and complete progress', () => {
  const tRun = Date.parse('2026-11-02T06:25:59.191Z');
  const root = onePackage({
    'pkg-1/Tickets.json': emptyTickets(),
    'pkg-1/RFC-SPLIT-Status.json': splitStatus(`${tRun}000000-94288`),
  });
  const model = analyzeWorkspace(root, { sourceScan: false });
  const splitEvents = model.events.filter((event) => event.stage === 'split');

  assert.equal(splitEvents.length, 1);
  assert.equal(splitEvents[0].t, tRun);
  assert.equal(splitEvents[0].inc, 1);
  assert.equal(model.packages[0].stages.split, 1);
});

test('C002: history wins when it is earlier than the status runId', () => {
  const statusTime = Date.parse('2026-11-04T12:00:00.000Z');
  const historyTime = Date.parse('2026-11-04T10:00:00.000Z');
  const root = onePackage({
    'pkg-1/Tickets.json': emptyTickets(),
    'pkg-1/RFC-SPLIT-Status.json': splitStatus(`${statusTime}000000-1`),
  });
  writeHistory(root, [finish({ at: '2026-11-04T10:00:00.000Z' })]);

  const model = analyzeWorkspace(root, { sourceScan: false });
  const split = model.events.find((event) => event.stage === 'split');

  assert.equal(split.t, historyTime);
  assert.equal(split.timeSource, 'history');
});

test('C002: status wins when it is earlier than the history finish', () => {
  const statusTime = Date.parse('2026-11-04T12:00:00.000Z');
  const root = onePackage({
    'pkg-1/Tickets.json': emptyTickets(),
    'pkg-1/RFC-SPLIT-Status.json': splitStatus(`${statusTime}000000-1`),
  });
  writeHistory(root, [finish({ at: '2026-11-04T13:00:00.000Z' })]);

  const model = analyzeWorkspace(root, { sourceScan: false });
  const split = model.events.find((event) => event.stage === 'split');

  assert.equal(split.t, statusTime);
  assert.equal(split.timeSource, 'status');
});

test('C002: a history finish without a status credits split progress', () => {
  const historyTime = Date.parse('2026-11-04T10:00:00.000Z');
  const root = onePackage({ 'pkg-1/Tickets.json': emptyTickets() });
  writeHistory(root, [finish({ at: '2026-11-04T10:00:00.000Z' })]);

  const model = analyzeWorkspace(root, { sourceScan: false });
  const split = model.events.find((event) => event.stage === 'split');

  assert.equal(split.t, historyTime);
  assert.equal(split.inc, 1);
  assert.equal(model.packages[0].stages.split, 1);
  assert.equal(split.timeSource, 'history');
});

test('C002: a BLOCKED finish is not completion evidence for split', () => {
  const root = onePackage({ 'pkg-1/Tickets.json': emptyTickets() });
  writeHistory(root, [finish({ at: '2026-11-04T10:00:00.000Z', status: 'BLOCKED_PREREQUISITE' })]);

  const model = analyzeWorkspace(root, { sourceScan: false });

  assert.equal(model.events.filter((event) => event.stage === 'split').length, 0);
  assert.equal(model.packages[0].stages.split, 0);
});

test('C002: the earliest COMPLETE finish wins over a later one', () => {
  const first = '2026-11-04T10:00:00.000Z';
  const second = '2026-11-04T12:00:00.000Z';
  const root = onePackage({ 'pkg-1/Tickets.json': emptyTickets() });
  writeHistory(root, [finish({ at: second }), finish({ at: first })].map((record, index) => ({
    ...record, runId: `run-${index}`,
  })));

  const model = analyzeWorkspace(root, { sourceScan: false });
  const split = model.events.find((event) => event.stage === 'split');

  assert.equal(split.t, Date.parse(first));
});

test('C002: later artifact mtimes do not move an earlier status completion', () => {
  const statusTime = Date.parse('2026-10-26T00:35:54.000Z');
  const historyTime = Date.parse('2026-11-04T13:16:11.398Z');
  const root = onePackage({
    'educe-sequences/status.json': {
      generationStartedAt: '2026-10-26T00:35:54.000Z',
      phases: Array.from({ length: 18 }, () => ({ status: 'done' })),
    },
    'demo-sequences.json': {},
  });
  writeHistory(root, [finish({
    stage: 'educe', packageId: null, at: '2026-11-04T13:16:11.398Z', command: 'workspacify-order',
  })], '.');

  const model = analyzeWorkspace(root, { sourceScan: false });
  const educeEvents = model.events.filter((event) => event.stage === 'educe');

  assert.ok(educeEvents.length > 0);
  assert.ok(educeEvents.every((event) => event.t <= Date.parse('2026-10-27T00:00:00Z')));
  assert.ok(educeEvents.every((event) => event.t < historyTime));
  assert.ok(educeEvents.every((event) => event.timeSource !== 'history'));
  assert.ok(educeEvents.every((event) => event.t !== statusTime || event.timeSource === 'status'));
});

test('C009: graphify and boundify artifacts without status or history are uncredited and warned', () => {
  const root = onePackage({
    'pkg-1/Tickets.json': emptyTickets(),
    'pkg-1/RFC-GRAPH.json': { nodes: [], edges: [] },
    'pkg-1/RFC-Dirs-Tree.json': { dirs: [] },
  });
  const model = analyzeWorkspace(root, { sourceScan: false });

  assert.equal(model.packages[0].stages.graphify, 0);
  assert.equal(model.packages[0].stages.boundify, 0);
  assert.equal(model.events.filter((event) => event.stage === 'graphify').length, 0);
  assert.equal(model.events.filter((event) => event.stage === 'boundify').length, 0);
  assert.ok(model.warnings.some((warning) => warning.includes('[evidence] graphify pkg-1') && warning.includes('RFC-GRAPH.json')));
  assert.ok(model.warnings.some((warning) => warning.includes('[evidence] boundify pkg-1') && warning.includes('RFC-Dirs-Tree.json')));
});

test('C009: a graphify status without an artifact still credits graphify', () => {
  const tRun = Date.parse('2026-11-03T00:00:00.000Z');
  const root = onePackage({
    'pkg-1/RFC-GRAPHIFY-Status.json': {
      runId: `${tRun}000000-1`,
      steps: { 0: 'done', 1: 'done', 2: 'done', 3: 'done', 4: 'done', 5: 'done' },
    },
  });
  const model = analyzeWorkspace(root, { sourceScan: false });
  const graphify = model.events.filter((event) => event.stage === 'graphify');

  assert.equal(model.packages[0].stages.graphify, 1);
  assert.equal(graphify.length, 1);
  assert.equal(graphify[0].t, tRun);
});

test('C009: grill resolved questions require grill status or history', () => {
  const files = {
    'pkg-1/Tickets.json': emptyTickets(),
    'pkg-1/DesignTree.json': {
      nodes: [{ id: 'N0001', status: 'resolved', questions: [{ resolvedAt: '2026-11-01T00:00:00.000Z' }], children: [] }],
    },
  };
  const uncredited = analyzeWorkspace(onePackage(files), { sourceScan: false });

  assert.equal(uncredited.events.filter((event) => event.stage === 'grill').length, 0);
  assert.equal(uncredited.packages[0].stages.grill, 0);
  assert.ok(uncredited.warnings.some((warning) => warning.includes('[evidence] grill pkg-1')));

  const credited = analyzeWorkspace(onePackage({
    ...files,
    'pkg-1/Status.json': { state: 'DONE', completedAt: '2026-11-01T00:00:00.000Z' },
  }), { sourceScan: false });

  assert.ok(credited.events.some((event) => event.stage === 'grill'));
  assert.ok(credited.packages[0].stages.grill > 0);
});

test('C002: a day-precision generatedAt is never an event instant; Tickets.json mtime is used', () => {
  const tickets = {
    metadata: { generatedAt: '2026-11-05' },
    phases: [{
      id: 0,
      tickets: [{ id: 1, phaseId: 0, status: 'reviewed', title: 't', contracts: [{ id: 'C1' }] }],
    }],
  };
  const root = onePackage({ 'pkg-1/Tickets.json': tickets });
  const ticketsPath = path.join(root, 'pkg-1', 'Tickets.json');
  const mtime = Date.parse('2026-11-03T12:00:00.000Z');
  fs.utimesSync(ticketsPath, new Date(mtime), new Date(mtime));

  const model = analyzeWorkspace(root, { sourceScan: false });
  const make = model.events.find((event) => event.stage === 'make' && event.packageId === 'pkg-1');

  assert.equal(make.t, mtime);
  assert.equal(make.timeSource, 'artifact');
  assert.notEqual(make.t, Date.parse('2026-11-05T00:00:00.000Z'));
});

test('C008: explain measures file text and a path is not text', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px374-explain-'));
  const info = path.join(directory, 'INFO-RFC-SEED.md');
  const explain = path.join(directory, 'EXPLAIN-RFC-SEED.md');
  fs.writeFileSync(info, '# info\n');
  const sections = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };
  fs.writeFileSync(explain, `<!-- explain-seed:facts ${JSON.stringify({ sections })} -->\n`);

  const stages = stageProgressOf({ info, explain }, {});
  assert.ok(Math.abs(stages.explain - 1) < 1e-12);
  assert.equal(countFactSectionsIn(explain), 0);
  assert.equal(countFactSectionsIn(fs.readFileSync(explain, 'utf8')), 7);

  const zeroSections = path.join(directory, 'EXPLAIN-RFC-SEED.empty.md');
  fs.writeFileSync(zeroSections, '<!-- explain-seed:facts {"sections":{}} -->\n');
  assert.equal(stageProgressOf({ info, explain: zeroSections }, {}).explain, 0.7);
});

test('C010: progressAt equals the animation state and never mutates the model', () => {
  const packages = withPackageCount(2).packages;
  const model = makeModel({ packages, events: eventsForEveryStage(packages) });
  const frames = buildFrames(model, { frames: 8000 });

  for (const timestamp of [INITIAL_TIME - 1, INITIAL_TIME, INITIAL_TIME + 1500, INITIAL_TIME + 4500, INITIAL_TIME + 20000]) {
    const built = buildTimeline(model);
    const state = createFrameState(model, built);
    let lastIndex = -1;
    built.timeline.forEach((event, index) => { if (event.evidenceT <= timestamp) lastIndex = index; });
    for (let index = 0; index <= lastIndex; index += 1) applyEvent(state, built.timeline[index]);
    assert.equal(progressAt(model, timestamp), frameFromState(state, model, 0).overallProgress);
  }

  const before = JSON.stringify(model);
  progressAt(model, INITIAL_TIME + 1500);
  assert.equal(JSON.stringify(model), before);
});

test('C007: the displayed stage never decreases across frames', () => {
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
