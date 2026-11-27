// [::TICKET::] PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-458 --for-spec --no-implementation-order`.
'use strict';

/**
 * Document-parity tests for the command file and the repository README.
 *
 * Covers C013 (one taxonomy shared by code and document), C014 (README catalog),
 * and C015 (English-only telegraphic command document).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { REPO_ROOT } = require('./fixtures.cjs');

const criteria = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'criteria.js'
));

const COMMAND_PATH = path.join(REPO_ROOT, '.claude', 'commands', 'pickup-conver-update-candidates.md');
const README_PATH = path.join(REPO_ROOT, 'README.md');

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function readCommand() {
  return fs.readFileSync(COMMAND_PATH, 'utf8');
}

test('C013 the command document names every admission gate', () => {
  const document = readCommand();
  for (const gate of criteria.ADMISSION_GATES) {
    assert.ok(document.includes(gate.id), 'missing ' + gate.id);
  }
});

test('C013 the command document names every value category', () => {
  const document = readCommand();
  for (const category of criteria.VALUE_CATEGORIES) {
    assert.ok(document.includes(category), 'missing ' + category);
  }
});

test('C013 the command document names every exclusion code', () => {
  const document = readCommand();
  for (const exclusion of criteria.EXCLUSION_CODES) {
    assert.ok(document.includes(exclusion.id), 'missing ' + exclusion.id);
  }
});

test('C013 the command document carries the criteria version', () => {
  assert.ok(readCommand().includes(criteria.CRITERIA_VERSION));
});

test('C014 README documents the command and both ledger files', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  assert.ok(readme.includes('/pickup-conver-update-candidates'));
  assert.ok(readme.includes('CONVER-UPDATE-CANDIDATES.json'));
  assert.ok(readme.includes('CONVER-UPDATE-CANDIDATES.md'));
  assert.ok(readme.includes('criteriaVersion 1.0.0'));
});

test('C015 the command document is English-only', () => {
  assert.equal(/[ぁ-んァ-ン一-龥]/.test(readCommand()), false);
});

test('C015 the command document carries no placeholders or filler', () => {
  const document = readCommand();
  // Split the forbidden tokens so this test does not itself read as a placeholder.
  for (const token of ['TO' + 'DO', 'TB' + 'D', 'FIX' + 'ME']) {
    assert.equal(document.includes(token), false, 'found ' + token);
  }
  assert.equal(document.toLowerCase().includes('please note that'), false);
  assert.equal(document.toLowerCase().includes('in this step, we will'), false);
});

test('C015 the command document keeps the non-interactive contract and the anchors', () => {
  const document = readCommand();
  assert.equal(document.includes('NON-INTERACTIVE'), true);
  assert.equal(document.includes('printf'), true);
  assert.equal(document.includes('Language Protocol'), true);
  assert.equal(document.includes('CLAUDE_DIR'), true);
});

test('C015 the command document stays within the 120-line compression budget', () => {
  assert.equal(readCommand().split('\n').length <= 120, true);
});

test('the command frontmatter declares a description and disables model invocation', () => {
  const document = readCommand();
  assert.ok(document.startsWith('---\n'));
  assert.ok(document.includes('description:'));
  assert.ok(document.includes('disable-model-invocation: true'));
});

test('C005 the command document names the delivery commands and stdin', () => {
  const document = readCommand();
  for (const token of ['schema', '--candidate=-', '--patch=-', 'update', 'delete', 'list', 'show']) {
    assert.ok(document.includes(token), token);
  }
});
