// [::TICKET::] PX-200 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-200 --for-spec --no-implementation-order`.
// PX-200 @verifies C002
/**
 * Settle the dependency review candidates of a decisions payload.
 *
 * The workflow requires the AI to answer every observation the review reports before a
 * manifest may be published, and to answer it in this session: asking a human now is
 * forbidden. Test fixtures need the same treatment, so this helper performs the
 * mechanical part - it derives the candidates from the payload, keeps the relations
 * that are genuinely declared, and hands the rest to the later per-directory grill -
 * while each test keeps its own assertions.
 */
import { buildDependencyReviewForDecisions } from '../../../.claude/scripts/workspacify-tree/lib/dependency-review.mjs';

/** Decide a candidate the way the workflow does: keep what is real, defer what is open. */
function decideCandidate(candidate) {
  if (candidate.kind === 'forbidden_edge_alternative') {
    return {
      decision: 'residual',
      rationale: 'the forbidden pair is not declared as an edge, so there is nothing to remove yet',
      alternatives: ['declare the allowed route through a port', 'keep the pair forbidden as it stands'],
      why_unresolved: 'choosing the route changes the boundary set and belongs to the canonical per-directory grill',
    };
  }
  return {
    decision: 'keep',
    rationale: `the declared relation ${candidate.edge_ref ?? candidate.packages.join('/')} carries the contract this workspace is built on`,
    alternatives: ['replace the relation with a port', 'merge the two packages into one'],
  };
}

/**
 * Answer every review candidate of the decisions payload.
 *
 * @param {object} input - { decisions, ownershipEntries }
 *   ownershipEntries defaults to the object entries the payload itself declares, which
 *   is the whole table for a fixture whose material is objects only. A fixture with
 *   claims or other categories passes the table it published.
 */
export function settleDependencyReviews({ decisions, ownershipEntries }) {
  const entries = ownershipEntries ?? (decisions.ownership ?? []).map((entry) => ({
    inventory_ref: entry.objectId,
    canonical_name: entry.objectId,
    category: 'object',
    owner_package: entry.packageId,
  }));
  return answerCandidates(decisions, entries);
}

function answerCandidates(decisions, ownershipEntries) {
  const review = buildDependencyReviewForDecisions(decisions, ownershipEntries);
  const settled = new Set((decisions.dependency_reviews ?? []).map((entry) => entry.candidate_id));
  const answers = [...(decisions.dependency_reviews ?? [])];
  for (const candidate of review.candidates) {
    if (settled.has(candidate.id)) {
      continue;
    }
    answers.push({ candidate_id: candidate.id, ...decideCandidate(candidate) });
  }
  return { ...decisions, dependency_reviews: answers };
}
