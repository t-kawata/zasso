// PX-381 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006 @verifies C007 @verifies C009
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  STAGE_ORDER,
  applyEvent,
  buildFrames,
  buildTimeline,
  createFrameState,
  frameFromState,
  progressAt,
  stageEventsOf,
} from '../../.claude/scripts/conver/progress-gif/loop.js';
import { INITIAL_TIME, makeModel, packageModel, stageEvent, withPackageCount } from './models.mjs';

const DAY = 24 * 60 * 60 * 1000;

/** A trusted stage event carrying an explicit evidence source. */
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
function eventAt(iso, stage, packageId, timeSource = 'status', inc = 1) {
  return { ...stageEvent(stage, Date.parse(iso), packageId, inc), timeSource };
}

/** Every stage once, with evidence times deliberately inverted. */
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
function shuffledModel() {
  const pkg = packageModel({ id: 'pkg-1' });
  const events = STAGE_ORDER.map((stage, index) => eventAt(
    new Date(INITIAL_TIME + (STAGE_ORDER.length - index) * 1000).toISOString(),
    stage,
    stage === 'educe' || stage === 'smooth' ? null : pkg.id,
    'status',
  ));
  return makeModel({ packages: [pkg], events });
}

/** The shape embedded in gaia progress-gif/20261106104748.html at a test scale. */
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
function gaiaArtifactShape(grillCount = 3487) {
  const pkg = packageModel({ id: 'pkg-1' });
  const events = [
    eventAt('2026-10-26T00:35:57Z', 'educe', null, 'status'),
    eventAt('2026-11-05T00:48:55Z', 'explain', pkg.id, 'artifact', 0.5),
    eventAt('2026-10-29T03:49:34Z', 'smooth', null, 'status'),
    eventAt('2026-10-28T08:39:16Z', 'graphify', pkg.id, 'status'),
    eventAt('2026-10-29T12:48:04Z', 'boundify', pkg.id, 'status'),
    eventAt('2026-11-02T06:25:59Z', 'split', pkg.id, 'status'),
    eventAt('2026-11-04T23:57:42Z', 'drill', pkg.id, 'status'),
  ];
  const start = Date.parse('2026-10-05T23:44:46Z');
  const span = Date.parse('2026-11-06T01:42:22Z') - start;
  for (let index = 0; index < grillCount; index += 1) {
    events.push({
      ...stageEvent('grill', start + Math.round((index / grillCount) * span), pkg.id, 0.9 / grillCount),
      timeSource: 'status',
    });
  }
  return makeModel({ packages: [pkg], events, initialT: Date.parse('2026-10-26T00:35:54Z') });
}

/** The fields stageEventsOf reads from one package artifact set. */
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
function baseArtifacts(overrides = {}) {
  return {
    explain: null,
    info: null,
    status: null,
    designTree: null,
    designTreePath: null,
    historyRecords: [],
    historyPath: null,
    tickets: null,
    ticketsPath: null,
    malfeasance: null,
    manifests: [],
    omissions: [],
    graphStatus: null,
    graphPath: null,
    boundifyStatus: null,
    dirs: null,
    dirsPath: null,
    splitStatus: null,
    crystalize: null,
    crystalizePath: null,
    drillStatus: null,
    drillStatusPath: null,
    unresolvedStubs: 0,
    ...overrides,
  };
}

/** The workspace fields stageEventsOf reads. */
// [::TICKET::] PX-381 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-381 --for-spec --no-implementation-order`.
function baseWorkspace(initialT) {
  return {
    initialT,
    educeStatus: null,
    smoothStatus: null,
    sequencesPath: null,
    smoothStatusPath: null,
    historyRecords: [],
    smoothCertificate: null,
  };
}

