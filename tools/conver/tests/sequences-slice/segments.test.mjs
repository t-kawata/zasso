// PX-255 @verifies C004
// The line-range key was rejected, and the rejection is a measurement rather than an
// opinion. These tests hold the measurement: if a future change made the key selective,
// the conservation identity would still hold while the multi-claimed count collapsed, so
// the count itself is asserted and not just the identity.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findUnknownSegmentIds,
  measureLineRangeJoin,
  normalizeStructureSegments,
  readSourceSegments,
  resolveSegmentLineRanges,
} from '../../.claude/scripts/sequences-slice/lib/segments.mjs';
import { renderRfcSeed } from './fixtures/synthetic-workspace.mjs';
import { RECORDED_MANIFEST_SEGMENTS, RECORDED_PACKAGE_SEGMENTS, SPEC_LINES } from './fixtures/line-range-shape.mjs';

const RECORDED_SEGMENTS = normalizeStructureSegments(RECORDED_MANIFEST_SEGMENTS);

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 a seed document yields the segment ids its source_segments block carries', () => {
  const text = renderRfcSeed({ seedPackage: 'pkg-0001', seedPath: 'crates/foundation/gaia-foundation', segmentIds: ['s-000027'] });
  assert.deepEqual(readSourceSegments(text), ['s-000027']);
  assert.deepEqual(readSourceSegments(renderRfcSeed({ seedPackage: 'pkg-0001', seedPath: 'x', segmentIds: [] })), []);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 a document with no source_segments block yields nothing rather than a guess', () => {
  assert.equal(readSourceSegments('# no fence here'), null);
  assert.equal(readSourceSegments('```json\n{ "package": "pkg-0001" }\n```'), null);
  assert.equal(readSourceSegments('```json\n{ "source_segments": "s-000027" }\n```'), null);
  assert.equal(readSourceSegments('```json\nnot json at all\n```'), null);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 the tree manifest segments carry the line range each segment id resolves to', () => {
  const segmentsById = new Map(RECORDED_SEGMENTS.map((segment) => [segment.id, segment]));
  assert.equal(segmentsById.size, 33);
  assert.deepEqual(resolveSegmentLineRanges(['s-000027'], segmentsById), [{ id: 's-000027', lineStart: 13427, lineEnd: 13892 }]);
  assert.deepEqual(resolveSegmentLineRanges(['s-000001', 's-000033'], segmentsById), [
    { id: 's-000001', lineStart: 1, lineEnd: 2 },
    { id: 's-000033', lineStart: 15790, lineEnd: 15971 },
  ]);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 a segment id absent from the tree manifest is reported rather than dropped', () => {
  const segmentsById = new Map(RECORDED_SEGMENTS.map((segment) => [segment.id, segment]));
  assert.deepEqual(findUnknownSegmentIds(['s-000001', 's-999999'], segmentsById), ['s-999999']);
  assert.deepEqual(resolveSegmentLineRanges(['s-000001', 's-999999'], segmentsById), [{ id: 's-000001', lineStart: 1, lineEnd: 2 }]);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 the line coordinate is conserved across the packages that claim it', () => {
  const measured = measureLineRangeJoin({
    packageSegments: RECORDED_PACKAGE_SEGMENTS,
    structureSegments: RECORDED_SEGMENTS,
    specLines: SPEC_LINES,
  });
  assert.equal(measured.claimedLineCount + measured.unclaimedLineCount, SPEC_LINES);
  assert.equal(measured.claimedLineCount, 15969);
  assert.equal(measured.unclaimedLineCount, 2);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 the key claims almost every line more than once, which is why it is not an identity', () => {
  const measured = measureLineRangeJoin({
    packageSegments: RECORDED_PACKAGE_SEGMENTS,
    structureSegments: RECORDED_SEGMENTS,
    specLines: SPEC_LINES,
  });
  assert.equal(measured.multiClaimedLineCount, 14307);
  assert.ok(measured.multiClaimedLineCount <= measured.claimedLineCount);
  assert.equal(measured.segmentsUsedByMoreThanOnePackage, 29);
  assert.equal(measured.maxClaimantsOnOneSegment, 15);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 ten packages claim no segment at all, so the key cannot reach them', () => {
  const measured = measureLineRangeJoin({
    packageSegments: RECORDED_PACKAGE_SEGMENTS,
    structureSegments: RECORDED_SEGMENTS,
    specLines: SPEC_LINES,
  });
  assert.equal(measured.packagesWithNoSegments.length, 10);
  assert.ok(measured.packagesWithNoSegments.every((entry) => entry.segmentIds.length === 0));
  assert.deepEqual(measured.unusedSegmentIds, ['s-000001']);
  assert.deepEqual(measured.singlyClaimedSegmentIds, ['s-000008', 's-000028', 's-000032']);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 the manifest carries line_start and line_end, and the reader converts them at the boundary', () => {
  const first = RECORDED_MANIFEST_SEGMENTS[0];
  assert.equal(first.line_start, 1);
  assert.equal(first.line_end, 2);
  assert.equal(first.lineStart, undefined);
  assert.equal(first.lineEnd, undefined);
  assert.deepEqual(normalizeStructureSegments([first]), [{ id: 's-000001', lineStart: 1, lineEnd: 2 }]);
  assert.equal(normalizeStructureSegments(RECORDED_MANIFEST_SEGMENTS).length, 33);
});

// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
test('C004 a segment with no line range is rejected rather than read as an empty one', () => {
  assert.throws(() => normalizeStructureSegments([{ id: 's-000001' }]), /s-000001/);
  assert.throws(() => normalizeStructureSegments([{ id: 's-000001', line_start: 1 }]), /s-000001/);
  assert.throws(() => normalizeStructureSegments([{ line_start: 1, line_end: 2 }]), /id/);
});
