// PX-433 @verifies C006
// PX-450 @verifies C001 @verifies C002 @verifies C003 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { writeWorkspace } from './fixtures.mjs';
import { formatTimelineSection, parseArgs, run } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { STAGE_ORDER } from '../../.claude/scripts/conver/progress-gif/loop.js';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
test('C006: a previous-progress mismatch blocks HTML publication', async () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/Tickets.json': { phases: [] },
      'pkg-1/.conver-history.jsonl': JSON.stringify({
        v: 1, runId: 'run-1', event: 'finish', command: 'make-ticket', stage: 'make',
        packageId: 'pkg-1', at: '2026-11-02T00:00:00.000Z', status: 'COMPLETE', addedTicketKeys: [],
      }) + '\n',
    },
  });
  const snapshotDir = path.join(root, 'progress-gif', 'snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(path.join(snapshotDir, '20261101000000.json'), JSON.stringify({
    schema: 'conver-progress-snapshot-v1',
    overallProgress: 0.99,
    timelineHealth: { mode: 'history' },
  }));

  const result = await run(root, {
    sourceScan: false, open: false, quiet: true,
    now: Date.parse('2026-11-03T00:00:00.000Z'), frames: 20, maxBytes: 10_000_000,
  });

  assert.equal(result.output, null);
  assert.equal(result.violations.some((violation) => violation.code === 'PREVIOUS_PROGRESS_MISMATCH'), true);
});

// [::TICKET::] PX-450 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-450 --for-spec --no-implementation-order`.
const BOUNDIFY_FINISH = {
  v: 1, runId: 'boundify-1', event: 'finish', command: 'boundify-graph', stage: 'boundify',
  packageId: 'pkg-1', at: '2026-11-08T12:21:39.081Z', status: 'COMPLETE', addedTicketKeys: [],
};

/** A history-mode workspace whose artifact regressed below its reference snapshot. */
// [::TICKET::] PX-450 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-450 --for-spec --no-implementation-order`.
function regressionWorkspace({ withReference = true } = {}) {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/Tickets.json': { phases: [] },
      'pkg-1/RFC-BOUNDIFY-Status.json': { steps: { 0: 'done', 1: 'done', 2: 'running', 3: 'pending' } },
      'pkg-1/.conver-history.jsonl': `${JSON.stringify(BOUNDIFY_FINISH)}\n`,
    },
  });
  if (withReference) {
    const snapshotDir = path.join(root, 'progress-gif', 'snapshots');
    fs.mkdirSync(snapshotDir, { recursive: true });
    fs.writeFileSync(path.join(snapshotDir, '20261112000000.json'), JSON.stringify({
      schema: 'conver-progress-snapshot-v1',
      generatedAt: '2026-11-12T04:21:58.209Z',
      packages: [{ id: 'pkg-1', name: 'pkg-1', path: 'pkg-1', stages: { boundify: 1 } }],
      runs: [],
    }));
  }
  return root;
}

// [::TICKET::] PX-450 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-450 --for-spec --no-implementation-order`.
function renderOptions(overrides = {}) {
  return {
    sourceScan: false,
    open: false,
    quiet: true,
    now: Date.parse('2026-11-19T00:00:00.000Z'),
    frames: 20,
    maxBytes: 10_000_000,
    ...overrides,
  };
}

test('C001/C002: a regression renders, records the warning and formats the timeline section', async () => {
  const root = regressionWorkspace();
  const result = await run(root, renderOptions());

  assert.notEqual(result.output, null);
  assert.equal(fs.existsSync(result.output.html), true);
  assert.equal(result.model.timelineHealth.violations.includes('ARTIFACT_REGRESSION'), true);
  const section = formatTimelineSection(result.violations).join('\n');
  assert.match(section, /## timeline/);
  assert.match(section, /ARTIFACT_REGRESSION pkg-1 boundify/);
});

test('C003: strict blocks publication of a warning-only render', async () => {
  const root = regressionWorkspace();
  const result = await run(root, renderOptions({ strict: true }));

  assert.equal(result.output, null);
  const rendered = fs.readdirSync(path.join(root, 'progress-gif')).filter((name) => name.endsWith('.html'));
  assert.deepEqual(rendered, []);
});

test('C001: without a reference the final frame reaches the gated artifact', async () => {
  const root = regressionWorkspace({ withReference: false });
  const result = await run(root, renderOptions());

  const boundifyIndex = STAGE_ORDER.indexOf('boundify');
  assert.deepEqual(result.violations, []);
  assert.ok(Math.abs(result.frames.at(-1).pi[0][boundifyIndex] - 0.5) < 1e-9);
});

test('C003: parseArgs accepts strict and the compatibility flag', () => {
  assert.equal(parseArgs(['-t', '.']).strict, false);
  assert.equal(parseArgs(['-t', '.', '--strict']).strict, true);
  assert.equal(parseArgs(['-t', '.', '--allow-uncovered']).allowUncovered, true);
});
