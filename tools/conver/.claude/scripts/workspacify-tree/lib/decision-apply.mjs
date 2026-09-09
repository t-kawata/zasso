// [::TICKET::] PX-179 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-179 --for-spec --no-implementation-order`.
/**
 * Apply AI design decisions to the parsed inventory.
 *
 * The AI writes ownership and approvals as structured decisions. This module
 * maps those decisions onto candidates (setting the owning package and
 * confirming REVIEW_REQUIRED items) so the gate pipeline evaluates the actual
 * design rather than the raw harvest.
 */

/**
 * Set the owner field on candidates from ownership decisions.
 *
 * @param {Array<object>} candidates - harvested candidates
 * @param {string} ownerField - "owner_package" or "primary_owner"
 * @param {Array<{ objectId: string, packageId: string }>} ownership - decisions
 * @returns {Array<object>} candidates with owners applied (new objects)
 */
export function applyOwnership(candidates, ownerField, ownership) {
  const byId = new Map();
  const byName = new Map();
  for (const candidate of candidates) {
    byId.set(candidate.id, candidate);
    byName.set(candidate.canonical_name, candidate);
  }
  const updated = new Map();
  for (const entry of ownership ?? []) {
    const candidate = byId.get(entry.objectId) ?? byName.get(entry.objectId);
    if (candidate) {
      updated.set(candidate.id, { ...candidate, [ownerField]: entry.packageId });
    }
  }
  return candidates.map((candidate) => updated.get(candidate.id) ?? candidate);
}

/**
 * Confirm REVIEW_REQUIRED candidates that carry an approval decision.
 *
 * @param {Array<object>} candidates - candidates with normalization_status
 * @param {Array<{ decisionId: string }>} approvals - approved decision ids
 * @returns {Array<object>} candidates with confirmed status where approved
 */
export function applyApprovals(candidates, approvals) {
  const approvedIds = new Set((approvals ?? []).map((approval) => approval.decisionId));
  return candidates.map((candidate) => {
    if (approvedIds.has(candidate.id) || approvedIds.has(candidate.canonical_name)) {
      return { ...candidate, normalization_status: 'CONFIRMED' };
    }
    return candidate;
  });
}
