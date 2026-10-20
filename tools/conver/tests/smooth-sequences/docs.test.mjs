// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
// @verifies C004
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
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
  assert.match(command, /artifact\.spec\.path/);
  assert.match(command, /DECISIONS\.json/);
});

// @verifies C006
test('the command body is Prepare, Repair loop and Complete, with the checks under Reference', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  const prepare = command.indexOf('### Step 0 — Prepare');
  const loop = command.indexOf('### Step 1 — Repair loop');
  const complete = command.indexOf('### Step 2 — Complete');
  const reference = command.indexOf('## Reference');
  assert.ok(prepare > -1, 'Prepare heading');
  assert.ok(loop > prepare, 'loop after prepare');
  assert.ok(complete > loop, 'complete after loop');
  assert.ok(reference > complete, 'reference after complete');
  assert.doesNotMatch(command, /### Step 1 — Run Layer A/);
  assert.doesNotMatch(command, /### Step 5 — Final gate/);
});

// @verifies C006
test('the command makes a fresh exit 0 the loop sole exit and exit 1 not completion', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  assert.match(command, /exit 0 only when/i);
  assert.match(command, /exit 1 is an input|not completion/i);
  assert.match(command, /persisted/);
  assert.match(command, /never hand-edit|never edit a generated file|not hand-edited/i);
});

test('the command documents the regeneration transaction operating guide', () => {
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  assert.match(command, /Regeneration transaction — operating guide/);
  assert.match(command, /--allocate-decisions/);
  assert.match(command, /--tree-decisions/);
  assert.match(command, /educe-pending/);
  assert.match(command, /CANDIDATE_CHANGED/);
  assert.match(command, /STAGING_CHANGED/);
  assert.match(command, /judgment-required/);
  assert.match(command, /recover/);
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
