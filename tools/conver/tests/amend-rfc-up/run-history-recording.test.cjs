'use strict';

// [::TICKET::] PX-432 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-432 --for-spec --no-implementation-order`.
// PX-432 @verifies C006 @verifies C007

/**
 * PX-432 — hidden amend history recording.
 *
 * request.js records a start per changed package; report.js records a finish per
 * report package only when the outcome is terminal and successful. The history
 * writer must receive the package id explicitly so a multi-package amendment does
 * not collapse into the invocation package.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { recordAmendmentStarts } = require('../../.claude/scripts/amend-rfc-up/request.js');
const { recordAmendmentFinishes } = require('../../.claude/scripts/amend-rfc-up/report.js');
const { recordRunHistory } = require('../../.claude/scripts/lib/run-history-recorder.cjs');

// [::TICKET::] PX-432 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-432 --for-spec --no-implementation-order`.
function historyPath(root, packageId) {
  return path.join(root, packageId, '.conver-history.jsonl');
}

// [::TICKET::] PX-432 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-432 --for-spec --no-implementation-order`.
function readRecords(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

// [::TICKET::] PX-432 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-432 --for-spec --no-implementation-order`.
function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px432-amend-history-'));
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    workspace: {
      packages: [
        { id: 'pkg-1', path: 'pkg-1' },
        { id: 'pkg-2', path: 'pkg-2' },
      ],
    },
  }));
  fs.mkdirSync(path.join(root, 'pkg-1'));
  fs.mkdirSync(path.join(root, 'pkg-2'));
  return root;
}

// @verifies C007
test('C007 starts are deduplicated per changed package', () => {
  const calls = [];
  const packageIds = recordAmendmentStarts(
    { changes: [{ package: 'pkg-1' }, { package: 'pkg-1' }, { package: 'pkg-2' }, { package: null }] },
    (operation, options) => calls.push({ operation, ...options }),
  );

  assert.deepEqual(packageIds, ['pkg-1', 'pkg-2']);
  assert.deepEqual(calls.map((call) => [call.operation, call.command, call.stage, call.packageId]), [
    ['start', 'amend-rfc-up', 'amend', 'pkg-1'],
    ['start', 'amend-rfc-up', 'amend', 'pkg-2'],
  ]);
});

// @verifies C007
test('C007 DESIGN_AMENDED completes every report package', () => {
  const calls = [];
  const packageIds = recordAmendmentFinishes(
    { outcome: 'DESIGN_AMENDED', packages: { 'pkg-1': {}, 'pkg-2': {} } },
    (operation, options) => calls.push({ operation, ...options }),
  );

  assert.deepEqual(packageIds, ['pkg-1', 'pkg-2']);
  assert.deepEqual(calls.map((call) => [call.operation, call.status, call.packageId]), [
    ['finish', 'COMPLETE', 'pkg-1'],
    ['finish', 'COMPLETE', 'pkg-2'],
  ]);
});

// @verifies C007
test('C007 NO_CHANGE writes no finish and BLOCKED records a blocked finish', () => {
  const calls = [];

  assert.deepEqual(
    recordAmendmentFinishes({ outcome: 'NO_CHANGE', packages: { 'pkg-1': {} } }, (operation, options) => calls.push({ operation, ...options })),
    [],
  );
  assert.deepEqual(calls, []);

  recordAmendmentFinishes({ outcome: 'BLOCKED', packages: { 'pkg-1': {} } }, (operation, options) => calls.push({ operation, ...options }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, 'BLOCKED_PREREQUISITE');
});

// @verifies C006
test('C006 the recorder writes an amend start into the named package history', () => {
  const root = createWorkspace();
  const previous = process.cwd();
  try {
    process.chdir(path.join(root, 'pkg-1'));
    const result = recordRunHistory('start', { command: 'amend-rfc-up', stage: 'amend', packageId: 'pkg-2' });
    assert.equal(result.ok, true);
  } finally {
    process.chdir(previous);
  }

  const records = readRecords(historyPath(root, 'pkg-2'));
  assert.equal(records.length, 1);
  assert.equal(records[0].event, 'start');
  assert.equal(records[0].stage, 'amend');
  assert.equal(records[0].packageId, 'pkg-2');
  fs.rmSync(root, { recursive: true, force: true });
});

// @verifies C006
test('C006 start and finish pair in each package history', async () => {
  const { recordStart, recordFinish } = await import('../../.claude/scripts/conver/run-history.js');
  const root = createWorkspace();
  const cwd = path.join(root, 'pkg-1');
  const write = (operation, options) => (operation === 'start'
    ? recordStart({ root, cwd, ...options })
    : recordFinish({ root, cwd, ...options }));

  recordAmendmentStarts({ changes: [{ package: 'pkg-1' }, { package: 'pkg-2' }] }, write);
  recordAmendmentFinishes({ outcome: 'DESIGN_AMENDED', packages: { 'pkg-1': {}, 'pkg-2': {} } }, write);

  for (const packageId of ['pkg-1', 'pkg-2']) {
    const records = readRecords(historyPath(root, packageId));
    assert.deepEqual(records.map((record) => [record.event, record.status || '']), [
      ['start', ''],
      ['finish', 'COMPLETE'],
    ]);
    assert.ok(records.every((record) => record.stage === 'amend' && record.packageId === packageId));
  }
  fs.rmSync(root, { recursive: true, force: true });
});
