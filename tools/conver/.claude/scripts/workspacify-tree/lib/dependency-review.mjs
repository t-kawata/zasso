// [::TICKET::] PX-200 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-200 --for-spec --no-implementation-order`.
// PX-200 @verifies C001 C002
/**
 * Dependency and boundary review.
 *
 * The DAG gate proves the graph is well formed, never that it is the right graph: an
 * edge that serializes two unrelated packages, a forbidden edge with a viable route,
 * two packages that cannot be separated, a provider everything depends on. The review
 * reports those as observations with evidence; it never edits the graph and never
 * decides. The AI records a decision per candidate, and the machine checks that the
 * published graph matches what was decided.
 */
import { LAYER_FORBIDDEN_TARGETS } from './workspace-model.mjs';

/** Every observation kind the review can report. */
export const REVIEW_KINDS = Object.freeze([
  'unnecessary_serialization',
  'forbidden_edge_alternative',
  'under_split_pair',
  'interface_instability',
]);

/** Every decision the AI may record for a candidate. */
export const REVIEW_DECISIONS = Object.freeze(['keep', 'replace_with_port', 'merge', 'split', 'residual']);

/** A provider consumed by more than this share of the other packages is worth a look. */
const INSTABILITY_CONSUMER_SHARE = 0.5;

/** Build the review candidates for a workspace. */
export function buildDependencyReview({ packages = [], normalEdges = [], forbiddenEdges = [], boundaries = [], ownershipEntries = [] }) {
  const observations = [
    ...detectUnnecessarySerialization({ normalEdges, ownershipEntries }),
    ...detectForbiddenAlternative({ packages, forbiddenEdges, normalEdges }),
    ...detectUnderSplitPair({ packages, normalEdges }),
    ...detectInterfaceInstability({ packages, normalEdges }),
  ];
  const ordered = observations.sort((left, right) => (left.order !== right.order ? left.order - right.order : REVIEW_KINDS.indexOf(left.kind) - REVIEW_KINDS.indexOf(right.kind)));
  const candidates = ordered.map((observation, index) => ({
    id: `review-${String(index + 1).padStart(6, '0')}`,
    kind: observation.kind,
    packages: observation.packages,
    edge_ref: observation.edge_ref,
    observation: observation.observation,
    evidence_refs: observation.evidence_refs,
  }));
  return { candidates, summary: summarizeKinds(candidates), boundaries };
}

/**
 * An edge that serializes two packages without the inventory showing what it carries.
 *
 * Ownership is exclusive, so no item can ever be held by both endpoints: the machine
 * cannot see from the inventory alone why one package must wait for the other. Every
 * such edge is therefore reported and the AI states why the dependency is real. An
 * edge into a package that owns nothing is a composition question, not a value
 * dependency, so it is not reported.
 */
function detectUnnecessarySerialization({ normalEdges, ownershipEntries }) {
  const materialByPackage = buildMaterialIndex(ownershipEntries);
  const ownsMaterial = (packageId) => (materialByPackage.get(packageId)?.size ?? 0) > 0;
  return normalEdges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => ownsMaterial(edge.from) && ownsMaterial(edge.to))
    .map(({ edge, index }) => ({
      kind: 'unnecessary_serialization',
      order: index,
      packages: [edge.from, edge.to],
      edge_ref: `${edge.from}->${edge.to}`,
      observation: `The edge ${edge.from} -> ${edge.to} serializes two packages that both own material, while nothing in the inventory shows what crosses it, so the dependency needs an explicit justification.`,
      evidence_refs: [`${edge.from}->${edge.to}`, ...(edge.reasonCode ? [`reason:${edge.reasonCode}`] : [])],
    }));
}

/** A forbidden pair that the allowed graph already routes around. */
function detectForbiddenAlternative({ packages, forbiddenEdges, normalEdges }) {
  const packageIds = packages.map((pkg) => pkg.id);
  const forbiddenPairs = new Map(forbiddenEdges.map((edge, index) => [`${edge.from}->${edge.to}`, { edge, index }]));
  const candidates = [];
  for (const [pair, { edge, index }] of forbiddenPairs) {
    const intermediates = packageIds.filter((id) => id !== edge.from && id !== edge.to);
    const viableRoute = intermediates.find((id) => reaches(normalEdges, edge.from, id) && reaches(normalEdges, id, edge.to));
    if (viableRoute || edge.alternative) {
      candidates.push({
        kind: 'forbidden_edge_alternative',
        order: normalEdges.length + index,
        packages: [edge.from, edge.to],
        edge_ref: pair,
        observation: `The forbidden edge ${pair} has a viable route${viableRoute ? ` through ${viableRoute}` : ''}${edge.alternative ? ` (declared alternative: ${edge.alternative})` : ''}, so the coupling it forbids may already be avoidable.`,
        evidence_refs: [pair, ...(edge.alternative ? [`alternative:${edge.alternative}`] : [])],
      });
    }
  }
  return candidates;
}

