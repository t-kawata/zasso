// [::TICKET::] PX-280 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-280 --for-spec --no-implementation-order`.
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
test('the command body is Prepare, a three-branch repair loop and Complete, with no bottom Reference', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  const prepare = command.indexOf('### Step 0 — Prepare');
  const loop = command.indexOf('### Step 1 — Repair loop');
  const inPlace = command.indexOf('#### Step 1a');
  const regeneration = command.indexOf('#### Step 1b');
  const judgment = command.indexOf('#### Step 1c');
  const complete = command.indexOf('### Step 2 — Complete');
  const appendix = command.indexOf('## Appendix A');
  assert.ok(prepare > -1, 'Prepare heading');
  assert.ok(loop > prepare, 'loop after prepare');
  assert.ok(inPlace > loop, 'in-place branch after the loop heading');
  assert.ok(regeneration > inPlace, 'regeneration branch after in-place');
  assert.ok(judgment > regeneration, 'judgment branch after regeneration');
  assert.ok(complete > judgment, 'complete after the loop');
  assert.ok(appendix > complete, 'appendix after complete');
  assert.doesNotMatch(command, /^## Reference/m);
  assert.doesNotMatch(command, /Follow the operating guide under Reference/i);
  assert.doesNotMatch(command, /### Step 1 — Run Layer A/);
  assert.doesNotMatch(command, /### Step 5 — Final gate/);
});

// @verifies C004
test('Step 1b carries every operational regeneration command', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  const start = command.indexOf('#### Step 1b');
  const end = command.indexOf('#### Step 1c');
  assert.ok(start > -1 && end > start, 'Step 1b has a bounded body');
  const step = command.slice(start, end);
  for (const token of ['regeneration/run.mjs open', 'regeneration/run.mjs status', 'regeneration/run.mjs continue', 'educe-sequences.md', 'regeneration/run.mjs verify', 'regeneration/run.mjs commit', 'regeneration/run.mjs recover']) {
    assert.match(step, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), token);
  }
  for (const token of ['CANDIDATE_CHANGED', 'STAGING_CHANGED', 'SILENT_CHANGE_DETECTED', 'TRANSACTION_TERMINAL', 'BASELINE_CHANGED']) {
    assert.match(step, new RegExp(token), token);
  }
});

// @verifies C004
test('Step 1c routes judgment-required to the owning AI command', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  const start = command.indexOf('#### Step 1c');
  const end = command.indexOf('### Step 2 — Complete');
  assert.ok(start > -1 && end > start, 'Step 1c has a bounded body');
  const step = command.slice(start, end);
  assert.match(step, /grill-me-for-rfc/);
  assert.match(step, /explain-seed/);
  assert.match(step, /not a stop|never a stop|repair route/i);
  assert.doesNotMatch(step, /human decision|stop and report/i);
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
  assert.match(command, /#### Step 1b/);
  assert.match(command, /--allocate-decisions/);
  assert.match(command, /--tree-decisions/);
  assert.match(command, /educe-pending/);
  assert.match(command, /CANDIDATE_CHANGED/);
  assert.match(command, /STAGING_CHANGED/);
  assert.match(command, /judgment-required/);
  assert.match(command, /recover/);
});

// @verifies C005
test('the command keeps judgment with the AI and names only direction questions as a human surface', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  assert.doesNotMatch(command, /human decision|stop and report|if a human is needed/i);
  assert.doesNotMatch(command, /judgment-required is a stop/i);
  assert.match(command, /never asks|does not ask/i);
  assert.match(command, /three questions per round|3 questions.*5 rounds/i);
  assert.match(command, /explain-seed/);
  assert.match(command, /grill-me-for-rfc/);
});

// @verifies C004
test('Appendix A keeps the check-family detail out of the steps', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  const appendix = command.slice(command.indexOf('## Appendix A'));
  assert.match(appendix, /S1 enumeration integrity/);
  assert.match(appendix, /S3 operation envelope/);
  assert.match(appendix, /S4 boundary clauses/);
  assert.match(appendix, /S5 contract meshing/);
  assert.match(appendix, /S6 danger/);
  assert.match(appendix, /S7 artifact\/view\/RFC consistency/);
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
