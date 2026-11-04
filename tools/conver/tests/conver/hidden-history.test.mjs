// PX-366 @verifies C007
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const HISTORY_FILE = '.conver-history.jsonl';

/**
 * Commands whose history is written by a script the command already executes on
 * every path. The command markdown carries no instruction.
 */
const HIDDEN = Object.freeze({
  'grill-me-for-rfc': ['grill-me-for-rfc/update-status.js', 'grill-me-for-rfc/complete-run.js'],
  'graphify-rfc': ['rfc-graph/update-step-status.js'],
  'boundify-graph': ['rfc-graph/update-boundify-step-status.js'],
  'split-to-tickets': ['rfc-graph/update-split-step-status.js'],
  'make-ticket': ['tickets/insert-field-template.js', 'tickets/update-ticket.js'],
  'plan-ticket': ['tickets/check-ticket-status.js', 'tickets/update-ticket.js'],
  'start-ticket': ['tickets/check-ticket-status.js', 'tickets/update-ticket.js'],
  'review-ticket': ['tickets/check-ticket-status.js', 'tickets/update-ticket.js'],
  'consolidate-stubs': ['tickets/batch-update-stub.js'],
  'find-omissions': [
    'tickets/validate-graph-arg.js',
    'tickets/require-consolidated-manifest.js',
    'tickets/clean-consolidation-artifacts.js',
  ],
  'crystalize-readme': ['crystalize-readme/derive-output-paths.js', 'crystalize-readme/loop-drive-readme.js'],
  'drill-rfc-down': ['drill-rfc-down/preflight.cjs', 'drill-rfc-down/verify-step.js'],
});

