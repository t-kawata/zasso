// PX-221 @verifies C001
// PX-221 @verifies C002
// PX-221 @verifies C003
// PX-221 @verifies C008
//
// A segment record carries two descriptions of one interval: the offsets that name it
// and the hash that fingerprints it. `markdown.mjs` fixes those offsets as string
// offsets, so the hash has to be taken over the text they name. An ASCII-only document
// cannot tell the two conventions apart — for ASCII the character offset and the byte
// offset are the same number — so this suite writes a specification that carries
// Japanese in its first segment, where every later offset diverges.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  segmentAtHeadings,
  partitionStats,
  verifyReconstruction,
} from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { normalizeTextBytes } from '../../../.claude/scripts/workspacify-tree/lib/normalization.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { DEFAULT_SPEC_TEXT } from '../helpers/build-valid-tree-manifest.mjs';

/** Japanese text before the first level-two heading, so later offsets are not byte offsets. */
const NON_ASCII_SPEC = [
  '# 仕様見出し',
  '',
  '導入の段落。ここに日本語が入るので、以降のオフセットはずれる。',
  '',
  '## 1. 第一章',
  '',
  '第一章の本文。成熟度depthと閾値の話。',
  '',
  '## 2. 第二章',
  '',
  '第二章の本文。ここで終わる。',
  '',
].join('\n');

/** The segments, and the normalized bytes, of one specification. */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
function segmentSpecification(sourceText) {
  const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
  const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
  const { bytes } = normalizeTextBytes(Buffer.from(sourceText, 'utf8'));
  return { segments, bytes, sourceText };
}

/** The text a segment's offsets name. */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
function textOf(sourceText, segment) {
  return sourceText.slice(segment.byte_start, segment.byte_end);
}

/** The line number an offset falls on, counting from one. */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
function lineNumberAt(sourceText, offset) {
  return sourceText.slice(0, offset).split('\n').length;
}

test('C001 precondition: the non-ASCII specification is segmented into records carrying offsets, lines and a digest', () => {
  const { segments } = segmentSpecification(NON_ASCII_SPEC);

  assert.ok(
    [...NON_ASCII_SPEC].some((character) => character.charCodeAt(0) > 127),
    'the fixture must carry characters outside ASCII or it cannot separate the two conventions',
  );
  assert.ok(segments.length > 1, 'the fixture must carry more than one segment');
  for (const segment of segments) {
    assert.ok(segment.byte_start >= 0 && segment.byte_end <= NON_ASCII_SPEC.length);
    assert.match(segment.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isInteger(segment.line_start) && Number.isInteger(segment.line_end));
  }
});

test('C001 postcondition: every segment records the hash of the text its offsets name', () => {
  const { segments } = segmentSpecification(NON_ASCII_SPEC);

  for (const segment of segments) {
    assert.equal(
      sha256Hex(Buffer.from(textOf(NON_ASCII_SPEC, segment), 'utf8')),
      segment.sha256,
      `${segment.id} must fingerprint the text it names`,
    );
  }
});

test('C001 postcondition: an ASCII document keeps the hash it had, because there the two conventions coincide', () => {
  const { segments } = segmentSpecification(DEFAULT_SPEC_TEXT);

  for (const segment of segments) {
    assert.equal(
      sha256Hex(Buffer.from(textOf(DEFAULT_SPEC_TEXT, segment), 'utf8')),
      segment.sha256,
      `${segment.id} must fingerprint the text it names`,
    );
  }
});

test('C001 invariant: the offsets that produce the lines are the offsets that produce the hash', () => {
  const { segments } = segmentSpecification(NON_ASCII_SPEC);

  for (const segment of segments) {
    assert.equal(segment.line_start, lineNumberAt(NON_ASCII_SPEC, segment.byte_start));
    assert.equal(
      segment.line_end,
      lineNumberAt(NON_ASCII_SPEC, Math.max(segment.byte_start, segment.byte_end - 1)),
    );
    assert.equal(
      sha256Hex(Buffer.from(textOf(NON_ASCII_SPEC, segment), 'utf8')),
      segment.sha256,
      `${segment.id} names one interval in all four fields`,
    );
  }
});

