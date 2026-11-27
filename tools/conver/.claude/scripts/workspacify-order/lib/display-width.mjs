// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
// display-width.mjs — the terminal width of a grapheme, with no pipeline imports.
//
// The renderer and the conver header both need this measurement, and neither should pull
// the implementation-order machinery into a bundle to get it. This module is the one
// spelling of the width rule, imported by levels.mjs and render.mjs.

/**
 * The width of one grapheme cluster.
 *
 * Width is a property of the terminal, not of the code-point count: a CJK ideograph and an
 * emoji occupy two columns, a combining mark or a joiner occupies none, and a ZWJ sequence
 * is one glyph even though it is several code points. The segmenter supplies the clusters;
 * the ranges below supply the East Asian Wide and emoji widths.
 */
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
/** Combining marks and format characters draw no column of their own. */
const ZERO_WIDTH_CHARACTER = /^[\p{Mn}\p{Me}\p{Cf}]$/u;
/** The ranges whose code points occupy two terminal columns: East Asian Wide/Fullwidth. */
const WIDE_RANGES = Object.freeze([
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x16fe0, 0x16fff],
  [0x1b000, 0x1b2ff],
  [0x1f200, 0x1f2ff],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
  // Emoji-presentation dingbats below the CJK block; U+274C is the failed-verdict glyph.
  [0x2705, 0x2705],
  [0x2714, 0x2714],
  [0x2716, 0x2716],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
]);

/** The width of one code point: two for a wide range, zero for a combining mark, one otherwise. */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function codePointWidth(codePoint) {
  if (ZERO_WIDTH_CHARACTER.test(String.fromCodePoint(codePoint))) return 0;
  return WIDE_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end) ? 2 : 1;
}

/** The width of one grapheme cluster, including emoji sequences and combining marks. */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function graphemeWidth(grapheme) {
  if (ZERO_WIDTH_CHARACTER.test(grapheme)) return 0;
  // A variation selector or a zero-width joiner presents the cluster as one emoji glyph.
  if (grapheme.includes('‍') || grapheme.includes('️')) return 2;
  let width = 0;
  for (const character of grapheme) width += codePointWidth(character.codePointAt(0));
  return width;
}

/** The number of terminal columns a string occupies. */
export function displayWidth(text) {
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(text)) width += graphemeWidth(segment);
  return width;
}