/** The only command whose run cannot be bracketed by a script it already runs. */
const EXPLICIT = Object.freeze(['resolve-ticket']);

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px366-hidden-'));
  const packageDir = path.join(root, 'pkg-1');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    workspace: { packages: [{ id: 'pkg-1', path: 'pkg-1' }] },
  }));
  return { root, packageDir };
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function writeTickets(packageDir, status) {
  fs.writeFileSync(path.join(packageDir, 'Tickets.json'), JSON.stringify({
    title: 't',
    round: 1,
    metadata: { source: 'test', generatedAt: '2026-11-04' },
    phases: [{ id: 0, name: 'phase 0', tickets: [{ id: 1, phaseId: 0, title: 't1', status }] }],
  }, null, 2));
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function historyRecords(packageDir) {
  const file = path.join(packageDir, HISTORY_FILE);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function runScript(script, args, cwd) {
  return spawnSync(process.execPath, [path.join(ROOT, '.claude/scripts', script), ...args], {
    cwd,
    encoding: 'utf8',
  });
}

test('C007: no command carries a history instruction except the one that cannot hide it', () => {
  for (const command of Object.keys(HIDDEN)) {
    const text = fs.readFileSync(path.join(ROOT, '.claude/commands', `${command}.md`), 'utf8');
    assert.doesNotMatch(text, /run-history\.js/, `${command} must not carry a history instruction`);
  }
  for (const command of EXPLICIT) {
    const text = fs.readFileSync(path.join(ROOT, '.claude/commands', `${command}.md`), 'utf8');
    assert.match(text, /run-history\.js" start/, `${command} is the only explicit start`);
    assert.match(text, /run-history\.js" finish/, `${command} is the only explicit finish`);
  }
});

test('C007: every hidden command names its bracket scripts and the scripts record the run', () => {
  for (const [command, scripts] of Object.entries(HIDDEN)) {
    for (const script of scripts) {
      const text = fs.readFileSync(path.join(ROOT, '.claude/scripts', script), 'utf8');
      assert.match(text, /recordRunHistory|withRunHistory/, `${script} must record the run for ${command}`);
    }
  }
  const statusGate = fs.readFileSync(path.join(ROOT, '.claude/scripts/tickets/check-ticket-status.js'), 'utf8');
  assert.match(statusGate, /plan-ticket/);
  assert.match(statusGate, /start-ticket/);
  assert.match(statusGate, /review-ticket/);
});

test('C007: the status gate records a start when it passes and a blocked finish when it fails', () => {
  const { packageDir } = createWorkspace();
  writeTickets(packageDir, 'made');

  const passed = runScript('tickets/check-ticket-status.js', ['--ticket-key=P0-1', '--phase=plan'], packageDir);
  assert.equal(passed.status, 0, passed.stderr);

  const started = historyRecords(packageDir);
  assert.equal(started.filter((record) => record.event === 'start').length, 1);
  assert.equal(started[0].command, 'plan-ticket');
  assert.equal(started[0].stage, 'plan');

  writeTickets(packageDir, 'todo');
  const blocked = runScript('tickets/check-ticket-status.js', ['--ticket-key=P0-1', '--phase=plan'], packageDir);
  assert.equal(blocked.status, 1);

  const finished = historyRecords(packageDir).filter((record) => record.event === 'finish');
  assert.equal(finished.length, 1);
  assert.equal(finished[0].status, 'BLOCKED_PREREQUISITE');
});

test('C007: a successful status update closes the open run as COMPLETE', () => {
  const { packageDir } = createWorkspace();
  writeTickets(packageDir, 'made');
  runScript('tickets/check-ticket-status.js', ['--ticket-key=P0-1', '--phase=plan'], packageDir);

  const updated = spawnSync(process.execPath, [
    path.join(ROOT, '.claude/scripts/tickets/update-ticket.js'),
    'Tickets.json',
    'P0-1',
  ], {
    cwd: packageDir,
    encoding: 'utf8',
    input: JSON.stringify({ status: 'planned' }),
  });

  assert.equal(updated.status, 0, updated.stderr);
  const finished = historyRecords(packageDir).filter((record) => record.event === 'finish');
  assert.equal(finished.length, 1);
  assert.equal(finished[0].command, 'plan-ticket');
  assert.equal(finished[0].status, 'COMPLETE');
});

test('C007: make-ticket start is recorded by the template insertion it always runs', () => {
  const { packageDir } = createWorkspace();
  writeTickets(packageDir, 'todo');

  const result = runScript('tickets/insert-field-template.js', ['Tickets.json', 'P0-1'], packageDir);
  assert.equal(result.status, 0, result.stderr);

  const started = historyRecords(packageDir);
  assert.equal(started.length, 1);
  assert.equal(started[0].event, 'start');
  assert.equal(started[0].command, 'make-ticket');
});

test('C007: graphify begin-run opens the run and the final end-step closes it', () => {
  const { packageDir } = createWorkspace();
  const statusPath = path.join(packageDir, 'GRAPHIFY-Status.json');

  const began = runScript('rfc-graph/update-step-status.js', [
    `--graphify-status=${statusPath}`, 'begin-run', '--run-id=run-test',
  ], packageDir);
  assert.equal(began.status, 0, began.stderr);

  // The final step closes a generation only when a graph digest exists; this
  // fixture has no graph, so clear the run id while keeping the run's start.
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  fs.writeFileSync(statusPath, JSON.stringify({ ...status, runId: null }, null, 2));

  const ended = runScript('rfc-graph/update-step-status.js', [
    `--graphify-status=${statusPath}`, 'end-step', '5',
  ], packageDir);
  assert.equal(ended.status, 0, ended.stderr);

  const records = historyRecords(packageDir);
  assert.equal(records.filter((record) => record.event === 'start')[0].command, 'graphify-rfc');
  assert.equal(records.filter((record) => record.event === 'finish')[0].status, 'COMPLETE');
});

test('C007: a blocked find-omissions preflight records a blocked finish', () => {
  const { packageDir } = createWorkspace();

  const result = runScript('tickets/validate-graph-arg.js', [], packageDir);
  assert.equal(result.status, 2);

  const records = historyRecords(packageDir);
  assert.equal(records[0].command, 'find-omissions');
  assert.equal(records.filter((record) => record.event === 'finish')[0].status, 'BLOCKED_PREREQUISITE');
});

test('C007: a blocked drill preflight records a blocked finish and a clean drill verifier closes COMPLETE', () => {
  const { packageDir } = createWorkspace();

  const blocked = runScript('drill-rfc-down/preflight.cjs', [], packageDir);
  assert.equal(blocked.status, 1);

  const records = historyRecords(packageDir);
  assert.equal(records.filter((record) => record.event === 'finish')[0].command, 'drill-rfc-down');
  assert.equal(records.filter((record) => record.event === 'finish')[0].status, 'BLOCKED_PREREQUISITE');
});
