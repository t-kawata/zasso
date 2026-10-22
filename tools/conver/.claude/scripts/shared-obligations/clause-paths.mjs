// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
/**
 * The contract-registry clause path each JUDGE kind reads.
 *
 * A judgment field is not a top-level registry key: the clause lives under
 * `clauses`. Resolving the path is what makes the basis resolvable.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const CLAUSE_PATH_BY_KIND = Object.freeze({
  ENTAILMENT: Object.freeze(['preconditions', 'postconditions']),
  TRANSLATION: Object.freeze(['input', 'output']),
  INVARIANT: Object.freeze(['invariants']),
  ERRORS: Object.freeze(['errors']),
  TESTS: Object.freeze(['tests']),
});

/** Flatten one clause value into strings for quote comparison. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
function clauseStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(clauseStrings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(clauseStrings);
  return [];
}

/** The clause path and values for a JUDGE kind, or null when the path is unknown. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function resolveClauseValues(contract, kind) {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const normalizedKind = String(kind ?? '').toUpperCase();
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const path = CLAUSE_PATH_BY_KIND[normalizedKind];
  if (path === undefined || contract === null || typeof contract !== 'object') return null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const clauses = contract.clauses;
  if (clauses === null || typeof clauses !== 'object') return null;
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const values = [];
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  let present = false;
  for (const key of path) {
    if (!Object.prototype.hasOwnProperty.call(clauses, key)) continue;
    present = true;
    values.push(...clauseStrings(clauses[key]));
  }
  if (!present || values.length === 0) return null;
  return { path: [...path], values };
}
