// PX-366 @verifies C001 @verifies C002
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { writeWorkspace } from './fixtures.mjs';
import {
  HISTORY_FILE_NAME,
  appendHistoryRecord,
  readHistoryFile,
} from '../../.claude/scripts/conver/progress-gif/history.js';
import {
  resolveWorkspaceRoot,
  resolvePackageId,
  recordStart,
  recordFinish,
  withRunHistory,
} from '../../.claude/scripts/conver/run-history.js';

const AT_START = '2026-11-04T12:00:00.000Z';
const AT_FINISH = '2026-11-04T12:01:00.000Z';

/** One package whose directory exists, so the history path can be written. */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function createRoot() {
  return writeWorkspace({
    packages: [{ id: 'pkg-1', path: 'pkg-1' }],
    files: { 'pkg-1/.keep': '' },
  });
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function startRecord(overrides = {}) {
  return {
    v: 1,
    runId: 'run-1',
    event: 'start',
    command: 'drill-rfc-down',
    stage: 'drill',
    packageId: 'pkg-1',
    at: AT_START,
    ...overrides,
  };
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function finishRecord(overrides = {}) {
  return startRecord({
    event: 'finish',
    status: 'COMPLETE',
    addedTicketKeys: ['PX-401'],
    at: AT_FINISH,
    ...overrides,
  });
}

test('C001 append: one start and one finish are readable and the duplicate event is skipped', () => {
  const root = createRoot();
  const file = path.join(root, 'pkg-1', HISTORY_FILE_NAME);

  appendHistoryRecord(path.join(root, 'pkg-1'), startRecord());
  appendHistoryRecord(path.join(root, 'pkg-1'), startRecord());
  appendHistoryRecord(path.join(root, 'pkg-1'), finishRecord());

  const { records, warnings } = readHistoryFile(file);

  assert.equal(warnings.length, 0);
  assert.equal(records.length, 2);
  assert.equal(records[0].runId, 'run-1');
  assert.equal(records[0].event, 'start');
  assert.equal(records[1].event, 'finish');
  assert.equal(records[1].status, 'COMPLETE');
  assert.deepEqual(records[1].addedTicketKeys, ['PX-401']);
});

test('C001 boundary: appending keeps every existing byte and adds one newline-terminated line', () => {
  const root = createRoot();
  const file = path.join(root, 'pkg-1', HISTORY_FILE_NAME);
  appendHistoryRecord(path.join(root, 'pkg-1'), startRecord());
  const before = fs.readFileSync(file);

  appendHistoryRecord(path.join(root, 'pkg-1'), finishRecord());
  const after = fs.readFileSync(file);

  assert.ok(after.subarray(0, before.length).equals(before));
  assert.equal(after.toString('utf8').trimEnd().split('\n').length, 2);
});

test('C002 error: a malformed line is skipped with its line number and valid records survive', () => {
  const root = createRoot();
  const file = path.join(root, 'pkg-1', HISTORY_FILE_NAME);
  fs.writeFileSync(file, [
    JSON.stringify(startRecord()),
    'not-json',
    JSON.stringify(finishRecord()),
  ].join('\n') + '\n');

  const { records, warnings } = readHistoryFile(file);

  assert.equal(records.length, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /line 2/);
  assert.doesNotThrow(() => readHistoryFile(file));
});

test('C002 error: an unknown stage is a warning, not an exception', () => {
  const root = createRoot();
  const file = path.join(root, 'pkg-1', HISTORY_FILE_NAME);
  fs.writeFileSync(file, JSON.stringify(startRecord({ stage: 'not-a-stage' })) + '\n');

  const { records, warnings } = readHistoryFile(file);

  assert.equal(records.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unknown stage/);
});

test('C001 boundary: a record over 4096 bytes is refused with a warning', () => {
  const root = createRoot();
  const huge = finishRecord({ addedTicketKeys: Array.from({ length: 500 }, (_, index) => `PX-${index}`) });

  const result = appendHistoryRecord(path.join(root, 'pkg-1'), huge);

  assert.equal(result.ok, false);
  assert.match(result.warning, /4096/);
});

test('resolveWorkspaceRoot finds the manifest above a nested package directory', () => {
  const root = createRoot();

  assert.equal(resolveWorkspaceRoot(path.join(root, 'pkg-1')), root);
  assert.equal(resolveWorkspaceRoot(root), root);
});

test('resolvePackageId matches the tree path and returns null at the workspace root', () => {
  const root = createRoot();

  assert.equal(resolvePackageId(root, path.join(root, 'pkg-1')), 'pkg-1');
  assert.equal(resolvePackageId(root, root), null);
});

test('recordFinish pairs with the latest unmatched start of the same command and package', () => {
  const root = createRoot();
  recordStart({ root, cwd: path.join(root, 'pkg-1'), command: 'drill-rfc-down', stage: 'drill' });
  recordFinish({
    root,
    cwd: path.join(root, 'pkg-1'),
    command: 'drill-rfc-down',
    stage: 'drill',
    status: 'COMPLETE',
    addedTicketKeys: ['PX-401'],
  });

  const { records } = readHistoryFile(path.join(root, 'pkg-1', HISTORY_FILE_NAME));
  const starts = records.filter((record) => record.event === 'start');
  const finishes = records.filter((record) => record.event === 'finish');

  assert.equal(starts.length, 1);
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].runId, starts[0].runId);
  assert.deepEqual(finishes[0].addedTicketKeys, ['PX-401']);
});

