// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
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

// @verifies C001
test('the command documents the run directory, its status record and the archive', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  assert.match(command, /smooth-sequences\//);
  assert.match(command, /status\.json/);
  assert.match(command, /archive\//);
  assert.match(command, /verification/);
});

// @verifies C006
test('the command body is six flat numbered steps from Prepare to Complete, with no bottom Reference', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  const prepare = command.indexOf('### Step 1 — Prepare');
  const loop = command.indexOf('### Step 2 — Repair loop');
  const inPlace = command.indexOf('### Step 3 — In-place repair');
  const regeneration = command.indexOf('### Step 4 — Regeneration');
  const judgment = command.indexOf('### Step 5 — judgment-required');
  const complete = command.indexOf('### Step 6 — Complete');
  const appendix = command.indexOf('## Appendix A');
  assert.ok(prepare > -1, 'Prepare heading');
  assert.ok(loop > prepare, 'loop after prepare');
  assert.ok(inPlace > loop, 'in-place step after the loop');
  assert.ok(regeneration > inPlace, 'regeneration step after in-place');
  assert.ok(judgment > regeneration, 'judgment step after regeneration');
  assert.ok(complete > judgment, 'complete after the loop');
  assert.ok(appendix > complete, 'appendix after complete');
  const steps = [...command.matchAll(/^### Step (\d+) — /gm)].map((match) => Number(match[1]));
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6], 'steps are consecutive natural numbers');
  assert.doesNotMatch(command, /^#### Step/m, 'no child steps');
  assert.doesNotMatch(command, /^### Step \d+[a-z]/m, 'no lettered steps');
  assert.doesNotMatch(command, /^## Reference/m);
  assert.doesNotMatch(command, /Follow the operating guide under Reference/i);
  assert.doesNotMatch(command, /### Step 1 — Run Layer A/);
  assert.doesNotMatch(command, /### Step 5 — Final gate/);
});

// @verifies C004
test('Step 4 carries every operational regeneration command', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  const start = command.indexOf('### Step 4 — Regeneration');
  const end = command.indexOf('### Step 5 — judgment-required');
  assert.ok(start > -1 && end > start, 'Step 4 has a bounded body');
  const step = command.slice(start, end);
  for (const token of ['regeneration/run.mjs open', 'regeneration/run.mjs status', 'regeneration/run.mjs continue', 'educe-sequences.md', 'regeneration/run.mjs verify', 'regeneration/run.mjs commit', 'regeneration/run.mjs recover']) {
    assert.match(step, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), token);
  }
  for (const token of ['CANDIDATE_CHANGED', 'STAGING_CHANGED', 'SILENT_CHANGE_DETECTED', 'TRANSACTION_TERMINAL', 'BASELINE_CHANGED']) {
    assert.match(step, new RegExp(token), token);
  }
});

// @verifies C004
test('Step 5 routes judgment-required to the owning AI command', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  const start = command.indexOf('### Step 5 — judgment-required');
  const end = command.indexOf('### Step 6 — Complete');
  assert.ok(start > -1 && end > start, 'Step 5 has a bounded body');
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

test('every step names the command, path and argument that performs it', () => {
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  const section = (start, end) => {
    const from = command.indexOf(start);
    const to = command.indexOf(end);
    assert.ok(from > -1 && to > from, `${start} has a bounded body`);
    return command.slice(from, to);
  };

  const prepare = section('### Step 1 — Prepare', '### Step 2 — Repair loop');
  assert.match(prepare, /regeneration\/run\.mjs status/);
  assert.match(prepare, /educe-sequences\.md/);

  const loop = section('### Step 2 — Repair loop', '### Step 3 — In-place repair');
  assert.match(loop, /sequences-slice\/run\.mjs <artifact> <package>/);

  const regeneration = section('### Step 4 — Regeneration', '### Step 5 — judgment-required');
  assert.match(regeneration, /workspacify\/tree\/DECISIONS\.json/);
  assert.match(regeneration, /workspacify\/allocate\/DECISIONS\.json/);
  assert.match(regeneration, /regeneration\/run\.mjs verify/);
  assert.match(regeneration, /phase\.mjs through/);
  assert.match(regeneration, /spec-sequences\.json/);
  assert.match(regeneration, /disable-model-invocation/);
  assert.match(regeneration, /regeneration\/archive/);

  const judgment = section('### Step 5 — judgment-required', '### Step 6 — Complete');
  assert.match(judgment, /disable-model-invocation/);
  assert.match(judgment, /RFC-SEED\.md/);
  assert.match(judgment, /staging root/);
});

test('the command documents the regeneration transaction operating guide', () => {
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
  const command = readFileSync('.claude/commands/smooth-sequences.md', 'utf8');
  assert.match(command, /### Step 4 — Regeneration/);
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
