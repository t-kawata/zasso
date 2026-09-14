// [::TICKET::] PX-175 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`.
/**
 * ATX heading parsing and outline tree construction (§7.1).
 *
 * buildHeadingTree returns the flat outline of every non-empty ATX heading in
 * document order; parent/child links are resolved from heading levels and each
 * node records a 1-based line range plus, when the source text is supplied, a
 * 0-based byte range. Empty headings and level jumps are NOT part of the tree:
 * they are reported as warnings by collectHeadingWarnings so the caller can
 * decide whether to fail (the design keeps this configurable).
 */
import { scanFenceStates, lineByteOffsets } from './markdown.mjs';

/**
 * Parse a single line as an ATX heading.
 *
 * @param {string} line - a source line
 * @returns {{ level: number, text: string }|null}
 *   null when the line is not an ATX heading; text is "" for an empty heading
 *   such as "##".
 */
export function parseAtxHeading(line) {
  const match = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/);
  if (!match) {
    return null;
  }
  let text = match[2] ?? '';
  // Remove a trailing closing sequence of "#" that is preceded by whitespace.
  text = text.replace(/[ \t]+#+[ \t]*$/, '').trimEnd();
  return { level: match[1].length, text };
}

/**
 * Build the heading outline.
 *
 * @param {string[]} lines - source text split on "\n"
 * @param {Array|undefined} fenceStates - output of scanFenceStates (computed when omitted)
 * @param {{ sourceText?: string }} [options] - supply sourceText to fill byte ranges
 * @returns {Array<object>} heading nodes, each with id/level/text/line range/
 *   byte range/parent_id/children
 */
export function buildHeadingTree(lines, fenceStates, { sourceText } = {}) {
  const states = fenceStates ?? scanFenceStates(lines);
  const offsets = sourceText !== undefined ? lineByteOffsets(sourceText) : null;
  const byteLength = sourceText !== undefined ? Buffer.byteLength(sourceText, 'utf8') : null;

  const raw = [];
  for (let i = 0; i < lines.length; i++) {
    if (states[i] && states[i].inFence) {
      continue;
    }
    const parsed = parseAtxHeading(lines[i]);
    if (!parsed || parsed.text === '') {
      continue;
    }
    const lineEndOffset = offsets !== null && i + 1 < offsets.length ? offsets[i + 1] - 1 : byteLength;
    raw.push({
      level: parsed.level,
      text: parsed.text,
      line_start: i + 1,
      line_end: i + 1,
      byte_start: offsets !== null ? offsets[i] : null,
      byte_end: offsets !== null ? lineEndOffset : null,
    });
  }

  const nodes = raw.map((entry, index) => ({
    id: `h-${String(index + 1).padStart(6, '0')}`,
    level: entry.level,
    text: entry.text,
    line_start: entry.line_start,
    line_end: entry.line_end,
    byte_start: entry.byte_start,
    byte_end: entry.byte_end,
    parent_id: null,
    children: [],
  }));

  const stack = [];
  for (const node of nodes) {
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length > 0) {
      node.parent_id = stack[stack.length - 1].id;
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return nodes;
}

/**
 * Collect structural warning candidates: empty ATX headings and level jumps.
 *
 * @param {string[]} lines - source text split on "\n"
 * @param {Array|undefined} fenceStates - output of scanFenceStates (computed when omitted)
 * @returns {Array<{ kind: 'empty-heading'|'level-jump', line: number, level: number, detail?: string }>}
 */
export function collectHeadingWarnings(lines, fenceStates) {
  const states = fenceStates ?? scanFenceStates(lines);
  const warnings = [];
  const nodes = buildHeadingTree(lines, states);
  const nodeByLine = new Map(nodes.map((node) => [node.line_start, node]));

  for (let i = 0; i < lines.length; i++) {
    if (states[i] && states[i].inFence) {
      continue;
    }
    const parsed = parseAtxHeading(lines[i]);
    if (parsed === null) {
      continue;
    }
    if (parsed.text === '') {
      warnings.push({ kind: 'empty-heading', line: i + 1, level: parsed.level });
      continue;
    }
    const node = nodeByLine.get(i + 1);
    if (!node) {
      continue;
    }
    const parent = node.parent_id === null ? null : nodes.find((candidate) => candidate.id === node.parent_id);
    if (parent && node.level > parent.level + 1) {
      warnings.push({
        kind: 'level-jump',
        line: node.line_start,
        level: node.level,
        detail: `level ${node.level} jumps from parent level ${parent.level}`,
      });
    }
  }
  return warnings;
}
