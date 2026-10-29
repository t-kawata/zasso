// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
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
  // PX-330: Work Share is emitted for sequence and ctr units only. The previous wording
  // required it for every distribution unit, which contradicted the renderer and the gate.
  assert.match(DOCUMENT, /When the ticket carries a sequence or ctr unit, the spec must also contain/);
  assert.match(DOCUMENT, /A ticket with no distribution units writes no such section, so Case B is unchanged/);
});

// [::TICKET::] PX-325 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-325 --for-spec --no-implementation-order`.
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

test('C007 the delivery gate runs on every make run and self-skips', () => {
  // The gate decides from the ticket. Making its invocation conditional on the AI noticing
  // a rendered section lets a distribution-bearing ticket with a rendering defect skip it.
  assert.match(DOCUMENT, /### Step 9\.5: Distribution delivery gate \(post-write, self-skipping\)/);
  assert.match(DOCUMENT, /Run this gate after every spec write/);
  assert.doesNotMatch(DOCUMENT, /Run only when Step 1\.5 ran\. The spec must exist/);
});

test('C005 plan, start and review run the prerequisite gate at entry', () => {
  for (const command of ['plan-ticket.md', 'start-ticket.md', 'review-ticket.md']) {
    const document = readFileSync(new URL(`../../.claude/commands/${command}`, import.meta.url), 'utf8');
    assert.match(document, /check-ticket-prerequisites\.js"? --ticket-key="\$ARGUMENTS"/);
  }
});

test('C005 the workflow briefs implementation prerequisites and step contracts', () => {
  assert.match(DOCUMENT, /## Implementation Prerequisites/);
  assert.match(DOCUMENT, /`## Distribution Obligations` or `## Implementation Prerequisites`/);
  assert.match(DOCUMENT, /Operation-Boundary Contracts/);
});

test('PX-330 the Work Share requirement names the units that actually produce the section', () => {
  assert.match(DOCUMENT, /When the ticket carries a sequence or ctr unit, the spec must also contain/);
  assert.doesNotMatch(DOCUMENT, /When the ticket carries distribution units, the spec must also contain/);
});

test('PX-330 the contract gate names both test fields the workflow allows', () => {
  assert.match(DOCUMENT, /checks each Contract pre\/post\/invariant in `testUnit` or `testIntegration`/);
});
