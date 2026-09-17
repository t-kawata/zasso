// [::TICKET::] PX-175 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`.
/**
 * Line-oriented Markdown helpers: code-fence state and byte-offset tables.
 *
 * These helpers keep heading parsing (headings.mjs) and segmentation
 * (segmentation.mjs) free of duplicated line bookkeeping.
 */

/** Return the fence character ("`" or "~") when the line opens/closes a fence. */
export function fenceDelimiterChar(line) {
  const trimmed = line.trimStart();
  const match = trimmed.match(/^(`{3,}|~{3,})/);
  return match ? match[1][0] : null;
}

/**
 * Classify every line as inside or outside a fenced code block.
 *
 * @param {string[]} lines - source text split on "\n"
 * @returns {Array<{ line: number, inFence: boolean, fenceChar: string|null }>}
 *   inFence is true only for content lines between the opening and closing
 *   fence delimiters; fence delimiter lines themselves report inFence false.
 */
export function scanFenceStates(lines) {
  const states = [];
  let activeChar = null;
  for (let i = 0; i < lines.length; i++) {
    const delimiter = fenceDelimiterChar(lines[i]);
    if (activeChar === null && delimiter !== null) {
      activeChar = delimiter;
      states.push({ line: i, inFence: false, fenceChar: delimiter });
      continue;
    }
    if (activeChar !== null && delimiter === activeChar) {
      activeChar = null;
      states.push({ line: i, inFence: false, fenceChar: null });
      continue;
    }
    states.push({ line: i, inFence: activeChar !== null, fenceChar: activeChar });
  }
  return states;
}

/**
 * The string offset at which each line starts.
 *
 * This counted UTF-8 bytes once, and every caller slices the *string* with the result.
 * The two agree while the text is ASCII and part company at the first character outside
 * it: the em dash in a title is three bytes and one character, and a document carrying
 * fourteen thousand of them — a specification with the analysis's own prose inside it —
 * drifts nineteen thousand bytes, far enough that a heading's recorded start lands in
 * the middle of an earlier line. A section's body then began mid-sentence, and the
 * directory it named came out as `src/`.
 *
 * The fields these offsets fill are still called `byte_start` and `byte_end` throughout
 * the tree. That name predates this fix and is now inaccurate: they hold string offsets,
 * because a string offset is what every reader needs. Renaming them touches every
 * producer, every consumer and every frozen record, so it belongs to a ticket of its own
 * rather than to this one.
 *
 * @param {string} sourceText - normalized text
 * @returns {number[]} offsets[i] is the offset of line i (0-based) into the string
 */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
export function lineStartOffsets(sourceText) {
  const offsets = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === '\n') offsets.push(index + 1);
  }
  return offsets;
}

