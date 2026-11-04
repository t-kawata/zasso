// PX-370 @verifies C001 @verifies C002 @verifies C003 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { analyzeWorkspace, run } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { computePreviousProgress, SNAPSHOT_SCHEMA } from '../../.claude/scripts/conver/progress-gif/snapshot.js';
import { buildFrames, computeDensity, STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { computeLayout, formatPercent } from '../../.claude/scripts/conver/progress-gif/layout.js';
import { drawFrame } from '../../.claude/scripts/conver/progress-gif/engine.js';
import { eventsForEveryStage, makeModel, withPackageCount } from './models.mjs';
import { writeWorkspace } from './fixtures.mjs';

const PREVIOUS_STAMP = '20261101000000';
const SNAPSHOT_DIRECTORY = ['progress-gif', 'snapshots'];

/** The options run() receives from parseArgs, with no browser and no source scan. */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
function runOptions(overrides = {}) {
  return {
    open: false,
    dryRun: false,
    sourceScan: false,
    frames: 30,
    fps: 10,
    speedMs: null,
    scale: 1,
    maxBytes: 300 * 1024 * 1024,
    snapshotDir: null,
    ...overrides,
  };
}

/** A workspace whose one package produces a non-zero split stage. */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
function createGrowingWorkspace() {
  return writeWorkspace({
    packages: [{ id: 'pkg-1', name: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/Tickets.json': {
        phases: [{
          id: 0,
          tickets: [{
            id: 1,
            phaseId: 0,
            status: 'todo',
            contracts: [{ id: 'C1', sourceEdge: 'e', precondition: 'p', postcondition: 'q', invariant: 'r' }],
          }],
        }],
      },
    },
  });
}

/** Seed the newest snapshot the renderer must read. */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
function writePreviousSnapshot(root, snapshot) {
  const directory = path.join(root, ...SNAPSHOT_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${PREVIOUS_STAMP}.json`);
  fs.writeFileSync(file, typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot));
  return file;
}

// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
function zeroStages() {
  return Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0]));
}

/** A Canvas 2D stand-in that records every drawing call the renderer makes. */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
function createRecordingContext() {
  const calls = [];
  let composite = 'source-over';
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    get globalCompositeOperation() { return composite; },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    set globalCompositeOperation(value) { composite = value; calls.push(['composite', value]); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    fillRect(...args) { calls.push(['fillRect', ...args]); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    beginPath() { calls.push(['beginPath']); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    arc(...args) { calls.push(['arc', ...args]); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    closePath() { calls.push(['closePath']); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    fill() { calls.push(['fill']); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    stroke() { calls.push(['stroke']); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    fillText(text, x, y) { calls.push(['fillText', text, x, y, ctx.font, ctx.textAlign]); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    measureText(text) { return { width: String(text).length * 6 }; },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    setLineDash(values) { calls.push(['dash', ...values]); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    save() { calls.push(['save']); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    restore() { calls.push(['restore']); },
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
    createRadialGradient(...args) {
      calls.push(['gradient', ...args]);
      return { addColorStop(offset, colour) { calls.push(['stop', offset, colour]); } };
    },
  };
  return { ctx, calls };
}

/** Render one full frame so the header bar and its marker are recorded. */
// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
function renderFrameWithPrevious(previousProgress) {
  const { ctx, calls } = createRecordingContext();
  const model = makeModel({ packages: withPackageCount(2).packages, previousProgress });
  model.events = eventsForEveryStage(model.packages);
  const layout = computeLayout(model, { measureText: (text) => String(text).length * 6 });
  const frames = buildFrames(model, { frames: 60 });
  drawFrame(ctx, layout, frames.at(-1), model, { title: 'PROGRESS: demo' });
  return { model, layout, frame: frames.at(-1), calls };
}

// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
function markerCalls(calls, layout) {
  return calls.filter((call) => call[0] === 'fillRect'
    && call[3] <= 2 * layout.scale
    && call[2] < layout.header.barY
    && call[2] + call[4] > layout.header.barY + layout.header.barHeight);
}

test('C001 uses the stored overallProgress', () => {
  const snapshot = { schema: SNAPSHOT_SCHEMA, overallProgress: 0.42, packages: [] };
  assert.equal(computePreviousProgress(snapshot), 0.42);
});

test('C001 legacy fallback weights stages by max(1, obligations.total)', () => {
  const snapshot = {
    schema: SNAPSHOT_SCHEMA,
    packages: [
      { obligations: { total: 0 }, stages: zeroStages() },
      { obligations: { total: 10 }, stages: { ...zeroStages(), split: 1 } },
    ],
  };
  const globalStage = STAGE_ORDER.map((stage) => (stage === 'split' ? 10 / 11 : 0));
  assert.equal(computePreviousProgress(snapshot), computeDensity(globalStage));
});

test('C001 returns null when a snapshot has no weighted package', () => {
  assert.equal(computePreviousProgress(null), null);
  assert.equal(computePreviousProgress({ schema: SNAPSHOT_SCHEMA, packages: [] }), null);
});

test('C001 analyzeWorkspace reads the newest snapshot', () => {
  const root = createGrowingWorkspace();
  writePreviousSnapshot(root, { schema: SNAPSHOT_SCHEMA, overallProgress: 0.42, packages: [] });
  const model = analyzeWorkspace(root, { sourceScan: false });
  assert.equal(model.previousProgress, 0.42);
});

test('C001 a malformed newest snapshot yields null, a warning naming it, no frame key, and no FIND growth', () => {
  const root = createGrowingWorkspace();
  const malformed = writePreviousSnapshot(root, '{not json');
  const model = analyzeWorkspace(root, { sourceScan: false });
  assert.equal(model.previousProgress, null);
  assert.ok(model.warnings.some((warning) => warning.startsWith('[snapshot]') && warning.includes(malformed)));
  assert.equal(model.growthEvents.filter((event) => event.stage === 'find').length, 0);
  const frames = buildFrames(model, { frames: 30 });
  assert.ok(frames.every((frame) => !('previousProgress' in frame)));
});

test('C001 a corrupt newest snapshot is authoritative over an older valid one', () => {
  const root = createGrowingWorkspace();
  const directory = path.join(root, ...SNAPSHOT_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, '20261001000000.json'),
    JSON.stringify({ schema: SNAPSHOT_SCHEMA, overallProgress: 0.2, packages: [] }),
  );
  writePreviousSnapshot(root, '{not json');
  const model = analyzeWorkspace(root, { sourceScan: false });
  assert.equal(model.previousProgress, null);
  assert.equal(model.warnings.filter((warning) => warning.startsWith('[snapshot]')).length, 1);
});

test('C002 every frame carries previousProgress, legacy frames omit it, and values clamp', () => {
  const model = makeModel({ packages: withPackageCount(2).packages, previousProgress: 0.42 });
  const frames = buildFrames(model, { frames: 60 });
  assert.equal(frames.length, 60);
  assert.ok(frames.every((frame) => frame.previousProgress === 0.42));

  const legacy = buildFrames(makeModel({ packages: withPackageCount(2).packages }), { frames: 10 });
  assert.ok(legacy.every((frame) => !('previousProgress' in frame)));

  const clamped = buildFrames(makeModel({ packages: withPackageCount(1).packages, previousProgress: 1.7 }), { frames: 5 });
  assert.ok(clamped.every((frame) => frame.previousProgress === 1));
});

test('C003 the marker is drawn after the fill at the previous ratio', () => {
  const { layout, calls } = renderFrameWithPrevious(0.42);
  const markers = markerCalls(calls, layout);
  assert.equal(markers.length, 1, 'previous boundary marker missing');
  const [marker] = markers;
  const centreX = marker[1] + marker[3] / 2;
  assert.ok(Math.abs(centreX - (layout.header.barX + layout.header.barWidth * 0.42)) <= 1);

  const fillIndex = calls.findIndex((call) => call[0] === 'fillRect'
    && call[2] === layout.header.barY
    && call[4] === layout.header.barHeight
    && call[3] > 0);
  assert.ok(calls.indexOf(marker) > fillIndex);
});

test('C003 zero draws no marker and values above one clamp to the bar edge', () => {
  const zero = renderFrameWithPrevious(0);
  assert.equal(markerCalls(zero.calls, zero.layout).length, 0);

  const clamped = renderFrameWithPrevious(1.7);
  const markers = markerCalls(clamped.calls, clamped.layout);
  assert.equal(markers.length, 1);
  assert.ok(markers[0][1] + markers[0][3] <= clamped.layout.header.barX + clamped.layout.header.barWidth + 1e-9);
});

test('C003 the marker does not change the fill width, percent text, or overallProgress', () => {
  const withMarker = renderFrameWithPrevious(0.42);
  const withoutMarker = renderFrameWithPrevious(undefined);
  assert.equal(withMarker.frame.overallProgress, withoutMarker.frame.overallProgress);
  assert.equal(markerCalls(withoutMarker.calls, withoutMarker.layout).length, 0);

  const fillWidth = (calls) => calls
    .filter((call) => call[0] === 'fillRect' && call[2] === withMarker.layout.header.barY
      && call[4] === withMarker.layout.header.barHeight && call[3] > 0)
    .at(-1)[3];
  assert.ok(Math.abs(fillWidth(withMarker.calls) - fillWidth(withoutMarker.calls)) < 1e-9);
  assert.ok(withMarker.calls.some((call) => call[0] === 'fillText' && call[1] === formatPercent(withMarker.frame.overallProgress)));
});

test('C004 a non-dry run stores the final frame value', async () => {
  const root = createGrowingWorkspace();
  const result = await run(root, runOptions());
  const snapshot = JSON.parse(fs.readFileSync(result.output.snapshot, 'utf8'));
  assert.equal(snapshot.schema, SNAPSHOT_SCHEMA);
  assert.equal(snapshot.overallProgress, result.frames.at(-1).overallProgress);
  assert.ok(Array.isArray(snapshot.packages));
  assert.ok(Array.isArray(snapshot.runs));
  assert.equal(typeof snapshot.totals, 'object');
});

test('C004 --dry-run writes no snapshot', async () => {
  const root = createGrowingWorkspace();
  const result = await run(root, runOptions({ dryRun: true }));
  assert.equal(result.output, null);
  assert.equal(fs.existsSync(path.join(root, ...SNAPSHOT_DIRECTORY)), false);
});

test('two consecutive runs: the second reads the first snapshot and every frame carries it', async () => {
  const root = createGrowingWorkspace();
  const options = runOptions();
  const first = await run(root, options);
  assert.equal(first.model.previousProgress, null);
  const firstValue = JSON.parse(fs.readFileSync(first.output.snapshot, 'utf8')).overallProgress;

  const second = await run(root, options);
  assert.equal(second.model.previousProgress, firstValue);
  assert.ok(second.frames.every((frame) => frame.previousProgress === firstValue));
});

// [::TICKET::] PX-370 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-370 --for-spec --no-implementation-order`.
test('distribution: install.js copies the four changed sources unchanged', () => {
  const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-install-'));
  const installed = spawnSync(
    process.execPath,
    ['install.js', '-y', '-t', path.join(target, '.claude'), '--no-install-deps'],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(installed.status, 0, installed.stderr);
  const sources = [
    'draw-progress-gif.js',
    'progress-gif/snapshot.js',
    'progress-gif/loop.js',
    'progress-gif/engine.js',
  ];
  for (const relative of sources) {
    const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const source = path.join(projectRoot, '.claude', 'scripts', 'conver', relative);
    const copy = path.join(target, '.claude', 'scripts', 'conver', relative);
    assert.equal(digest(copy), digest(source), relative);
  }
});