test('C001: shuffled, inverted evidence times still play the fixed stage order', () => {
  const frames = buildFrames(shuffledModel(), { frames: 240 });
  const seen = [...new Set(frames.map((frame) => frame.stage))];
  assert.deepEqual(seen, STAGE_ORDER);
  const indexes = frames.map((frame) => STAGE_ORDER.indexOf(frame.stage));
  assert.ok(indexes.every((value, index) => index === 0 || value >= indexes[index - 1]));
});

test('C001: the gaia artifact shape plays eight stages and keeps SMOOTH', () => {
  const frames = buildFrames(gaiaArtifactShape(), { frames: 200 });
  const transitions = frames
    .filter((frame, index) => index === 0 || frame.stage !== frames[index - 1].stage)
    .map((frame) => frame.stage);
  assert.deepEqual(transitions, [
    'educe', 'explain', 'grill', 'smooth', 'graphify', 'boundify', 'split', 'drill',
  ]);
  assert.ok(frames.filter((frame) => frame.stage === 'smooth').length > 0);
});

test('C001: a later educe re-run still displays EDUCE first and once', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [
      eventAt('2026-11-01T00:00:01Z', 'explain', pkg.id),
      eventAt('2026-11-01T00:00:02Z', 'grill', pkg.id),
      eventAt('2026-11-01T00:00:09Z', 'educe', null),
    ],
  });
  const seen = [...new Set(buildFrames(model, { frames: 120 }).map((frame) => frame.stage))];
  assert.deepEqual(seen, ['educe', 'explain', 'grill']);
});

test('C001: make before split and review after drill keep the workflow order', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [
      eventAt('2026-11-01T00:00:05Z', 'split', pkg.id),
      eventAt('2026-11-01T00:00:03Z', 'make', pkg.id),
      eventAt('2026-11-01T00:00:06Z', 'review', pkg.id),
      eventAt('2026-11-01T00:00:04Z', 'drill', pkg.id),
    ],
  });
  const seen = [...new Set(buildFrames(model, { frames: 160 }).map((frame) => frame.stage))];
  assert.deepEqual(seen, ['split', 'make', 'review', 'drill']);
});

test('C001: a grill tail after drill still keeps smooth before graphify', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const model = makeModel({
    packages: [pkg],
    events: [
      eventAt('2026-11-01T00:00:02Z', 'grill', pkg.id),
      eventAt('2026-11-01T00:00:09Z', 'grill', pkg.id),
      eventAt('2026-11-01T00:00:03Z', 'smooth', null),
      eventAt('2026-11-01T00:00:04Z', 'graphify', pkg.id),
      eventAt('2026-11-01T00:00:05Z', 'drill', pkg.id),
    ],
  });
  const seen = [...new Set(buildFrames(model, { frames: 160 }).map((frame) => frame.stage))];
  assert.deepEqual(seen, ['grill', 'smooth', 'graphify', 'drill']);
});

test('C002: buildTimeline and progressAt never rewrite evidence times', () => {
  const model = shuffledModel();
  const before = model.events.map((event) => event.t);
  const built = buildTimeline(model);
  const progress = progressAt(model, INITIAL_TIME + 8000);
  assert.deepEqual(model.events.map((event) => event.t), before);
  assert.ok(Number.isFinite(progress) && progress >= 0 && progress <= 1);
  assert.ok(built.timeline.every((event) => Number.isFinite(event.evidenceT)));
});

test('C003: display dates are monotonic and an untrusted explain yields to the next trusted stage', () => {
  const built = buildTimeline(gaiaArtifactShape(20));
  const dates = STAGE_ORDER
    .filter((stage) => built.displayDate.has(stage))
    .map((stage) => built.displayDate.get(stage));
  assert.ok(dates.every((value, index) => index === 0 || value >= dates[index - 1]));
  assert.equal(
    built.displayDate.get('smooth'),
    Date.parse('2026-10-29T03:49:34Z'),
  );
  assert.ok(built.displayDate.get('explain') <= Date.parse('2026-10-26T00:35:57Z'));
  assert.ok(built.displayDate.get('graphify') <= Date.parse('2026-10-29T03:49:34Z'));
});