/** Two packages that depend on each other may be one package. */
function detectUnderSplitPair({ packages, normalEdges }) {
  const pairs = new Map();
  for (const [index, edge] of normalEdges.entries()) {
    const key = [edge.from, edge.to].sort().join('|');
    const entry = pairs.get(key) ?? { first: null, second: null, index };
    if (edge.from === key.split('|')[0]) {
      entry.first = edge;
    } else {
      entry.second = edge;
    }
    pairs.set(key, entry);
  }
  const candidates = [];
  for (const [key, entry] of pairs) {
    if (entry.first && entry.second) {
      candidates.push({
        kind: 'under_split_pair',
        order: entry.index,
        packages: key.split('|'),
        edge_ref: key,
        observation: `The packages ${key.split('|').join(' and ')} depend on each other in both directions, so they may not be separable as independent directories.`,
        evidence_refs: [key],
      });
    }
  }
  return candidates;
}

/** A provider that most other packages depend on is an interface-stability risk. */
function detectInterfaceInstability({ packages, normalEdges }) {
  if (packages.length < 3) {
    return [];
  }
  const consumersByProvider = new Map();
  for (const edge of normalEdges) {
    const consumers = consumersByProvider.get(edge.to) ?? new Set();
    consumers.add(edge.from);
    consumersByProvider.set(edge.to, consumers);
  }
  const threshold = Math.max(1, Math.ceil((packages.length - 1) * INSTABILITY_CONSUMER_SHARE));
  const candidates = [];
  for (const [providerId, consumers] of consumersByProvider) {
    if (consumers.size >= threshold) {
      candidates.push({
        kind: 'interface_instability',
        order: packages.findIndex((pkg) => pkg.id === providerId),
        packages: [providerId],
        edge_ref: null,
        observation: `${consumers.size} of ${packages.length - 1} other packages depend on ${providerId}, so its interface changes ripple through the workspace.`,
        evidence_refs: [`consumers:${[...consumers].sort().join(',')}`],
      });
    }
  }
  return candidates;
}

/**
 * The default a residual decision preserves: a residual hands the question to the
 * canonical per-directory grill, and until then the published graph is the default.
 */
const RESIDUAL_DEFAULT = 'the published graph stays as it is until the canonical per-directory grill decides';

/**
 * Build the review for a decisions payload.
 *
 * The gate and the manifest must see exactly the same candidates, so the split of
 * the declared edges into allowed and forbidden ones lives here rather than at each
 * call site.
 *
 * @param {object} decisions - the stage-1 decisions payload
 * @param {Array<object>} ownershipEntries - the published ownership table entries
 */
export function buildDependencyReviewForDecisions(decisions = {}, ownershipEntries = []) {
  const edges = decisions.dependencies ?? [];
  return buildDependencyReview({
    packages: decisions.workspace ?? [],
    normalEdges: edges.filter((edge) => edge.kind !== 'forbidden'),
    forbiddenEdges: edges.filter((edge) => edge.kind === 'forbidden'),
    boundaries: decisions.boundaries ?? [],
    ownershipEntries,
  });
}

/** The recorded decisions, each carrying the observation it answered. */
export function mergeReviewsWithCandidates({ candidates = [], reviews = [] }) {
  const reviewByCandidate = new Map(reviews.map((review) => [review.candidate_id, review]));
  return candidates.map((candidate) => {
    const review = reviewByCandidate.get(candidate.id) ?? {};
    return {
      candidate_id: candidate.id,
      kind: candidate.kind,
      packages: candidate.packages,
      edge_ref: candidate.edge_ref,
      observation: candidate.observation,
      evidence_refs: candidate.evidence_refs,
      decision: review.decision,
      rationale: review.rationale,
      alternatives: review.alternatives,
      ...(review.why_unresolved === undefined ? {} : { why_unresolved: review.why_unresolved }),
    };
  });
}

/** Carry the residual decisions into the hand-off question list the human grill reads. */
export function collectReviewResiduals({ candidates = [], reviews = [] }) {
  const byCandidateId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return reviews
    .filter((review) => review.decision === 'residual')
    .map((review) => ({
      candidate_id: review.candidate_id,
      topic: byCandidateId.get(review.candidate_id)?.observation ?? review.candidate_id,
      alternatives: review.alternatives,
      chosen_default: RESIDUAL_DEFAULT,
      why_unresolved: review.why_unresolved,
      source: 'dependency_review',
    }));
}