test('C001 invariant: a segment that begins at a heading carries text that begins at that heading', () => {
  const { segments } = segmentSpecification(NON_ASCII_SPEC);

  assert.equal(segments.some((segment) => segment.heading_id !== null), true);
  for (const segment of segments) {
    if (segment.heading_id === null) continue;
    assert.match(textOf(NON_ASCII_SPEC, segment), /^#{1,6} /, `${segment.id} begins at a heading`);
  }
});

test('C001 boundary: a document whose first heading is not at offset 0 yields a preamble segment', () => {
  const withPreamble = `まえがき。\n\n${NON_ASCII_SPEC}`;
  const { segments } = segmentSpecification(withPreamble);

  assert.equal(segments[0].heading_id, null, 'the preamble carries no heading');
  assert.equal(segments[0].byte_start, 0);
  for (const segment of segments) {
    assert.equal(
      sha256Hex(Buffer.from(textOf(withPreamble, segment), 'utf8')),
      segment.sha256,
      `${segment.id} must fingerprint the text it names`,
    );
  }
});

test('C002 precondition: the whole-document gate is given the segments the corrected segmentation returns', () => {
  for (const sourceText of [NON_ASCII_SPEC, DEFAULT_SPEC_TEXT]) {
    const { segments, bytes } = segmentSpecification(sourceText);
    const result = verifyReconstruction({ sourceBytes: bytes, sourceHash: sha256Hex(bytes), segments });

    assert.equal(typeof result.status, 'string');
    assert.equal(typeof result.exactMatch, 'boolean');
  }
});

test('C002 postcondition: the gate still returns PASS, and the windows still rejoin the whole document', () => {
  for (const sourceText of [NON_ASCII_SPEC, DEFAULT_SPEC_TEXT]) {
    const { segments, bytes } = segmentSpecification(sourceText);
    const result = verifyReconstruction({ sourceBytes: bytes, sourceHash: sha256Hex(bytes), segments });

    assert.equal(result.status, 'PASS');
    assert.equal(result.exactMatch, true);
    assert.equal(result.hashMatch, true);
    const rejoined = segments.map((segment) => textOf(sourceText, segment)).join('');
    assert.equal(rejoined, sourceText, 'contiguous text slices rejoin to the whole document');
  }
});

test('C002 invariant: the gate stays a whole-document check, so a broken document hash fails it', () => {
  const { segments, bytes } = segmentSpecification(NON_ASCII_SPEC);
  const broken = verifyReconstruction({ sourceBytes: bytes, sourceHash: 'de'.repeat(32), segments });

  assert.equal(broken.status, 'FAIL');
  assert.equal(broken.hashMatch, false);
  assert.equal(
    broken.exactMatch,
    true,
    'the concatenation reproduces the input whatever the offsets mean, which is why the per-segment guarantee belongs to C001',
  );
});

test('C003 precondition: line endings are normalized before either the source hash or the offsets are taken', () => {
  const withCrLf = NON_ASCII_SPEC.replace(/\n/g, '\r\n');
  const fromCrLf = normalizeTextBytes(Buffer.from(withCrLf, 'utf8'));
  const fromLf = normalizeTextBytes(Buffer.from(NON_ASCII_SPEC, 'utf8'));

  assert.equal(fromCrLf.hadCrLf, true);
  assert.equal(sha256Hex(fromCrLf.bytes), sha256Hex(fromLf.bytes), 'LF is the fixed point of line endings');
});

test('C003 postcondition: the byte count and the source hash are functions of the whole normalized text', () => {
  const { bytes } = segmentSpecification(NON_ASCII_SPEC);

  assert.equal(bytes.length, Buffer.byteLength(NON_ASCII_SPEC, 'utf8'));
  assert.equal(sha256Hex(bytes), sha256Hex(Buffer.from(NON_ASCII_SPEC, 'utf8')));
});

test('C003 invariant: regrouping the text into segments cannot move the source hash', () => {
  const { segments } = segmentSpecification(NON_ASCII_SPEC);
  const rejoined = segments.map((segment) => textOf(NON_ASCII_SPEC, segment)).join('');

  assert.equal(sha256Hex(Buffer.from(rejoined, 'utf8')), sha256Hex(Buffer.from(NON_ASCII_SPEC, 'utf8')));
});

test('C008 precondition: the partition summary is given the length the offsets index into', () => {
  const { segments } = segmentSpecification(NON_ASCII_SPEC);
  const stats = partitionStats(segments, NON_ASCII_SPEC.length);

  assert.equal(stats.segment_count, segments.length);
  assert.equal(stats.first_byte, 0);
});

test('C008 postcondition: a non-ASCII document is a total partition, and a gap, an overlap or a truncation is not', () => {
  const { segments } = segmentSpecification(NON_ASCII_SPEC);
  const stats = partitionStats(segments, NON_ASCII_SPEC.length);

  assert.equal(stats.last_byte, NON_ASCII_SPEC.length, 'the final offset is a text offset like every other');
  assert.equal(stats.covered_bytes, NON_ASCII_SPEC.length);
  assert.equal(stats.is_total_partition, true);

  const gapped = segments.map((segment, index) => (index === 1 ? { ...segment, byte_start: segment.byte_start + 1 } : segment));
  const overlapped = segments.map((segment, index) => (index === 1 ? { ...segment, byte_start: segment.byte_start - 1 } : segment));
  const truncated = segments.slice(0, -1);
  assert.equal(partitionStats(gapped, NON_ASCII_SPEC.length).is_total_partition, false);
  assert.equal(partitionStats(overlapped, NON_ASCII_SPEC.length).is_total_partition, false);
  assert.equal(partitionStats(truncated, NON_ASCII_SPEC.length).is_total_partition, false);
});

test('C008 invariant: a byte length is not the length the offsets index into, and is not accepted as a total partition', () => {
  const { segments } = segmentSpecification(NON_ASCII_SPEC);
  const byteLength = Buffer.byteLength(NON_ASCII_SPEC, 'utf8');

  assert.notEqual(byteLength, NON_ASCII_SPEC.length, 'the fixture must separate the two units');
  assert.equal(partitionStats(segments, byteLength).is_total_partition, false);
  assert.equal(partitionStats(segments, NON_ASCII_SPEC.length).is_total_partition, true);
});
