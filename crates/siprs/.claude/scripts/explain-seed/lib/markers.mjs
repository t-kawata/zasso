/**
 * The two tokens the frame and the gate are built on.
 *
 * A marker is an instruction nobody has answered; a placeholder is a place a person
 * writes. Both are recognised by one predicate each, and every consumer calls that
 * predicate rather than matching the literal itself, because a counter and a gate that
 * disagreed about what a marker is would allow a document to pass while it still holds an
 * instruction nobody wrote.
 *
 * Detection is anchored to the start of a line: an instruction is a line whose first token
 * is the marker, and nothing else is. A sentence that mentions either token is not a token,
 * which matters because the frame's own instructions talk about what to write and the AI
 * may quote them — prose must not be able to satisfy or defeat the gate. Nothing may
 * precede the marker but indentation, so a labelled line puts its answer on the line below
 * rather than turning a bulleted sentence into an instruction.
 */
export const MUST_FILL_MARKER = '[::MUST-FILL::]';

export const HUMAN_PLACEHOLDER = '<!-- 人間の判断 -->';

/** The literal, escaped for use inside a character-class-free regular expression. */
const MARKER_LITERAL = MUST_FILL_MARKER.replace(/[[\]]/g, '\\$&');

/** A line whose first token, after indentation, is the marker. */
const MARKER_LINE = new RegExp(`^[ \\t]*${MARKER_LITERAL}`);

/** The lines of a document, in order. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function linesOf(documentText) {
  return String(documentText).split('\n');
}

/**
 * Where the marker sits on this line.
 *
 * @param {string} line - one line of a document
 * @returns {number} the character offset of the marker, or -1 when the line is not one
 */
export function markerOffsetInLine(line) {
  const matched = String(line).match(MARKER_LINE);
  if (matched === null) return -1;
  return matched[0].length - MUST_FILL_MARKER.length;
}

/**
 * Every unanswered instruction in a document, with the line it sits on.
 *
 * @param {string} documentText
 * @returns {Array<{ line: number, text: string, offset: number }>}
 */
export function findOpenMarkers(documentText) {
  return linesOf(documentText)
    .map((line, index) => ({ line: index + 1, text: line.trim(), offset: markerOffsetInLine(line) }))
    .filter((found) => found.offset >= 0);
}

/**
 * How many instructions a document still holds.
 *
 * @param {string} documentText
 * @returns {number}
 */
export function countOpenMarkers(documentText) {
  return findOpenMarkers(documentText).length;
}

/**
 * Whether this line is a placeholder and nothing else.
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isPlaceholderLine(line) {
  return String(line).trim() === HUMAN_PLACEHOLDER;
}

/**
 * Every place a person is asked to write, with the line it sits on.
 *
 * @param {string} documentText
 * @returns {Array<{ line: number }>}
 */
export function findHumanPlaceholders(documentText) {
  return linesOf(documentText)
    .map((line, index) => ({ line: index + 1, isPlaceholder: isPlaceholderLine(line) }))
    .filter((found) => found.isPlaceholder)
    .map((found) => ({ line: found.line }));
}

/**
 * How many places a document offers a person to write.
 *
 * @param {string} documentText
 * @returns {number}
 */
export function countPlaceholdersIn(documentText) {
  return findHumanPlaceholders(documentText).length;
}