/** Check the recorded decisions against the candidates and the published graph. */
export function validateDependencyReviews({ candidates = [], reviews = [], normalEdges = [], boundaries = [] }) {
  const errors = [];
  const reviewByCandidate = new Map();
  const knownCandidateIds = new Set(candidates.map((candidate) => candidate.id));
  for (const review of reviews) {
    const candidateId = review?.candidate_id;
    if (typeof candidateId !== 'string' || candidateId.length === 0) {
      errors.push('dependency_reviews entry is missing candidate_id');
      continue;
    }
    if (!knownCandidateIds.has(candidateId)) {
      errors.push(`dependency_reviews entry ${candidateId} does not match any review candidate`);
    }
    if (reviewByCandidate.has(candidateId)) {
      errors.push(`dependency_reviews entry ${candidateId} is recorded more than once`);
    }
    reviewByCandidate.set(candidateId, review);
  }

  for (const candidate of candidates) {
    const review = reviewByCandidate.get(candidate.id);
    if (!review) {
      errors.push(`review candidate ${candidate.id} (${candidate.kind}) has no recorded decision`);
      continue;
    }
    if (!REVIEW_DECISIONS.includes(review.decision)) {
      errors.push(`dependency_reviews entry ${candidate.id} states the unknown decision "${review.decision}"`);
    }
    if (typeof review.rationale !== 'string' || review.rationale.trim().length === 0) {
      errors.push(`dependency_reviews entry ${candidate.id} requires the rationale field`);
    }
    if (!Array.isArray(review.alternatives) || review.alternatives.length === 0) {
      errors.push(`dependency_reviews entry ${candidate.id} requires a non-empty alternatives list`);
    }
    if (review.decision === 'residual' && (typeof review.why_unresolved !== 'string' || review.why_unresolved.trim().length === 0)) {
      errors.push(`dependency_reviews entry ${candidate.id} is a residual and requires the why_unresolved field`);
    }
    errors.push(...checkDecisionAgainstGraph({ candidate, review, normalEdges, boundaries }));
  }
  return { ok: errors.length === 0, errors };
}

/** A decision must be consistent with the graph that will be published. */
function checkDecisionAgainstGraph({ candidate, review, normalEdges, boundaries }) {
  const errors = [];
  const declared = isRelationDeclared({ candidate, normalEdges });
  const bounded = candidate.edge_ref !== null && boundaries.some((boundary) => `${boundary.consumer_package}->${boundary.provider_package}` === candidate.edge_ref);
  if (review.decision === 'replace_with_port' && declared) {
    errors.push(`dependency_reviews entry ${candidate.id} decides replace_with_port but the edge ${candidate.edge_ref} is still declared`);
  }
  if (review.decision === 'replace_with_port' && bounded) {
    errors.push(`dependency_reviews entry ${candidate.id} decides replace_with_port but the boundary ${candidate.edge_ref} is still declared`);
  }
  if (review.decision === 'keep' && !declared) {
    errors.push(`dependency_reviews entry ${candidate.id} decides keep but the edge ${candidate.edge_ref} is not declared`);
  }
  if (review.decision === 'merge' && candidate.packages.length > 1) {
    errors.push(`dependency_reviews entry ${candidate.id} decides merge but ${candidate.packages.join(' and ')} are still separate packages`);
  }
  return errors;
}

/**
 * Whether the graph still declares the relation the candidate named.
 *
 * A pair candidate names two directions at once, so its relation survives only while
 * both directions do; an interface candidate names no relation and is always declared.
 */
function isRelationDeclared({ candidate, normalEdges }) {
  if (candidate.kind === 'under_split_pair') {
    const [first, second] = candidate.packages;
    return (
      normalEdges.some((edge) => edge.from === first && edge.to === second) &&
      normalEdges.some((edge) => edge.from === second && edge.to === first)
    );
  }
  if (candidate.edge_ref === null) {
    return true;
  }
  return normalEdges.some((edge) => `${edge.from}->${edge.to}` === candidate.edge_ref);
}

/** Material ids owned by each package. */
function buildMaterialIndex(ownershipEntries) {
  const index = new Map();
  for (const entry of ownershipEntries) {
    const bucket = index.get(entry.owner_package) ?? new Set();
    bucket.add(`${entry.category}:${entry.inventory_ref}`);
    index.set(entry.owner_package, bucket);
  }
  return index;
}

/** Whether a path of allowed edges runs from one package to another. */
function reaches(edges, from, to) {
  const adjacency = new Map();
  for (const edge of edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }
  const stack = [from];
  const visited = new Set([from]);
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === to) {
      return true;
    }
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

function summarizeKinds(candidates) {
  const byKind = {};
  for (const kind of REVIEW_KINDS) {
    byKind[kind] = candidates.filter((candidate) => candidate.kind === kind).length;
  }
  return { candidate_count: candidates.length, by_kind: byKind };
}
