// PX-389 @verifies C001
// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
/**
 * A formula-bearing prose segment is ownable only through a grounded claim.
 *
 * The S8 gate counts every formula in the specification, so a segment that carries a
 * formula must have an owner even when no declaration was harvested from it. These
 * tests pin the two halves of that rule: the formula is attached to its segment, and a
 * claim is accepted only when its quote is on the cited line inside that segment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  annotateFormulaSegments,
  checkFormulaSegmentOwnership,
  validateSegmentOwnership,
  SEGMENT_OWNERSHIP_UNKNOWN_SEGMENT,
  SEGMENT_OWNERSHIP_UNKNOWN_PACKAGE,
  SEGMENT_GROUND_OUT_OF_RANGE,
  SEGMENT_GROUND_QUOTE_MISSING,
  SEGMENT_OWNERSHIP_DUPLICATE,
  FORMULA_SEGMENT_UNOWNED,
} from '../../../.claude/scripts/workspacify-tree/lib/segment-ownership.mjs';
import { extractFormulas, uniqueFormulas } from '../../../.claude/scripts/spec-formula/index.mjs';

const SOURCE_TEXT = '## Alpha\n\nThe alpha rule is normative.\n\n\\[x=1\\]\n';
const SEGMENTS = Object.freeze([
  { id: 's-000001', line_start: 1, line_end: 6, owned_inventory_ids: [] },
]);
const PACKAGES = Object.freeze([{ id: 'pkg-alpha' }]);

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
function formulaId() {
  return uniqueFormulas(extractFormulas(SOURCE_TEXT))[0].id;
}

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
function groundedClaim(overrides = {}) {
  return {
    segmentId: 's-000001',
    packageId: 'pkg-alpha',
    source: { line: 3, quote: 'The alpha rule is normative.' },
    ...overrides,
  };
}

test('C001 precondition: a formula on a prose line is attached to its segment', () => {
  const annotated = annotateFormulaSegments({ segments: SEGMENTS, sourceText: SOURCE_TEXT });

  assert.deepEqual(annotated[0].formula_ids, [formulaId()]);
});

test('C001 boundary: a specification with no formula writes no formula_ids field', () => {
  const annotated = annotateFormulaSegments({
    segments: SEGMENTS,
    sourceText: '## Alpha\n\nNo mathematics here.\n',
  });

  assert.equal('formula_ids' in annotated[0], false);
});

test('C001 precondition: a grounded claim on a formula segment is accepted', () => {
  const report = validateSegmentOwnership({
    ownership: [groundedClaim()],
    segments: SEGMENTS,
    packages: PACKAGES,
    sourceText: SOURCE_TEXT,
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.entries, [groundedClaim()]);
});

test('C001 error: an unknown segment is refused by name', () => {
  const report = validateSegmentOwnership({
    ownership: [groundedClaim({ segmentId: 's-999999' })],
    segments: SEGMENTS,
    packages: PACKAGES,
    sourceText: SOURCE_TEXT,
  });

  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, SEGMENT_OWNERSHIP_UNKNOWN_SEGMENT);
});

test('C001 error: an unknown package is refused by name', () => {
  const report = validateSegmentOwnership({
    ownership: [groundedClaim({ packageId: 'pkg-missing' })],
    segments: SEGMENTS,
    packages: PACKAGES,
    sourceText: SOURCE_TEXT,
  });

  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, SEGMENT_OWNERSHIP_UNKNOWN_PACKAGE);
});

test('C001 error: a line outside the segment is refused by name', () => {
  const report = validateSegmentOwnership({
    ownership: [groundedClaim({ source: { line: 30, quote: 'The alpha rule is normative.' } })],
    segments: SEGMENTS,
    packages: PACKAGES,
    sourceText: SOURCE_TEXT,
  });

  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, SEGMENT_GROUND_OUT_OF_RANGE);
});

test('C001 error: a quote absent from the cited line is refused by name', () => {
  const report = validateSegmentOwnership({
    ownership: [groundedClaim({ source: { line: 3, quote: 'not on this line' } })],
    segments: SEGMENTS,
    packages: PACKAGES,
    sourceText: SOURCE_TEXT,
  });

  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, SEGMENT_GROUND_QUOTE_MISSING);
});

test('C001 error: two claims for one segment are refused by name', () => {
  const report = validateSegmentOwnership({
    ownership: [groundedClaim(), groundedClaim()],
    segments: SEGMENTS,
    packages: PACKAGES,
    sourceText: SOURCE_TEXT,
  });

  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, SEGMENT_OWNERSHIP_DUPLICATE);
});

test('C001 invariant: an unclaimed formula segment is an orphan and names its code', () => {
  const annotated = annotateFormulaSegments({ segments: SEGMENTS, sourceText: SOURCE_TEXT });
  const report = checkFormulaSegmentOwnership({ segments: annotated, segmentOwnership: [] });

  assert.equal(report.orphanCount, 1);
  assert.match(report.details[0], new RegExp(FORMULA_SEGMENT_UNOWNED));
});

test('C001 invariant: inventory or a grounded claim clears the orphan', () => {
  const annotated = annotateFormulaSegments({ segments: SEGMENTS, sourceText: SOURCE_TEXT });

  const byInventory = checkFormulaSegmentOwnership({
    segments: [{ ...annotated[0], owned_inventory_ids: ['claim-000001'] }],
    segmentOwnership: [],
  });
  assert.equal(byInventory.orphanCount, 0);

  const byClaim = checkFormulaSegmentOwnership({
    segments: annotated,
    segmentOwnership: [groundedClaim()],
  });
  assert.equal(byClaim.orphanCount, 0);
});

test('C001 invariant: annotation is deterministic for the same text', () => {
  const first = annotateFormulaSegments({ segments: SEGMENTS, sourceText: SOURCE_TEXT });
  const second = annotateFormulaSegments({ segments: SEGMENTS, sourceText: SOURCE_TEXT });

  assert.deepEqual(first, second);
});
