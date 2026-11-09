'use strict';
// PX-399 @verifies C005

/**
 * PX-399 — the wiring is additive.
 *
 * Every existing command Step remains in order, the three commands name the
 * reverify path, and Case B and numeric-phase tickets keep their idle flow.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { runReverify } = require('../../.claude/scripts/tickets/reverify-ticket.js');
const { parseAnnotationTicketKeys } = require('../../.claude/scripts/tickets/discover-changed-tickets.js');
const { cleanTicket, documentWith } = require('./fixtures/reverify-fixtures.cjs');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CLAUDE_DIR = path.resolve(__dirname, '../..', '.claude');
const COMMAND_DIR = path.join(CLAUDE_DIR, 'commands');

/** The Step ids a command Markdown file declares, in file order. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function commandStepIds(fileName) {
  const text = fs.readFileSync(path.join(COMMAND_DIR, fileName), 'utf8');
  const ids = [];
  for (const match of text.matchAll(/^#{2,4}\s+Step\s+([0-9]+(?:\.[0-9]+)?[a-z]?)/gm)) {
    ids.push('Step ' + match[1]);
  }
  return ids;
}

/** Read a command Markdown file. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function readCommand(fileName) {
  return fs.readFileSync(path.join(COMMAND_DIR, fileName), 'utf8');
}

test('C005: every existing start, review and resolve Step remains in order', () => {
  const baseline = {
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
  };

  for (const [fileName, expected] of Object.entries(baseline)) {
    const current = commandStepIds(fileName);
    let cursor = -1;
    for (const step of expected) {
      cursor = current.indexOf(step, cursor + 1);
      assert.ok(cursor >= 0, fileName + ' must keep ' + step + ' in order');
    }
  }
});

test('C005: the three commands name the reverify path', () => {
  assert.match(readCommand('start-ticket.md'), /reverify-ticket\.js/);
  assert.match(readCommand('review-ticket.md'), /reverify-ticket\.js/);
  assert.match(readCommand('resolve-ticket.md'), /reverify-ticket\.js/);
  assert.match(readCommand('resolve-ticket.md'), /discover-changed-tickets\.js/);
  assert.match(readCommand('resolve-ticket.md'), /REVIEWED_TICKET_STALE/);
});

test('C005: Case B and numeric-phase tickets produce the same idle result', () => {
  const caseB = runReverify({
    ticketKey: 'PX-1',
    ticketsPath: 'Tickets.json',
    ticketsDocument: documentWith(cleanTicket()),
    changedFiles: [],
  });
  assert.equal(caseB.plan.count, 0);

  const numericTicket = cleanTicket({ id: 1, phaseId: 0 });
  const numeric = runReverify({
    ticketKey: 'P0-1',
    ticketsPath: 'Tickets.json',
    ticketsDocument: documentWith(numericTicket),
    changedFiles: [],
  });
  assert.equal(numeric.plan.count, 0);
  assert.deepEqual(
    parseAnnotationTicketKeys('// [::TICKET::] P0-1 changes. Details: node ...'),
    ['P0-1'],
  );
});

test('C005: this ticket modifies no existing test file', () => {
  const status = execFileSync('git', [
    'status', '--porcelain', '--', 'tools/conver/tests', '.claude/tests',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });

  const edits = status
    .split('\n')
    .filter((line) => /^(M | M|D | D)/.test(line));

  assert.deepEqual(edits, []);
});
