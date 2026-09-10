// [::TICKET::] PX-192 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-192 --for-spec --no-implementation-order`.
// PX-192 @verifies C003
// Zero-omission transfer needs two machine facts from stage 1: the segment list is
// a total partition of the normalised specification, and every harvested candidate
// can be traced back to the segment it came from.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { segmentAtHeadings, partitionStats } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { harvestObjectCandidates, harvestCategoryInventory } from '../../../.claude/scripts/workspacify-tree/lib/extraction.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { DEFAULT_SPEC_TEXT, segmentSpecification, buildValidTreeManifest } from '../helpers/build-valid-tree-manifest.mjs';

function headingsFor(sourceText) {
  return buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
}

test('C003 partitionStats proves a total partition with no gap and no overlap', () => {
  const { segments, sourceBytes } = segmentSpecification(DEFAULT_SPEC_TEXT);
  const stats = partitionStats(segments, sourceBytes);

  assert.equal(stats.segment_count, segments.length);
  assert.equal(stats.covered_bytes, sourceBytes);
  assert.equal(stats.first_byte, 0);
  assert.equal(stats.last_byte, sourceBytes);
  assert.equal(stats.is_total_partition, true);

  for (let index = 1; index < segments.length; index += 1) {
    assert.equal(segments[index].byte_start, segments[index - 1].byte_end, 'segments must be contiguous');
  }
});

test('C003 a gap or overlap is not reported as a total partition', () => {
  const { segments, sourceBytes } = segmentSpecification(DEFAULT_SPEC_TEXT);
  const gapped = segments.map((segment, index) => (index === 1 ? { ...segment, byte_start: segment.byte_start + 1 } : segment));
  assert.equal(partitionStats(gapped, sourceBytes).is_total_partition, false);

  const overlapped = segments.map((segment, index) => (index === 1 ? { ...segment, byte_end: segment.byte_end + 1 } : segment));
  assert.equal(partitionStats(overlapped, sourceBytes).is_total_partition, false);

  const truncated = segments.slice(0, segments.length - 1);
  assert.equal(partitionStats(truncated, sourceBytes).is_total_partition, false);
});

test('C003 a specification without a level-2 anchor still yields one covering segment', () => {
  const flat = '# Title\n\nNo chapter headings here.\n\nJust prose.\n';
  const { segments } = segmentAtHeadings({ sourceText: flat, headings: headingsFor(flat) }, { segmentLevel: 2 });
  const stats = partitionStats(segments, Buffer.byteLength(flat, 'utf8'));
  assert.equal(stats.segment_count, 1);
  assert.equal(stats.is_total_partition, true);
  assert.equal(stats.covered_bytes, Buffer.byteLength(flat, 'utf8'));
});

test('C003 every harvested candidate ref carries a resolvable segment id', () => {
  const sourceText = readFileSync(
    fileURLToPath(new URL('../fixtures/normative-words.md', import.meta.url)),
    'utf8',
  );
  const { headings, segments } = segmentSpecification(sourceText);
  const candidates = [
    ...harvestObjectCandidates({ sourceText, headings, segments }),
    ...harvestCategoryInventory({ sourceText, headings, segments }).invariants,
  ];
  assert.ok(candidates.length > 0, 'the fixture specification must yield candidates');

  for (const candidate of candidates) {
    assert.ok(candidate.source_refs.length > 0, `${candidate.id} must carry source refs`);
    for (const ref of candidate.source_refs) {
      assert.equal(typeof ref.segment_id, 'string', `${candidate.id} ref must carry a segment id`);
      const owner = segments.find((segment) => segment.id === ref.segment_id);
      assert.ok(owner, `${candidate.id} ref segment ${ref.segment_id} must exist`);
      assert.ok(
        ref.byte_start >= owner.byte_start && ref.byte_start < owner.byte_end,
        `${candidate.id} ref byte offset must fall inside its segment`,
      );
    }
  }
});

test('C003 the manifest publishes the partition facts', () => {
  const { manifest, segments, sourceBytes } = buildValidTreeManifest();

  assert.equal(manifest.structure.segment_count, segments.length);
  assert.equal(manifest.structure.covered_bytes, sourceBytes);
  assert.equal(partitionStats(manifest.structure.segments, manifest.structure.covered_bytes).is_total_partition, true);

  for (const item of manifest.inventory.objects) {
    for (const ref of item.source_refs) {
      assert.equal(typeof ref.segment_id, 'string');
    }
  }
});
