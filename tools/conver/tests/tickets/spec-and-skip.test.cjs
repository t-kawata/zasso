'use strict';
// PX-398 @verifies C004

/**
 * PX-398 — nothing visible stays invisible.
 *
 * The spec renderer must show a top-level field the standard section set does
 * not name, and a skip must be classified as grounded, unproven or ungrounded.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildTicketMarkdown } = require('../../.claude/scripts/tickets/show-ticket-context.js');
const { findSpecGaps } = require('../../.claude/scripts/tickets/verify-spec-completeness.js');
const { classifySkip, findSkipGaps } = require('../../.claude/scripts/tickets/verify-skip-classification.js');

/** Render a ticket as the spec export does. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function renderSpec(ticket, ticketKey = 'PX-1') {
  return buildTicketMarkdown(ticketKey, ticket, { phases: [] }, '.', true, false);
}

test('C004: an unknown top-level field is rendered under Additional Fields', () => {
  const markdown = renderSpec({
    id: 1,
    phaseId: -1,
    status: 'made',
    title: 'Fixture',
    background: 'the background',
    customFutureField: { atoms: ['x'] },
    instrumentation: 'one line',
  });

  assert.match(markdown, /## Additional Fields/);
  assert.match(markdown, /### Custom Future Field/);
  assert.match(markdown, /"atoms"/);
  assert.match(markdown, /### Instrumentation/);
  assert.ok(markdown.indexOf('## Background') < markdown.indexOf('## Additional Fields'));
});

test('C004: a ticket with only standard fields renders no Additional Fields section', () => {
  const markdown = renderSpec({
    id: 1,
    phaseId: -1,
    status: 'made',
    title: 'Fixture',
    background: 'the background',
    notes: 'a note',
  });

  assert.doesNotMatch(markdown, /## Additional Fields/);
});

test('C004: verify-spec-completeness reports an omitted field and section', () => {
  const ticket = { background: 'b', notes: 'n', customFutureField: 'value' };

  const missingField = findSpecGaps(ticket, '## Background\n\nb\n\n## Test Plan\n', 'PX-1');
  assert.ok(missingField.some((entry) => entry.code === 'SPEC_FIELD_MISSING' && /customFutureField/.test(entry.asset)));
  assert.ok(missingField.some((entry) => entry.code === 'SPEC_FIELD_MISSING' && /notes/.test(entry.asset)));

  const missingSection = findSpecGaps(ticket, '## Background\n\nb\n', 'PX-1');
  assert.ok(missingSection.some((entry) => entry.code === 'SPEC_SECTION_MISSING'));
});

test('C004: a complete spec produces no gap', () => {
  assert.deepEqual(
    findSpecGaps({ background: 'b' }, '## Background\n\nb\n\n## Test Plan\n', 'PX-1'),
    [],
  );
});

test('C004: skip classification grounds not-applicable and names unproven and ungrounded skips', () => {
  assert.deepEqual(
    classifySkip({ check: 'distribution', reason: 'no-distribution', assetPresent: false }),
    { status: 'not_applicable', code: null },
  );
  assert.deepEqual(
    classifySkip({ check: 'distribution', reason: 'not implemented yet', assetPresent: false }),
    { status: 'unproven', code: 'UNPROVEN_SKIP' },
  );
  assert.deepEqual(
    classifySkip({ check: 'distribution', reason: 'no-distribution', assetPresent: true }),
    { status: 'ungrounded', code: 'UNGROUNDED_SKIP' },
  );
  assert.deepEqual(
    classifySkip({ check: 'distribution', reason: 'not implemented yet', producer: 'split-to-tickets' }),
    { status: 'not_applicable', code: null },
  );
});

test('C004: only an unproven or ungrounded skip becomes a finding', () => {
  const findings = findSkipGaps([
    { check: 'distribution', reason: 'no-distribution', assetPresent: false },
    { check: 'formula', reason: 'not implemented yet' },
    { check: 'prerequisites', reason: 'no-prerequisites', assetPresent: true },
  ], 'PX-1', 'Tickets.json');

  assert.deepEqual(findings.map((entry) => entry.code), ['UNPROVEN_SKIP', 'UNGROUNDED_SKIP']);
  assert.ok(findings.every((entry) => entry.fixes.length > 0));
});
