// PX-235 @verifies C001
// PX-235 @verifies C006
// PX-238 @verifies C003
// PX-238 @verifies C004
// [::TICKET::] PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-235 --for-spec --no-implementation-order`.
/**
 * The grill command file's argument surface.
 *
 * The second argument named the RFC output path, and every reader of this file had
 * to learn it. It is gone: the command takes zero or more material paths and writes
 * ./RFC.md. The assertions below are the two halves of that — the shape the file
 * declares, and the shape it must NOT have kept — plus the parts of the file this
 * edit must leave standing: the prior scan in STEP 0, the shared rule block, and a
 * destination for STEP 5 to write to.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../../question-gate/helpers/fixture-workspace.mjs';

const COMMANDS = join(REPO_ROOT, '.claude/commands');

const read = (name) => readFileSync(join(COMMANDS, `${name}.md`), 'utf8');

/** The section beginning at `from` and ending where `to` begins, or at the file's end. */
// [::TICKET::] PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-235 --for-spec --no-implementation-order`.
function section(text, from, to) {
  const start = text.indexOf(from);
  assert.notEqual(start, -1, `${from} is present`);
  const end = text.indexOf(to, start);
  return text.slice(start, end === -1 ? undefined : end);
}

/** The text between the question-gate delimiters, which three files must share. */
// [::TICKET::] PX-235 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-235 --for-spec --no-implementation-order`.
function sharedRuleBlock(text) {
  const start = text.indexOf('<!-- question-gate:begin -->');
  const end = text.indexOf('<!-- question-gate:end -->');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return text.slice(start, end);
}

test('C001 postcondition: the frontmatter declares the drill argument shape', () => {
  assert.match(read('grill-me-for-rfc'), /^argument-hint: \[<material file\|directory>\.\.\.\]$/m);
});

test('C001 postcondition: the second argument and the variables it bound are gone', () => {
  const text = read('grill-me-for-rfc');

  for (const removed of ['RFC_OUTPUT_PATH', '<rfc-output-file-path>', 'RFC-TO-OURPUT', '$RESEARCH_PATH']) {
    assert.equal(text.includes(removed), false, `${removed} no longer appears`);
  }
});

test('C001 postcondition: the variable table binds the package directory and the fixed RFC name', () => {
  const table = section(read('grill-me-for-rfc'), '## Mechanical Variable Binding', '\n---');

  assert.match(table, /\$RFC_DIR/, 'the package directory is bound');
  assert.match(table, /\$RFC_PATH[^\n]*\$RFC_DIR\/RFC\.md/, 'the RFC path is the fixed name under it');
});

test('C001 postcondition: use states the zero-or-more material form', () => {
  const usage = section(read('grill-me-for-rfc'), '## Usage', '\n---');

  assert.match(usage, /<material-file-or-dir>/);
  assert.match(usage, /zero or more|no material|none/i, 'the reader is told the argument list may be empty');
});

test('C001 postcondition: STEP 0 initialises with the package directory and the material list', () => {
  const step0 = section(read('grill-me-for-rfc'), '### STEP 0', '### STEP 1');

  assert.match(step0, /init\.js "\$RFC_DIR" \$ARGUMENTS/, 'init.js takes the package dir and the material list');
  assert.match(step0, /settle-run\.js "\$RFC_DIR" prior/, 'the prior scan is still the first thing run');
  assert.doesNotMatch(step0, /\$RESEARCH_PATH|\$RFC_OUTPUT_PATH/);
});

test('C001 postcondition: STEP 5 names the path the RFC is written to', () => {
  assert.match(section(read('grill-me-for-rfc'), '### STEP 5', '### STEP 6'), /\$RFC_PATH/);
});

test('C001 invariant: the shared rule block is byte-identical across the three command files', () => {
  const grill = sharedRuleBlock(read('grill-me-for-rfc'));

  assert.equal(grill, sharedRuleBlock(read('explain-seed')));
  assert.equal(grill, sharedRuleBlock(read('drill-rfc-down')));
  assert.equal(grill.includes('RFC-SEED.md'), false, 'the block speaks neither command’s file names');
});

test('C001 invariant: STEP 7a invokes its scripts with variables the file binds', () => {
  const step7a = section(read('grill-me-for-rfc'), '### STEP 7a', '### STEP 8');

  for (const variable of ['$TARGET_RFC', '$SCRIPT_DIR']) {
    assert.equal(step7a.includes(variable), false, `${variable} is bound nowhere in this file`);
  }
  assert.match(step7a, /"\$RFC_PATH"/, 'the boundary tools are pointed at the RFC by the name the table binds');
});

test('C006 invariant: the command file still carries what PX-234 froze', () => {
  const text = read('grill-me-for-rfc');

  assert.ok(text.includes('First-Class Rules'), 'the heading survives');
  for (const line of ['状況', '私の結論', 'すでに決まっていること', '残っている選択', '選択肢', '推奨', '推奨が覆る条件']) {
    assert.ok(text.includes(line), `the question block line ${line} is stated`);
  }
});

// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
test('C004 invariant: STEP 0 refuses a materialised canon and names the command that owns it', () => {
  const step0 = section(read('grill-me-for-rfc'), '### STEP 0', '### STEP 1');

  assert.match(step0, /canon-state\.js/, 'the guard runs before any question is drafted');
  assert.match(step0, /drill-rfc-down/, 'the refusal points at the command whose job the evolution is');
});

// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
test('C003 invariant: STEP 5 takes a copy of the RFC before it writes', () => {
  const step5 = section(read('grill-me-for-rfc'), '### STEP 5', '### STEP 6');

  assert.match(step5, /backup-rfc\.js/, 'the pre-rewrite copy is part of the step, not a suggestion');
});

// [::TICKET::] PX-238 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-238 --for-spec --no-implementation-order`.
test('PX-238 invariant: the added sentences leave the shared rule block untouched', () => {
  const grill = sharedRuleBlock(read('grill-me-for-rfc'));

  assert.equal(grill, sharedRuleBlock(read('explain-seed')));
  assert.equal(grill, sharedRuleBlock(read('drill-rfc-down')));
});
