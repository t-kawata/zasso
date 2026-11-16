// PX-433 @verifies C001
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  BACKFILL_FILE_NAME,
  BACKFILL_SOURCES,
  buildBackfillRecords,
  collectBackfillEvidence,
  readBackfillFile,
  writeBackfillFile,
} from '../../.claude/scripts/conver/progress-gif/backfill.js';
import { mergeHistoryRecords } from '../../.claude/scripts/conver/progress-gif/history.js';
import { main as backfillMain } from '../../.claude/scripts/conver/backfill-history.js';
import { analyzeWorkspace } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { writeWorkspace } from './fixtures.mjs';

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function gitWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px433-git-'));
  execFileSync('git', ['init'], { cwd: root });
  fs.writeFileSync(path.join(root, 'EXPLAIN-RFC-SEED.md'), 'facts\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: root });
  const identity = {
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_AUTHOR_DATE: '2026-11-02T00:00:00.000Z',
    GIT_COMMITTER_DATE: '2026-11-02T00:00:00.000Z',
  };
  execFileSync('git', ['commit', '-m', 'seed'], { cwd: root, env: { ...process.env, ...identity } });
  return root;
}

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function historyRecord(overrides = {}) {
  return {
    v: 1,
    runId: 'run-1',
    event: 'finish',
    command: 'graphify-rfc',
    stage: 'graphify',
    packageId: 'pkg-1',
    at: '2026-11-07T12:30:54.038Z',
    status: 'COMPLETE',
    addedTicketKeys: [],
    ...overrides,
  };
}

test('C001: buildBackfillRecords is deterministic and provenance-labelled', () => {
  const evidence = {
    history: [historyRecord()],
    status: [{ stage: 'grill', packageId: 'pkg-1', at: '2026-11-06T05:07:13.480Z', evidenceKey: 'pkg-1/Status.json' }],
    tickets: [{ stage: 'make', packageId: 'pkg-1', ticketKey: 'PX-1', at: '2026-11-11T10:00:00.000Z', evidenceKey: 'pkg-1/Tickets.json' }],
    git: [{ stage: 'explain', packageId: 'pkg-1', at: '2026-11-02T00:00:00.000Z', evidenceKey: 'pkg-1/EXPLAIN-RFC-SEED.md' }],
  };
  const first = buildBackfillRecords(evidence);
  const second = buildBackfillRecords(evidence);

  assert.deepEqual(first, second);
  assert.equal(first.every((record) => BACKFILL_SOURCES.includes(record.source)), true);
  assert.equal(first.some((record) => record.source === 'mtime'), false);
  const ids = first.map((record) => record.backfillId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(first.find((record) => record.source === 'git').confidence, 'approx');
  assert.equal(first.find((record) => record.source === 'history').confidence, 'exact');
});

test('C001: history wins over a status duplicate for the same stage and package', () => {
  const at = '2026-11-07T12:30:54.038Z';
  const evidence = {
    history: [historyRecord({ at })],
    status: [{ stage: 'graphify', packageId: 'pkg-1', at, evidenceKey: 'pkg-1/RFC-GRAPHIFY-Status.json' }],
    tickets: [],
    git: [],
  };
  const records = buildBackfillRecords(evidence);
  const graphify = records.filter((record) => record.stage === 'graphify' && record.packageId === 'pkg-1');

  assert.equal(graphify.length, 1);
  assert.equal(graphify[0].source, 'history');
  assert.equal(graphify[0].confidence, 'exact');
});

test('C001: writeBackfillFile is idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px433-backfill-'));
  const records = buildBackfillRecords({
    history: [], status: [], tickets: [],
    git: [{ stage: 'explain', packageId: 'pkg-1', at: '2026-11-02T00:00:00.000Z', evidenceKey: 'pkg-1/EXPLAIN-RFC-SEED.md' }],
  });

  writeBackfillFile(root, records);
  writeBackfillFile(root, records);
  const read = readBackfillFile(path.join(root, BACKFILL_FILE_NAME));

  assert.equal(read.records.length, records.length);
  assert.equal(read.warnings.length, 0);
  assert.equal(read.records[0].backfillId, records[0].backfillId);
});

test('C001: collectBackfillEvidence reads git first commit and never mtime', () => {
  const root = gitWorkspace();
  const evidence = collectBackfillEvidence({
    root,
    packages: [{ id: 'pkg-1', path: '.', obligations: { total: 1 }, tickets: { total: 1 } }],
    historyRecords: [],
  });
  const gitExplain = evidence.git.find((entry) => entry.stage === 'explain');

  assert.equal(gitExplain.packageId, 'pkg-1');
  assert.equal(gitExplain.at, '2026-11-02T00:00:00.000Z');
  assert.equal(evidence.history.some((record) => record.source === 'mtime'), false);
});

test('C001: collectBackfillEvidence warns when git is unavailable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px433-nogit-'));
  fs.writeFileSync(path.join(root, 'EXPLAIN-RFC-SEED.md'), 'x', 'utf8');
  const evidence = collectBackfillEvidence({
    root,
    packages: [{ id: 'pkg-1', path: '.', obligations: { total: 1 }, tickets: { total: 1 } }],
    historyRecords: [],
  });

  assert.equal(evidence.git.length, 0);
  assert.equal(evidence.warnings.some((warning) => warning.startsWith('[backfill]')), true);
});

test('C001: mergeHistoryRecords keeps the live record over a backfill duplicate', () => {
  const live = historyRecord({ backfillId: 'same-key', source: 'history' });
  const backfill = historyRecord({ runId: 'backfill-run', backfillId: 'same-key', source: 'status' });
  const merged = mergeHistoryRecords([live], [backfill]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'history');
});


test('C001: apply writes a ledger that the history-only renderer consumes', () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/Tickets.json': { phases: [] },
      'pkg-1/Status.json': { state: 'DONE', completedAt: '2026-11-06T05:07:13.480Z', updatedAt: '2026-11-06T05:07:13.480Z' },
      'pkg-1/EXPLAIN-RFC-SEED.md': 'facts\n',
    },
  });
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  const identity = {
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_AUTHOR_DATE: '2026-11-02T00:00:00.000Z',
    GIT_COMMITTER_DATE: '2026-11-02T00:00:00.000Z',
  };
  execFileSync('git', ['commit', '-m', 'seed'], { cwd: root, env: { ...process.env, ...identity } });

  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    backfillMain([`--root=${root}`, '--apply']);
  } finally {
    process.stdout.write = originalWrite;
  }
  const model = analyzeWorkspace(root, { sourceScan: false });
  const explain = model.events.find((event) => event.stage === 'explain' && event.packageId === 'pkg-1');
  const grill = model.events.find((event) => event.stage === 'grill' && event.packageId === 'pkg-1');

  assert.equal(model.timelineMode, 'history');
  assert.ok(model.backfillCount > 0);
  assert.equal(explain.t, Date.parse('2026-11-02T00:00:00.000Z'));
  assert.equal(grill.t, Date.parse('2026-11-06T05:07:13.480Z'));
});
