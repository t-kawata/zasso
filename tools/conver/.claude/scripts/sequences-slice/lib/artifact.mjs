/**
 * The gate that decides whether a document is a sequences artifact at all.
 *
 * The calibration reports a smaller world as a complete one if it runs on a truncated or
 * half-written artifact, and the gate cannot tell afterwards that it did. So every
 * rejection names the source and the field, and the caller turns a rejection into exit 2
 * with nothing written.
 *
 * The parser takes text rather than a path so that this module performs no I/O: the one
 * command that reads files is calibrate.mjs, which makes the filesystem surface of the
 * whole slice a single function to audit.
 */

/** The arrays a sequences artifact must carry for the join to be computable. */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export const REQUIRED_ARRAY_FIELDS = Object.freeze(['sequences', 'steps', 'operations']);

/**
 * Parse a sequences artifact, naming the source in every rejection.
 *
 * @param {string} text - the document as read
 * @param {string} sourcePath - the path the text came from, used only to name it
 * @returns {{ schema_version: number, sequences: unknown[], steps: unknown[], operations: unknown[] }}
 * @throws {Error} naming the source when the text is not a sequences artifact
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function parseSequencesArtifact(text, sourcePath) {
  if (typeof text !== 'string') {
    throw new Error(`${sourcePath}: the sequences artifact was not read as text`);
  }

  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new Error(`${sourcePath}: it does not parse as JSON (${error.message})`);
  }

  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`${sourcePath}: it is not a JSON object`);
  }
  if (typeof document.schema_version !== 'number') {
    throw new Error(`${sourcePath}: schema_version must be a number`);
  }
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(document[field])) {
      throw new Error(`${sourcePath}: ${field} must be an array`);
    }
  }
  return document;
}
