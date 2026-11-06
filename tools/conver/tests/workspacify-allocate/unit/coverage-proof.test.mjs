// [::TICKET::] PX-193 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-193 --for-spec --no-implementation-order`.
// PX-193 @verifies C004
// The zero-omission proof: every segment of the original specification must be
// referenced by at least one seed, and every inventory item must be allocated
// exactly once.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCoverageProof, assertSegmentCoverage } from '../../../.claude/scripts/workspacify-allocate/lib/coverage-proof.mjs';
import { buildValidManifest } from '../helpers/build-valid-manifest.mjs';

function fixture() {
  const { manifest } = buildValidManifest();
  const expectedAllocation = new Map([
    ['pkg-a', [
      { category: 'object', inventory_ref: 'obj-000001', canonical_name: 'Alpha Record' },
      { category: 'object', inventory_ref: 'obj-000002', canonical_name: 'Beta Record' },
    ]],
    ['pkg-b', []],
  ]);
  const parsedByPackage = new Map([
    ['pkg-a', { packageName: 'alpha', referenceBlock: { source_segments: manifest.structure.segments.map((segment) => segment.id) }, allocationIndexRows: [
        { category: 'object', inventory_ref: 'obj-000001', canonical_name: 'Alpha Record' },
        { category: 'object', inventory_ref: 'obj-000002', canonical_name: 'Beta Record' },
      ], traceabilityRows: [] }],
    ['pkg-b', { packageName: 'beta', referenceBlock: { source_segments: [] }, allocationIndexRows: [], traceabilityRows: [] }],
  ]);
  return { manifest, expectedAllocation, parsedByPackage };
}

test('C004 full coverage reports every segment covered and nothing unallocated', () => {
  const { manifest, expectedAllocation, parsedByPackage } = fixture();
  const proof = buildCoverageProof({ manifest, expectedAllocation, parsedByPackage });

  assert.equal(proof.segments_total, manifest.structure.segment_count);
  assert.equal(proof.segments_covered, manifest.structure.segment_count);
  assert.deepEqual(proof.uncovered, []);
  assert.deepEqual(proof.unallocated_items, []);
  assert.deepEqual(proof.duplicate_owner_refs, []);
  assert.deepEqual(proof.not_applicable_without_reason, []);
  assert.doesNotThrow(() => assertSegmentCoverage(proof));
});

test('C004 a dropped seed leaves its segments uncovered and fails the gate', () => {
  const { manifest, expectedAllocation, parsedByPackage } = fixture();
  const lossy = new Map(parsedByPackage);
  lossy.set('pkg-a', { ...lossy.get('pkg-a'), referenceBlock: { source_segments: [] } });

  const proof = buildCoverageProof({ manifest, expectedAllocation, parsedByPackage: lossy });
  assert.equal(proof.uncovered.length, proof.material_segments.length);
  assert.ok(proof.material_segments.length > 0, 'the fixture declares material segments');
  assert.deepEqual(proof.non_material_segments.length + proof.material_segments.length, manifest.structure.segment_count);
  assert.throws(() => assertSegmentCoverage(proof), (error) => error.gateId === 'G3.5' && /uncovered/.test(error.message));
});

test('C004 an unallocated or doubly owned inventory item is reported', () => {
  const { manifest, parsedByPackage } = fixture();

  const unallocated = buildCoverageProof({
    manifest,
    expectedAllocation: new Map([['pkg-a', []], ['pkg-b', []]]),
    parsedByPackage,
  });
  assert.ok(unallocated.unallocated_items.includes('object:obj-000001'));

  const doublyOwned = buildCoverageProof({
    manifest,
    expectedAllocation: new Map([['pkg-a', []], ['pkg-b', []]]),
    parsedByPackage,
    duplicateOwnerRefs: ['object:obj-000001'],
  });
  assert.ok(doublyOwned.duplicate_owner_refs.includes('object:obj-000001'));
});

test('C004 a not_applicable body must carry a reason and a segment reference', () => {
  const { manifest, expectedAllocation, parsedByPackage } = fixture();
  const withBodies = new Map(parsedByPackage);
  withBodies.set('pkg-a', {
    ...withBodies.get('pkg-a'),
    headings: [
      { index: 3, title: 'Source Coverage and Allocation Index', body: 'not_applicable' },
      { index: 8, title: 'Side-Effect and External-I/O Boundaries', body: 'not_applicable — no external I/O' },
    ],
  });

  const proof = buildCoverageProof({ manifest, expectedAllocation, parsedByPackage: withBodies });
  assert.deepEqual(proof.not_applicable_without_reason, ['pkg-a:3']);
});

test('C004 the proof is computed from parsed seeds, never from renderer state', () => {
  const { manifest, expectedAllocation, parsedByPackage } = fixture();
  const first = buildCoverageProof({ manifest, expectedAllocation, parsedByPackage });
  const second = buildCoverageProof({ manifest, expectedAllocation, parsedByPackage });
  assert.deepEqual(first, second);
});

// PX-389 @verifies C001
// A prose chapter carries a formula but no harvested declaration. The zero-omission
// proof must treat it as material so a seed owns it before S8 measures the formula set.

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
function formulaManifest() {
  return {
    structure: {
      segment_count: 2,
      segments: [
        { id: 's-000001', line_start: 1, line_end: 10, owned_inventory_ids: [] },
        { id: 's-000002', line_start: 11, line_end: 20, owned_inventory_ids: [], formula_ids: ['fx-0123456789ab'] },
      ],
    },
  };
}

test('PX-389 C001: a formula-bearing segment is material and uncovered without a seed claim', () => {
  const proof = buildCoverageProof({
    manifest: formulaManifest(),
    expectedAllocation: new Map(),
    parsedByPackage: new Map([['pkg-a', { referenceBlock: { source_segments: [] }, traceabilityRows: [] }]]),
  });

  assert.deepEqual(proof.material_segments, ['s-000002']);
  assert.deepEqual(proof.non_material_segments, ['s-000001']);
  assert.deepEqual(proof.uncovered, ['s-000002']);
});

test('PX-389 C001: a seed claim covers the formula-bearing segment', () => {
  const proof = buildCoverageProof({
    manifest: formulaManifest(),
    expectedAllocation: new Map(),
    parsedByPackage: new Map([['pkg-a', { referenceBlock: { source_segments: ['s-000002'] }, traceabilityRows: [] }]]),
  });

  assert.deepEqual(proof.uncovered, []);
  assert.equal(proof.segments_covered, 1);
});

test('PX-389 C001: inventory and formula material on one segment count once', () => {
  const proof = buildCoverageProof({
    manifest: {
      structure: {
        segment_count: 1,
        segments: [{ id: 's-000001', line_start: 1, line_end: 10, owned_inventory_ids: ['claim-000001'], formula_ids: ['fx-0123456789ab'] }],
      },
    },
    expectedAllocation: new Map(),
    parsedByPackage: new Map([['pkg-a', { referenceBlock: { source_segments: ['s-000001'] }, traceabilityRows: [] }]]),
  });

  assert.deepEqual(proof.material_segments, ['s-000001']);
  assert.deepEqual(proof.uncovered, []);
});
