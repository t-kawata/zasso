/**
 * The closed vocabularies the specification pins, read from the artifact.
 *
 * The artifact names each vocabulary, lists its members and gives the specification line
 * ranges each member was read from. Naming a status, a route, a socket method, a command
 * or an execution mode that is not a member is therefore decidable without reading the
 * specification at all, which is what lets the check run per package.
 *
 * The vocabularies are read by name rather than taken as whatever `pins.enumerations`
 * happens to hold: a check that accepted an artifact missing one of them would report
 * nothing about that axis and look clean while saying nothing.
 */

/** The five vocabularies the specification pins. A missing one is a refusal, not a skip. */
export const PINNED_VOCABULARY_NAMES = Object.freeze([
  'OperationStatus',
  'WebSocketMethod',
  'RestEndpoint',
  'CliCommand',
  'ExecutionMode',
]);

/**
 * One vocabulary, as a set of members plus the specification ranges they came from.
 *
 * @param {{ name: string, members: string[], ranges?: number[][], closedness?: string }} entry
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
function readVocabulary(entry) {
  return {
    name: entry.name,
    members: [...(entry.members ?? [])],
    memberSet: new Set(entry.members ?? []),
    ranges: (entry.ranges ?? []).map((range) => [...range]),
    closed: entry.closedness === 'closed',
  };
}

/**
 * Every pinned vocabulary, keyed by name.
 *
 * @param {{ pins?: { enumerations?: Array<object> } }} artifact
 * @returns {Map<string, { name: string, members: string[], memberSet: Set<string>, ranges: number[][], closed: boolean }>}
 * @throws {Error} naming a vocabulary the artifact does not pin
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function readPinnedVocabularies(artifact) {
  const byName = new Map((artifact?.pins?.enumerations ?? []).map((entry) => [entry.name, entry]));

  const missing = PINNED_VOCABULARY_NAMES.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`the artifact pins no ${missing.join(', ')} vocabulary, so that axis cannot be checked`);
  }

  return new Map(PINNED_VOCABULARY_NAMES.map((name) => [name, readVocabulary(byName.get(name))]));
}

/**
 * The names used on one axis, paired with where each was seen.
 *
 * The caller supplies the sightings so that the check stays a function of its inputs: the
 * artifact's own fields are one source, and a package RFC is another.
 *
 * @param {Array<{ axis: string, name: string, where: string }>} sightings
 * @param {string} axis
 * @returns {Array<{ name: string, where: string }>}
 */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function namesOnAxis(sightings, axis) {
  return sightings.filter((sighting) => sighting.axis === axis).map(({ name, where }) => ({ name, where }));
}
