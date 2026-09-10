// [::TICKET::] PX-199 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-199 --for-spec --no-implementation-order`.
// PX-199 @verifies C001 C003
// The pulse reports observations about the specification as a document. It never
// grades, never removes a candidate and never decides importance.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSpecPulse, PULSE_KINDS } from '../../../.claude/scripts/workspacify-tree/lib/spec-pulse.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';

function analyze(sourceText) {
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  return { headings, segments };
}

function specWithWeaknesses() {
  return [
    '# Specification',
    '',
    '## Overview',
    '',
    'This chapter explains the background and is never referenced by another chapter.',
    '',
    '## Rules',
    '',
    'Clients MUST NOT retry after a failure without a fresh claim.',
    '',
    '## Ledger',
    '',
    '| object | kind |',
    '|--------|------|',
    '| LedgerRecord | record |',
    '| ledger_record | record |',
    '',
  ].join('\n');
}

function inventoryFor(segments) {
  return {
    objects: [{ id: 'obj-000001', canonical_name: 'LedgerRecord', source_refs: [{ segment_id: segments[segments.length - 1].id }] }],
    claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [],
  };
}

test('C001 the pulse reports the weaknesses a real specification carries', () => {
  const sourceText = specWithWeaknesses();
  const { headings, segments } = analyze(sourceText);
  const inventory = inventoryFor(segments);
  const pulse = buildSpecPulse({ sourceText, headings, segments, inventory });

  assert.ok(pulse.candidates.length >= 3, JSON.stringify(pulse.candidates));
  for (const kind of pulse.candidates.map((candidate) => candidate.kind)) {
    assert.ok(PULSE_KINDS.includes(kind), `unknown candidate kind ${kind}`);
  }
  // The Rules chapter states a normative phrase but yields no harvested item.
  assert.ok(pulse.candidates.some((candidate) => candidate.kind === 'extraction_gap' && candidate.chapter_ref), JSON.stringify(pulse.candidates));
  // The Overview chapter is referenced by nobody.
  assert.ok(pulse.candidates.some((candidate) => candidate.kind === 'isolated_chapter'));
  // Two spellings of one record name.
  assert.ok(pulse.candidates.some((candidate) => candidate.kind === 'near_duplicate_term'));
  // Every candidate names its evidence and states a full sentence.
  for (const candidate of pulse.candidates) {
    assert.match(candidate.id, /^pulse-\d{6}$/);
    assert.ok(candidate.observation.endsWith('.'), candidate.observation);
    assert.ok(Array.isArray(candidate.evidence_refs) && candidate.evidence_refs.length > 0, candidate.id);
    assert.equal(typeof candidate.grade, 'undefined', 'the pulse never grades');
  }
});

test('C001 the pulse is deterministic and its ids are document-ordered', () => {
  const sourceText = specWithWeaknesses();
  const { headings, segments } = analyze(sourceText);
  const inventory = inventoryFor(segments);
  const first = buildSpecPulse({ sourceText, headings, segments, inventory });
  const second = buildSpecPulse({ sourceText, headings, segments, inventory });
  assert.deepEqual(second, first);
  first.candidates.forEach((candidate, index) => {
    assert.equal(candidate.id, `pulse-${String(index + 1).padStart(6, '0')}`);
  });
});

test('C001 a healthy specification yields no candidates and degenerate inputs do not crash', () => {
  const healthy = '# Specification\n\n## Rules\n\n| object | kind |\n|--------|------|\n| RuleRecord | record |\n\nThe RuleRecord MUST be validated.\n';
  const healthyAnalysis = analyze(healthy);
  const healthyPulse = buildSpecPulse({
    sourceText: healthy,
    headings: healthyAnalysis.headings,
    segments: healthyAnalysis.segments,
    inventory: { objects: [{ id: 'obj-000001', canonical_name: 'RuleRecord', source_refs: [{ segment_id: healthyAnalysis.segments[healthyAnalysis.segments.length - 1].id }] }], claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] },
  });
  assert.deepEqual(healthyPulse.candidates, [], JSON.stringify(healthyPulse.candidates));

  const single = '# Title\n\nprose only\n';
  const singleAnalysis = analyze(single);
  const singlePulse = buildSpecPulse({ sourceText: single, headings: singleAnalysis.headings, segments: singleAnalysis.segments, inventory: {} });
  assert.equal(singlePulse.candidates.some((candidate) => candidate.kind === 'isolated_chapter'), false);
  assert.deepEqual(buildSpecPulse({ sourceText: '', headings: [], segments: [], inventory: {} }).candidates, []);
});
