// [::TICKET::] PX-175, PX-192 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-175|PX-192) --for-spec --no-implementation-order`.
/**
 * Chapter segmentation and reconstruction verification (§7.2).
 *
 * A specification is split into segments at every heading whose level equals
 * segmentLevel (default 2). Content before the first segment heading is kept
 * as an implicit preamble segment so nothing is ever lost. Each segment records
 * a text range and the hash of the text that range names; verifyReconstruction
 * proves the invariant that the segments tile the normalized input exactly and
 * that rebuilding them reproduces the recorded source hash.
 *
 * The offsets these records carry are string offsets and not byte offsets — see
 * `lineStartOffsets` in markdown.mjs for why — so every slice taken with them is
 * a string slice, and every hash taken over one fingerprints the text it names.
 */
import { TextDecoder } from 'node:util';

import { sha256Hex } from './hash.mjs';
import { lineStartOffsets } from './markdown.mjs';
import { WorkSpacifyTreeError } from './errors.mjs';

/** Default segmentation anchor level chosen by the design (## chapters). */
export const DEFAULT_SEGMENT_LEVEL = 2;

/** The normalised input is UTF-8 by construction, so a decoding failure is a defect worth naming. */
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

/**
 * Split normalized text into segments at the segment-level headings.
 *
 * @param {{ sourceText: string, headings: Array<object> }} input
 * @param {{ segmentLevel?: number }} [options]
 * @returns {{ segments: Array<object>, warnings: Array<object> }}
 * @throws {WorkSpacifyTreeError} gateId "G1.3" when no ATX heading exists
 */
export function segmentAtHeadings({ sourceText, headings }, { segmentLevel = DEFAULT_SEGMENT_LEVEL } = {}) {
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
  if (!headings || headings.length === 0) {
    throw new WorkSpacifyTreeError('cannot segment: no ATX heading found', { gateId: 'G1.3' });
  }
  const totalLength = sourceText.length;
  const offsets = lineStartOffsets(sourceText);
  const anchors = headings
    .filter((heading) => heading.level === segmentLevel && heading.byte_start !== null)
    .sort((a, b) => a.byte_start - b.byte_start);

  const segments = [];
  let sequence = 0;
  const nextId = () => `s-${String(++sequence).padStart(6, '0')}`;

  if (anchors.length === 0) {
    // The whole document is one segment (e.g. a document with no level-2 chapter).
    const first = headings[0];
    segments.push(
      buildSegment(
        {
          id: nextId(),
          heading_id: first.id,
          title: first.text,
          level: first.level,
          byte_start: 0,
          byte_end: totalLength,
          subheading_ids: first.children.map((child) => child.id),
        },
        sourceText,
        offsets
      )
    );
    return { segments, warnings: [] };
  }

  const firstAnchor = anchors[0];
  if (firstAnchor.byte_start > 0) {
    const preambleHeadings = headings.filter((heading) => heading.byte_start < firstAnchor.byte_start);
    segments.push(
      buildSegment(
        {
          id: nextId(),
          heading_id: null,
          title: '',
          level: 0,
          byte_start: 0,
          byte_end: firstAnchor.byte_start,
          subheading_ids: preambleHeadings.map((heading) => heading.id),
        },
        sourceText,
        offsets
      )
    );
  }

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const nextAnchor = anchors[i + 1];
    segments.push(
      buildSegment(
        {
          id: nextId(),
          heading_id: anchor.id,
          title: anchor.text,
          level: segmentLevel,
          byte_start: anchor.byte_start,
          byte_end: nextAnchor ? nextAnchor.byte_start : totalLength,
          subheading_ids: anchor.children.map((child) => child.id),
        },
        sourceText,
        offsets
      )
    );
  }
  return { segments, warnings: [] };
}

/**
 * Summarise whether the segments are a total partition of the normalised text.
 *
 * Stage 2 proves zero-omission transfer by requiring every segment to be
 * referenced by at least one seed, which is only meaningful when the segments
 * cover the specification exactly once.
 *
 * @param {Array<object>} segments - segments in document order
 * @param {number} totalLength - length of the normalised specification, in the same
 *   unit the segments' offsets use; a byte length is not that length, because the
 *   offsets are string offsets and the two agree only while the text is ASCII
 * @returns {{ segment_count: number, covered_bytes: number, first_byte: number, last_byte: number, is_total_partition: boolean }}
 */
