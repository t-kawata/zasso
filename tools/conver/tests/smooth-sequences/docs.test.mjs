// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
// @verifies C004
test('the command document names its entry point, reports and repair surface', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  assert.match(command, /run\.mjs/);
  assert.match(command, /SMOOTH-SEQUENCES\.json/);
  assert.match(command, /SMOOTH-SEQUENCES\.md/);
  assert.doesNotMatch(command, /SMOOTH-SEQUENCES-RULES/);
  assert.match(command, /vocabulary/);
  assert.match(command, /derive/i);
  assert.match(command, /withheld/);
  assert.match(command, /RFC\.md/);
  assert.match(command, /OBLIGATION\.json/);
});

test('the command document fixes the workspace root to the current directory', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  assert.doesNotMatch(command, /argument-hint/);
  assert.doesNotMatch(command, /\$ARGUMENTS/);
  assert.match(command, /current directory/i);
  assert.match(command, /does not search|never walks up/i);
});

test('the upstream command documents name the new gates', () => {
  const grill = readFileSync('.claude/commands/grill-me-for-rfc.md', 'utf8');
  assert.match(grill, /check-contribution-completeness\.js/);
  const educe = readFileSync('.claude/commands/educe-sequences.md', 'utf8');
  assert.match(educe, /schema_version 3|v3/i);
});
