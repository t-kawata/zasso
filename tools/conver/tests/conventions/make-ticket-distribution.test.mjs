// PX-324 @verifies C005
// PX-325 @verifies C007
// The make-ticket workflow must define the distribution brief and the delivery gate as
// conditional steps, so a ticket without distribution and Case B keep their old path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DOCUMENT = readFileSync(new URL('../../.claude/commands/make-ticket.md', import.meta.url), 'utf8');

test('C005 the workflow defines the conditional distribution brief', () => {
  assert.match(DOCUMENT, /### Step 1\.5: Distribution brief \(conditional\)/);
  assert.match(DOCUMENT, /If it does not, skip to Step 2/);
  assert.match(DOCUMENT, /## Distribution Obligations/);
  assert.match(DOCUMENT, /### Work Share/);
});

test('C005 the workflow defines the distribution-driven test phase', () => {
  assert.match(DOCUMENT, /Phase 1\.6 — Distribution-driven tests and contracts \(conditional\)/);
  assert.match(DOCUMENT, /machine-projected step or boundary contract is never removed/);
});

test('C005 the workflow runs the delivery gate and names the skip path', () => {
  assert.match(DOCUMENT, /verify-make-distribution\.js/);
  assert.match(DOCUMENT, /skipped:no-distribution/);
  assert.match(DOCUMENT, /DISTRIBUTION_UNIT_UNTESTED/);
});

test('C005 the spec requirement is conditional', () => {
  assert.match(DOCUMENT, /When the ticket carries distribution units, the spec must also contain/);
  assert.match(DOCUMENT, /A ticket with no distribution units writes no such section, so Case B is unchanged/);
});

// [::TICKET::] PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-325 --for-spec --no-implementation-order`.
test('C007 the delivery gate runs after the spec is written', () => {
  const specStep = DOCUMENT.indexOf('### Step 9: Write spec file');
  const gateStep = DOCUMENT.indexOf('### Step 9.5: Distribution delivery gate');
  const statusStep = DOCUMENT.indexOf('### Step 10: Update ticket status');
  assert.ok(specStep > 0);
  assert.ok(gateStep > specStep);
  assert.ok(statusStep > gateStep);
  assert.match(DOCUMENT, /DISTRIBUTION_SPEC_MISSING/);
  assert.match(DOCUMENT, /WORK_SHARE_SECTION_MISSING/);
});

test('C005 plan, start and review run the prerequisite gate at entry', () => {
  for (const command of ['plan-ticket.md', 'start-ticket.md', 'review-ticket.md']) {
    const document = readFileSync(new URL(`../../.claude/commands/${command}`, import.meta.url), 'utf8');
    assert.match(document, /check-ticket-prerequisites\.js --ticket-key="\$ARGUMENTS"/);
  }
});
