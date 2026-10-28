// [::TICKET::] PX-334 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-334 --for-spec --no-implementation-order`.
// The split command is argument-free: the source is the package canonical RFC.md and
// every other fixed artifact is derived by the scripts from the invocation directory.
// @verifies C003
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const COMMAND_PATH = join(__dirname, '../../.claude/commands/split-to-tickets.md');

test('C003 split takes no argument and fixes RFC.md as its only input', () => {
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.equal(/^argument-hint:/m.test(content), false, 'the frontmatter must not advertise an argument');
  assert.match(content, /^# \/split-to-tickets$/m, 'the title stays argument-free');
  assert.match(content, /DOC_PATH="RFC\.md"/, 'the source is the canonical RFC');
  assert.match(content, /UNEXPECTED_ARGUMENT/, 'a non-empty argument list is refused');
  assert.match(content, /MISSING_RFC/, 'a missing canonical RFC is a named stop');
  assert.match(content, /MISSING_GRAPH/, 'a missing graph is a named stop');
  assert.match(content, /MISSING_DIRS_TREE/, 'a missing Dirs-Tree is a named stop');
});

test('C003 split passes no fixed canonical path to its scripts', () => {
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.equal(/--tickets="\$TICKETS_PATH"/.test(content), false);
  assert.equal(/--status="\$STATUS_PATH"/.test(content), false);
  assert.equal(/--graph="\$GRAPH_PATH"/.test(content), false);
  assert.equal(/--view="\$DOC_DIR\/SEQUENCES\.json"/.test(content), false);
});

test('C003 the gate literals the split preflight names are preserved', () => {
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.match(content, /MISSING_SMOOTH_RECEIPT/);
  assert.match(content, /STALE_SMOOTH_VERDICT/);
  assert.match(content, /project-step-contracts\.js --mode=verify/);
});
