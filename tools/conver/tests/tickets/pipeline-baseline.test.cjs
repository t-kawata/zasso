'use strict';
// PX-397 @verifies C004

/**
 * PX-397 — the new tools must not change the existing pipeline.
 *
 * The command Steps stay available in their original order, the default gate
 * output for an unchanged fixture stays identical, and this ticket modifies no
 * existing test file.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CLAUDE_DIR = path.join(REPO_ROOT, '.claude');
const COMMAND_DIR = path.join(CLAUDE_DIR, 'commands');
const VERIFY_PLAN = path.join(CLAUDE_DIR, 'scripts/tickets/verify-plan-contracts.js');
const VERIFY_MAKE = path.join(CLAUDE_DIR, 'scripts/tickets/verify-make-contracts.js');
const { runRepairLoop } = require('../../.claude/scripts/tickets/repair-loop.js');

/** A minimal valid ticket that both gates accept. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function validTicket() {
  return {
    id: 1,
    phaseId: -1,
    status: 'planned',
    title: 'Fixture',
    contracts: [{
      id: 'C001',
      sourceEdge: 'N0001->N0002',
      precondition: 'input is valid',
      postcondition: 'result is saved',
      invariant: 'state never regresses',
    }],
    planTestCode: ['UT: translated\n\n```js\nassert.ok(true);\n```'],
    testUnit: ['UT: input is valid and result is saved and state never regresses'],
  };
}

/** Write a fixture package and return its Tickets.json path. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function writeFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-baseline-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: { source: 'fixture', generatedAt: '2026-11-09' },
    phases: [{ id: -1, name: 'PX', tickets: [validTicket()] }],
  }, null, 2) + '\n');
  return ticketsPath;
}

/** The Step ids a command Markdown file declares, in file order. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function commandStepIds(fileName) {
  const text = fs.readFileSync(path.join(COMMAND_DIR, fileName), 'utf8');
  const ids = [];
  for (const match of text.matchAll(/^#{2,4}\s+Step\s+([0-9]+(?:\.[0-9]+)?[a-z]?)/gm)) {
    ids.push('Step ' + match[1]);
  }
  return ids;
}

test('C004: every existing command Step remains in order', () => {
  const baselineSteps = {
    'start-ticket.md': [
      'Step 0', 'Step 1', 'Step 1.5', 'Step 2', 'Step 3', 'Step 4', 'Step 5',
      'Step 5a', 'Step 5b', 'Step 5c', 'Step 6', 'Step 7', 'Step 8', 'Step 9', 'Step 10',
    ],
    'review-ticket.md': [
      'Step 0', 'Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7',
      'Step 8', 'Step 9', 'Step 10', 'Step 10b', 'Step 10c', 'Step 11', 'Step 12',
    ],
    'resolve-ticket.md': [
      'Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5',
      'Step 6', 'Step 7', 'Step 8', 'Step 9', 'Step 10',
    ],
    'make-ticket.md': [
      'Step 0', 'Step 1', 'Step 1.5', 'Step 2', 'Step 3', 'Step 4', 'Step 5',
      'Step 6', 'Step 7', 'Step 8', 'Step 9', 'Step 9.5', 'Step 10',
    ],
    'plan-ticket.md': [
      'Step 0', 'Step 1', 'Step 2', 'Step 3', 'Step 3.5',
      'Step 4', 'Step 4.5', 'Step 5',
    ],
  };

  for (const [fileName, expected] of Object.entries(baselineSteps)) {
    const current = commandStepIds(fileName);
    let cursor = -1;
    for (const step of expected) {
      cursor = current.indexOf(step, cursor + 1);
      assert.ok(cursor >= 0, fileName + ' must keep ' + step + ' in order');
    }
  }
});

test('C004: a zero-finding repair loop changes no command Markdown', () => {
  const fileNames = [
    'make-ticket.md', 'plan-ticket.md', 'start-ticket.md',
    'review-ticket.md', 'resolve-ticket.md',
  ];
  const before = fileNames.map((name) => fs.readFileSync(path.join(COMMAND_DIR, name), 'utf8'));

  const result = runRepairLoop({
    runGates: () => ({ findings: [], gates: [{ name: 'noop', digest: 'd' }] }),
    applyFix: () => { throw new Error('no fix may apply'); },
  });

  assert.equal(result.completed, true);
  const after = fileNames.map((name) => fs.readFileSync(path.join(COMMAND_DIR, name), 'utf8'));
  assert.deepEqual(after, before);
});

test('C004: the default plan gate output is unchanged for a valid fixture', () => {
  const ticketsPath = writeFixture();

  const stdout = execFileSync(process.execPath, [
    VERIFY_PLAN,
    '--ticket-key=PX-1',
    '--tickets=' + ticketsPath,
  ], { encoding: 'utf8' });

  assert.equal(stdout, '{"ok":true,"ticket":"PX-1"}\n');
});

test('C004: the default make gate output is unchanged for a valid fixture', () => {
  const ticketsPath = writeFixture();

  const stdout = execFileSync(process.execPath, [
    VERIFY_MAKE,
    '--ticket-key=PX-1',
    '--tickets=' + ticketsPath,
  ], { encoding: 'utf8' });

  assert.equal(stdout, '{"ok":true,"ticket":"PX-1"}\n');
});

test('C004: this ticket modifies no existing test file', () => {
  const status = execFileSync('git', [
    'status', '--porcelain', '--', 'tools/conver/tests', '.claude/tests',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });

  const existingTestEdits = status
    .split('\n')
    .filter((line) => /^(M | M|D | D)/.test(line));

  assert.deepEqual(existingTestEdits, []);
});