export function partitionStats(segments, totalLength) {
  const ordered = [...(segments ?? [])].sort((a, b) => a.byte_start - b.byte_start);
  const coveredBytes = ordered.reduce((total, segment) => total + Math.max(0, segment.byte_end - segment.byte_start), 0);
  let isContiguous = ordered.length > 0 && ordered[0].byte_start === 0;
  for (let index = 1; index < ordered.length && isContiguous; index += 1) {
    isContiguous = ordered[index].byte_start === ordered[index - 1].byte_end;
  }
  const lastByte = ordered.length > 0 ? ordered[ordered.length - 1].byte_end : 0;
  const isTotalPartition = isContiguous && coveredBytes === totalLength && lastByte === totalLength;
  return {
    segment_count: ordered.length,
    covered_bytes: coveredBytes,
    first_byte: ordered.length > 0 ? ordered[0].byte_start : 0,
    last_byte: lastByte,
    is_total_partition: isTotalPartition,
  };
}

/**
 * Rebuild the input from the segments and compare against the source.
 *
 * The segments name ranges of the normalised text, so the reconstruction is a text
 * reconstruction: each range is sliced out of the decoded text, and the slices are
 * joined and re-encoded. Slicing the byte buffer with a string offset instead would
 * reproduce the input whatever the offsets meant, which is why this gate proves the
 * document as a whole and never one segment — a per-segment guarantee can only come
 * from each segment's own recorded hash.
 *
 * @param {{ sourceBytes: Uint8Array, sourceHash: string, segments: Array<object> }} input
 * @returns {{ status: 'PASS'|'FAIL', reconstructedHash: string, exactMatch: boolean, hashMatch: boolean, reasons: string[] }}
 */
export function verifyReconstruction({ sourceBytes, sourceHash, segments }) {
  const ordered = [...segments].sort((a, b) => a.byte_start - b.byte_start);
  const reasons = [];
  const sourceText = decodeUtf8(sourceBytes, reasons);
  const totalLength = sourceText.length;
  const parts = [];
  let cursor = 0;

  for (const segment of ordered) {
    if (segment.byte_start !== cursor) {
      reasons.push(`segment ${segment.id} leaves a gap or overlaps at offset ${cursor}`);
    }
    if (segment.byte_end <= segment.byte_start) {
      reasons.push(`segment ${segment.id} has a non-positive range`);
    }
    if (segment.byte_end > totalLength) {
      reasons.push(`segment ${segment.id} extends past the end of the input`);
    }
    const safeEnd = Math.min(Math.max(segment.byte_end, segment.byte_start), totalLength);
    parts.push(sourceText.slice(segment.byte_start, safeEnd));
    cursor = Math.max(cursor, safeEnd);
  }
  if (cursor !== totalLength) {
    reasons.push('segments do not cover the whole input');
  }

  const reconstructed = Buffer.from(parts.join(''), 'utf8');
  const exactMatch = reasons.length === 0 && reconstructed.equals(Buffer.from(sourceBytes));
  const reconstructedHash = sha256Hex(reconstructed);
  const hashMatch = reconstructedHash === sourceHash;
  return {
    status: exactMatch && hashMatch ? 'PASS' : 'FAIL',
    reconstructedHash,
    exactMatch,
    hashMatch,
    reasons,
  };
}

// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
function buildSegment(segmentSpec, sourceText, offsets) {
  const { id, heading_id, title, level, byte_start, byte_end, subheading_ids } = segmentSpec;
  const segmentText = sourceText.slice(byte_start, byte_end);
  const contentStartLine = lineIndexOfOffset(offsets, byte_start) + 1;
  const contentEndLine = byte_end > byte_start ? lineIndexOfOffset(offsets, byte_end - 1) + 1 : contentStartLine;
  return {
    id,
    heading_id,
    title,
    level,
    line_start: contentStartLine,
    line_end: contentEndLine,
    byte_start,
    byte_end,
    sha256: sha256Hex(Buffer.from(segmentText, 'utf8')),
    subheading_ids: [...subheading_ids],
  };
}

/** Decode normalised bytes as UTF-8, recording rather than hiding a decoding failure. */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
function decodeUtf8(sourceBytes, reasons) {
  try {
    return UTF8_DECODER.decode(sourceBytes);
  } catch {
    reasons.push('the input is not valid UTF-8');
    return '';
  }
}

/** Index of the line whose start offset is the greatest offset <= textOffset. */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
function lineIndexOfOffset(offsets, textOffset) {
  let low = 0;
  let high = offsets.length - 1;
  let answer = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] <= textOffset) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return answer;
}
