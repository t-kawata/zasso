// [::TICKET::] PX-176 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-176 --for-spec --no-implementation-order`.
/**
 * AI-facing inventory summary.
 *
 * The report tells the AI operator how many candidates were harvested, which
 * still need review, and which are unresolved — so the AI can confirm or
 * reject candidates without re-reading the whole specification.
 */

/**
 * Build an inventory report from harvested candidates.
 *
 * @param {object} inventory - { objects, claims, terms, normalization_decisions, unresolved_candidates }
 * @returns {{ objects: Array<object>, claims: Array<object>, terms: Array<object>,
 *             normalization_decisions: Array<object>, unresolved_candidates: Array<object>, stats: object }}
 */
export function buildInventoryReport(inventory) {
  const objects = inventory.objects ?? [];
  const claims = inventory.claims ?? [];
  const terms = inventory.terms ?? [];
  const decisions = inventory.normalization_decisions ?? [];
  const unresolved = inventory.unresolved_candidates ?? [];
  const harvested = objects.length + claims.length + terms.length;
  const confirmed = [...objects, ...claims, ...terms].filter((candidate) => {
    const status = candidate.normalization_status ?? candidate.review_status;
    return status === 'CONFIRMED';
  }).length;
  const reviewRequired = [...objects, ...claims, ...terms].filter((candidate) => {
    const status = candidate.normalization_status ?? candidate.review_status;
    return status === 'REVIEW_REQUIRED';
  }).length;
  return {
    objects,
    claims,
    terms,
    normalization_decisions: decisions,
    unresolved_candidates: unresolved,
    stats: {
      harvested,
      confirmed,
      review_required: reviewRequired,
      unresolved: unresolved.length,
    },
  };
}
