// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// @verifies C001
// C001 invariant: The number of unmapped headings is 0
/**
 * Heading coverage: every package heading is a concept or a justified
 * non-normative declaration.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoverageLedger } from '../../../.claude/skills/rust-interface-law/scripts/lib/coverage-ledger.mjs';

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function heading(path, level = 2) {
  return { path, level, title: path, line: 1, start: 0, end: 10, part: 'part-i' };
}

test('C001: a heading without a concept or a reason is unmapped', () => {
  const ledger = buildCoverageLedger({
    headings: [heading('part-i/1-your-role'), heading('part-i/2-background')],
    concepts: [{ id: 'docs/part-i/1-your-role', sourcePath: 'part-i/1-your-role' }],
    nonNormative: [],
    ruleRows: [],
    ruleConcepts: new Map(),
    aliases: {},
  });
  assert.equal(ledger.counts.unmappedHeadings, 1);
  assert.deepEqual(ledger.unmapped, ['part-i/2-background']);
});

test('C001: a declared non-normative heading needs a reason', () => {
  const ledger = buildCoverageLedger({
    headings: [heading('part-i/2-background')],
    concepts: [],
    nonNormative: [{ path: 'part-i/2-background', reason: 'review request, not a rule' }],
    ruleRows: [],
    ruleConcepts: new Map(),
    aliases: {},
  });
  assert.equal(ledger.counts.unmappedHeadings, 0);
  assert.equal(ledger.headings[0].disposition, 'non-normative');
});

test('C001: a heading is never both a concept and non-normative', () => {
  assert.throws(
    () => buildCoverageLedger({
      headings: [heading('part-i/1-your-role')],
      concepts: [{ id: 'docs/part-i/1-your-role', sourcePath: 'part-i/1-your-role' }],
      nonNormative: [{ path: 'part-i/1-your-role', reason: 'duplicate' }],
      ruleRows: [],
      ruleConcepts: new Map(),
      aliases: {},
    }),
    (error) => error.code === 'HEADING_DUPLICATE_DISPOSITION',
  );
});

test('C001: every rule row maps to a concept or an alias target', () => {
  const ledger = buildCoverageLedger({
    headings: [],
    concepts: [],
    nonNormative: [],
    ruleRows: [{ id: 'REST-01' }, { id: 'INV-08' }],
    ruleConcepts: new Map([['REST-01', 'rules/c/rest-01']]),
    aliases: { 'INV-08': { target: 'OPS-06', reason: 'same obligation' } },
  });
  assert.equal(ledger.counts.unmappedRuleRows, 0);
  assert.deepEqual(ledger.rules.map((row) => row.disposition), ['concept', 'alias']);
});
