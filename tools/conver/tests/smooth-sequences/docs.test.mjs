// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
test('the command document names its entry point, reports and repair surface', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  assert.match(command, /run\.mjs/);
  assert.match(command, /SMOOTH-SEQUENCES\.json/);
  assert.match(command, /SMOOTH-SEQUENCES\.md/);
  assert.match(command, /SMOOTH-SEQUENCES-RULES\.json/);
  assert.match(command, /withheld/);
  assert.match(command, /RFC\.md/);
  assert.match(command, /OBLIGATION\.json/);
});

test('the upstream command documents name the new gates', () => {
  const grill = readFileSync('.claude/commands/grill-me-for-rfc.md', 'utf8');
  assert.match(grill, /check-contribution-completeness\.js/);
  const educe = readFileSync('.claude/commands/educe-sequences.md', 'utf8');
  assert.match(educe, /schema_version 3|v3/i);
});
