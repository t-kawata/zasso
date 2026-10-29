'use strict';

/**
 * markdown-headings.js — fence-aware Markdown heading extraction
 *
 * RFC.md carries fenced examples that may contain heading-like lines. A line
 * inside a fence is content, not a heading. The four graphify readers and the
 * Step 0 writer share this module so the rule has one definition.
 *
 * A block opens on a trimmed line that starts with ``` or ~~~ and closes on the
 * next line that starts with the same marker family. An info string on the
 * opener is ignored for matching. An opener with no closer is reported; it is
 * also returned as a block to end-of-file so readers never mistake its content
 * for headings. The writer refuses an unclosed fence; the analyzer filters the
 * unclosed block to keep its existing ignore-unclosed behavior.
 */

/** Markdown heading line: one to six # characters, whitespace, text. */
const HEADING_PATTERN = /^(#{1,6})\s+(.+)/;

/** Fence marker families; a block closes only on the same family. */
const FENCE_MARKERS = Object.freeze(['```', '~~~']);

/** Return the fence marker family that opens this line, or null. */
// [::TICKET::] PX-335 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-335 --for-spec --no-implementation-order`.
function fenceMarkerOf(line) {
  const trimmed = line.trim();
  return FENCE_MARKERS.find((marker) => trimmed.startsWith(marker)) || null;
}

/**
 * Find fenced code blocks in source lines.
 *
 * @param {string[]} sourceLines — Markdown lines
 * @returns {{ blocks: Array<{start:number,end:number,marker:string,unclosed:boolean}>, unclosed: boolean }}
 *   Closed blocks plus, when present, one unclosed block to end-of-file.
 */
// [::TICKET::] PX-335 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-335 --for-spec --no-implementation-order`.
function findFencedBlocks(sourceLines) {
  if (!Array.isArray(sourceLines)) {
    throw new TypeError('sourceLines must be an array');
  }

  const blocks = [];
  let openMarker = null;
  let openIndex = -1;

  for (let index = 0; index < sourceLines.length; index += 1) {
    const marker = fenceMarkerOf(sourceLines[index]);
    if (marker === null) continue;

    if (openMarker === null) {
      openMarker = marker;
      openIndex = index;
      continue;
    }
    if (marker !== openMarker) continue;

    blocks.push({ start: openIndex, end: index, marker: openMarker, unclosed: false });
    openMarker = null;
    openIndex = -1;
  }

  if (openMarker !== null) {
    blocks.push({
      start: openIndex,
      end: sourceLines.length - 1,
      marker: openMarker,
      unclosed: true,
    });
  }

  return { blocks, unclosed: openMarker !== null };
}

/**
 * Whether a 0-based line index belongs to any fenced block.
 *
 * @param {Array<{start:number,end:number}>} blocks — Result of findFencedBlocks
 * @param {number} index — 0-based line index
 * @returns {boolean}
 */
// [::TICKET::] PX-335 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-335 --for-spec --no-implementation-order`.
function isFencedLine(blocks, index) {
  return blocks.some((block) => index >= block.start && index <= block.end);
}

/**
 * Extract headings outside fenced blocks, in source order.
 *
 * @param {string[]} sourceLines — Markdown lines
 * @param {Array<{start:number,end:number}>|null} [blocks] — Precomputed blocks
 * @returns {Array<{line:number,level:number,text:string}>} 1-based line numbers
 */
// [::TICKET::] PX-335 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-335 --for-spec --no-implementation-order`.
function extractHeadingsOutsideFences(sourceLines, blocks = null) {
  const fencedBlocks = blocks ?? findFencedBlocks(sourceLines).blocks;
  const headings = [];

  for (let index = 0; index < sourceLines.length; index += 1) {
    if (isFencedLine(fencedBlocks, index)) continue;
    const headingMatch = sourceLines[index].match(HEADING_PATTERN);
    if (!headingMatch) continue;
    headings.push({
      line: index + 1,
      level: headingMatch[1].length,
      text: headingMatch[2].trim(),
    });
  }

  return headings;
}

/**
 * Whether the source has an opening fence with no closing marker.
 *
 * @param {string[]} sourceLines — Markdown lines
 * @returns {boolean}
 */
// [::TICKET::] PX-335 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-335 --for-spec --no-implementation-order`.
function hasUnclosedFence(sourceLines) {
  return findFencedBlocks(sourceLines).unclosed;
}

module.exports = {
  HEADING_PATTERN,
  FENCE_MARKERS,
  findFencedBlocks,
  isFencedLine,
  extractHeadingsOutsideFences,
  hasUnclosedFence,
};