test('recordFinish without a start creates a standalone finish', () => {
  const root = createRoot();
  recordFinish({
    root,
    cwd: path.join(root, 'pkg-1'),
    command: 'drill-rfc-down',
    stage: 'drill',
    status: 'BLOCKED_PREREQUISITE',
  });

  const { records } = readHistoryFile(path.join(root, 'pkg-1', HISTORY_FILE_NAME));

  assert.equal(records.length, 1);
  assert.equal(records[0].event, 'finish');
  assert.equal(records[0].status, 'BLOCKED_PREREQUISITE');
});

test('recordStart never throws when the history path is not writable', () => {
  const root = createRoot();
  const historyPath = path.join(root, 'pkg-1', HISTORY_FILE_NAME);
  fs.mkdirSync(historyPath);

  const result = recordStart({
    root,
    cwd: path.join(root, 'pkg-1'),
    command: 'drill-rfc-down',
    stage: 'drill',
  });

  assert.equal(result.ok, false);
  assert.match(result.warning, /history/);
});

test('withRunHistory records one start and one COMPLETE finish around the work', async () => {
  const root = createRoot();
  const result = await withRunHistory({
    root,
    cwd: path.join(root, 'pkg-1'),
    command: 'smooth-sequences',
    stage: 'smooth',
    exitHook: false,
  }, () => 0);

  const { records } = readHistoryFile(path.join(root, 'pkg-1', HISTORY_FILE_NAME));

  assert.equal(result, 0);
  assert.equal(records.filter((record) => record.event === 'start').length, 1);
  assert.equal(records.filter((record) => record.event === 'finish')[0].status, 'COMPLETE');
});

test('withRunHistory records BLOCKED_PREREQUISITE when the work throws', async () => {
  const root = createRoot();

  await assert.rejects(
    withRunHistory({
      root,
      cwd: path.join(root, 'pkg-1'),
      command: 'smooth-sequences',
      stage: 'smooth',
      exitHook: false,
    }, () => { throw new Error('refused'); }),
    /refused/,
  );

  const { records } = readHistoryFile(path.join(root, 'pkg-1', HISTORY_FILE_NAME));

  assert.equal(records.filter((record) => record.event === 'finish')[0].status, 'BLOCKED_PREREQUISITE');
});
