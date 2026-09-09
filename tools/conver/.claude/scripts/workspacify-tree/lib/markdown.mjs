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
 * Byte offset at which each line starts within the UTF-8 source text.
 *
 * @param {string} sourceText - normalized text
 * @returns {number[]} offsets[i] is the byte offset of line i (0-based)
 */
export function lineByteOffsets(sourceText) {
  const bytes = Buffer.from(sourceText, 'utf8');
  const offsets = [0];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a) {
      offsets.push(i + 1);
    }
  }
  return offsets;
}