test('C004: an explain artifact older than initialT is kept with a warning', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px381-old-'));
  const explainPath = path.join(directory, 'EXPLAIN-RFC-SEED.md');
  fs.writeFileSync(explainPath, '## 1\n## 2\n## 3\n');
  fs.utimesSync(explainPath, new Date('2026-09-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'));
  const initialT = Date.parse('2026-11-01T00:00:00Z');
  const warnings = [];
  const events = stageEventsOf(
    { id: 'pkg-1', name: 'pkg-1', dir: directory },
    baseArtifacts({ explain: explainPath }),
    baseWorkspace(initialT),
    warnings,
  );
  const explain = events.filter((event) => event.stage === 'explain');
  assert.equal(explain.length, 1);
  assert.equal(explain[0].t, initialT);
  assert.match(warnings.join('\n'), /precedes the model origin/);
});

test('C005: a date-only resolvedAt is never used as an instant', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px381-day-'));
  const designTreePath = path.join(directory, 'DesignTree.json');
  fs.writeFileSync(designTreePath, '{}');
  fs.utimesSync(designTreePath, new Date('2026-11-02T00:00:00Z'), new Date('2026-11-02T00:00:00Z'));
  const warnings = [];
  const events = stageEventsOf(
    { id: 'pkg-1', name: 'pkg-1', dir: directory },
    baseArtifacts({
      status: { state: 'DONE' },
      designTreePath,
      designTree: { nodes: [{ status: 'resolved', questions: [{ resolvedAt: '2026-11-05' }] }] },
    }),
    baseWorkspace(Date.parse('2026-11-01T00:00:00Z')),
    warnings,
  );
  assert.equal(events.some((event) => event.prec === 'day'), false);
  assert.match(warnings.join('\n'), /day precision/);
});

test('C006: a status beyond analysisTime plus 24 hours warns and clamps the display', () => {
  const pkg = packageModel({ id: 'pkg-1' });
  const analysisTime = Date.parse('2026-11-06T00:00:00Z');
  const model = makeModel({
    packages: [pkg],
    analysisTime,
    events: [eventAt('2035-01-01T00:00:00Z', 'drill', pkg.id)],
  });
  const built = buildTimeline(model);
  assert.ok(built.displayDate.get('drill') <= analysisTime + DAY);
  assert.match(built.warnings.join('\n'), /future timestamp/);
  assert.equal(buildFrames(model, { frames: 60 }).at(-1).stage, 'drill');
});

test('C007: progressAt applies every event at or before the stamp and nothing after it', () => {
  const model = gaiaArtifactShape(40);
  const built = buildTimeline(model);
  const stamp = Date.parse('2026-10-29T12:00:00Z');
  const state = createFrameState(model, built);
  for (const event of built.timeline) {
    if (event.evidenceT <= stamp) applyEvent(state, event);
  }
  const expected = frameFromState(state, model, 0).overallProgress;
  assert.equal(progressAt(model, stamp), expected);
  assert.ok(expected >= 0 && expected <= 1);
});

test('C009: the three script trees carry byte-identical progress-gif sources', () => {
  const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);
  for (const name of ['loop.js', 'layout.js', 'engine.js', 'fonts.js', 'html.js', 'viewer.js']) {
    const relative = path.join('progress-gif', name);
    const source = fs.readFileSync(path.join(projectRoot, '.claude/scripts/conver', relative));
    const rootCopy = fs.readFileSync(path.join(projectRoot, '../../.claude/scripts/conver', relative));
    const siprsCopy = fs.readFileSync(path.join(projectRoot, '../../crates/siprs/.claude/scripts/conver', relative));
    assert.deepEqual(source, rootCopy, `root mirror differs for ${name}`);
    assert.deepEqual(source, siprsCopy, `siprs mirror differs for ${name}`);
  }
});
