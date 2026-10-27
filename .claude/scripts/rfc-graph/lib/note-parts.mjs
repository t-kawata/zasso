// PX-322 @verifies C003 C004
// One edge accepts one note string of at most 240 characters. Several projections may
// want to write their part of it, so composition is a pure operation both projections
// use: a part is appended, the caller chooses which old parts it replaces, and the
// limit is enforced once rather than in each projection.
export const NOTE_PART_SEPARATOR = '|';

/**
 * Compose one note part into an existing note.
 *
 * @param {string|null|undefined} existing
 * @param {string} part
 * @param {{ limit: number, replacePrefixes?: string[] }} options
 * @returns {string}
 */
// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function composeNote(existing, part, { limit, replacePrefixes = [] } = {}) {
  const parts = String(existing ?? '')
    .split(NOTE_PART_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !replacePrefixes.some((prefix) => entry.startsWith(prefix)));
  if (!parts.includes(part)) parts.push(part);
  const note = parts.join(NOTE_PART_SEPARATOR);
  if (note.length > limit) {
    const error = new Error(`STEP_NOTE_TOO_LONG: the edge note is ${note.length} characters and the limit is ${limit}`);
    error.code = 'STEP_NOTE_TOO_LONG';
    throw error;
  }
  return note;
}
