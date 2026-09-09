// [::TICKET::] PX-175 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`.
/**
 * Chapter segmentation and reconstruction verification (§7.2).
 *
 * A specification is split into segments at every heading whose level equals
 * segmentLevel (default 2). Content before the first segment heading is kept
 * as an implicit preamble segment so nothing is ever lost. Each segment records
 * a byte range; verifyReconstruction proves the invariant that the segments
 * tile the normalized input exactly and that rebuilding them reproduces the
 * recorded source hash.
 */
import { sha256Hex } from './hash.mjs';
import { lineByteOffsets } from './markdown.mjs';
import { WorkSpacifyTreeError } from './errors.mjs';

/** Default segmentation anchor level chosen by the design (## chapters). */
export const DEFAULT_SEGMENT_LEVEL = 2;

/**
 * Split normalized text into segments at the segment-level headings.
 *
 * @param {{ sourceText: string, headings: Array<object> }} input
 * @param {{ segmentLevel?: number }} [options]
 * @returns {{ segments: Array<object>, warnings: Array<object> }}
 * @throws {WorkSpacifyTreeError} gateId "G1.3" when no ATX heading exists
 */
export function segmentAtHeadings({ sourceText, headings }, { segmentLevel = DEFAULT_SEGMENT_LEVEL } = {}) {
  if (!headings || headings.length === 0) {
    throw new WorkSpacifyTreeError('cannot segment: no ATX heading found', { gateId: 'G1.3' });
  }
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const totalBytes = sourceBytes.length;
  const offsets = lineByteOffsets(sourceText);
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
          byte_end: totalBytes,
          subheading_ids: first.children.map((child) => child.id),
        },
        sourceBytes,
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
        sourceBytes,
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
          byte_end: nextAnchor ? nextAnchor.byte_start : totalBytes,
          subheading_ids: anchor.children.map((child) => child.id),
        },
        sourceBytes,
        offsets
      )
    );
  }
  return { segments, warnings: [] };
}

/**
 * Rebuild the input bytes from the segments and compare against the source.
 *
 * @param {{ sourceBytes: Uint8Array, sourceHash: string, segments: Array<object> }} input
 * @returns {{ status: 'PASS'|'FAIL', reconstructedHash: string, exactMatch: boolean, hashMatch: boolean, reasons: string[] }}
 */
export function verifyReconstruction({ sourceBytes, sourceHash, segments }) {
  const ordered = [...segments].sort((a, b) => a.byte_start - b.byte_start);
  const reasons = [];
  const totalBytes = sourceBytes.length;
  const parts = [];
  let cursor = 0;

  for (const segment of ordered) {
    if (segment.byte_start !== cursor) {
      reasons.push(`segment ${segment.id} leaves a gap or overlaps at byte ${cursor}`);
    }
    if (segment.byte_end <= segment.byte_start) {
      reasons.push(`segment ${segment.id} has a non-positive byte range`);
    }
    if (segment.byte_end > totalBytes) {
      reasons.push(`segment ${segment.id} extends past the end of the input`);
    }
    const safeEnd = Math.min(Math.max(segment.byte_end, segment.byte_start), totalBytes);
    parts.push(sourceBytes.subarray(segment.byte_start, safeEnd));
    cursor = Math.max(cursor, safeEnd);
  }
  if (cursor !== totalBytes) {
    reasons.push('segments do not cover the whole input');
  }

  const reconstructed = Buffer.concat(parts.map((part) => Buffer.from(part)));
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

function buildSegment(segmentSpec, sourceBytes, offsets) {
  const { id, heading_id, title, level, byte_start, byte_end, subheading_ids } = segmentSpec;
  const sliceBytes = sourceBytes.subarray(byte_start, byte_end);
  const contentStartLine = lineIndexOfByte(offsets, byte_start) + 1;
  const contentEndLine = byte_end > byte_start ? lineIndexOfByte(offsets, byte_end - 1) + 1 : contentStartLine;
  return {
    id,
    heading_id,
    title,
    level,
    line_start: contentStartLine,
    line_end: contentEndLine,
    byte_start,
    byte_end,
    sha256: sha256Hex(sliceBytes),
    subheading_ids: [...subheading_ids],
  };
}

/** Index of the line whose start offset is the greatest offset <= bytePos. */
function lineIndexOfByte(offsets, bytePos) {
  let low = 0;
  let high = offsets.length - 1;
  let answer = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] <= bytePos) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return answer;
}
