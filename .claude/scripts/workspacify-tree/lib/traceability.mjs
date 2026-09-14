// [::TICKET::] PX-176 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-176 --for-spec --no-implementation-order`.
/**
 * Source traceability helpers (§8.3).
 *
 * Every candidate must keep at least one source_ref back to the specification.
 * These helpers attach extra refs after an alias merge and verify the invariant
 * that no candidate is left without provenance.
 */

/**
 * Return a copy of the candidate with additional source refs appended.
 *
 * @param {object} candidate - candidate object
 * @param {Array<object>} refs - source refs to append
 * @returns {object} new candidate with merged source_refs
 */
export function attachSourceRefs(candidate, refs) {
  return { ...candidate, source_refs: [...candidate.source_refs, ...refs] };
}

/**
 * Verify that every candidate carries at least one source ref.
 *
 * @param {Array<object>} candidates - candidate objects
 * @returns {{ ok: boolean, missing: Array<string> }} missing holds candidate ids
 */
export function assertSourceTraceability(candidates) {
  const missing = candidates.filter((candidate) => !candidate.source_refs || candidate.source_refs.length === 0).map((candidate) => candidate.id);
  return { ok: missing.length === 0, missing };
}
