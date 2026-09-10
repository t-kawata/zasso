// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
/**
 * The provenance vocabulary, declared once.
 *
 * P22-3, P22-5, P22-8 and P22-22 all read and write these values, and they run
 * in separate sessions with no context carried between them. A vocabulary
 * declared in each of them drifts on spelling, and the drift is silent: every
 * session's tests pass against its own spelling, so nothing catches it. The
 * values therefore live here, frozen, and are imported rather than repeated.
 *
 * This module depends on nothing. It is a vocabulary, and a vocabulary that
 * needed the analyser loaded before it could be read would be unusable by the
 * schema validator that has to check it.
 */

/**
 * The four provenance values, in the design's order (ABOUT-REVERSE 5.5).
 *
 * `observed` is a narrow word: it means a fact read from the source text or its
 * syntax tree, and nothing else. Runtime behaviour, dynamic dispatch targets,
 * post-preprocessing composition and generated code need execution, build or
 * trace evidence, so a proposition resting on them carries a weaker evidence
 * mode and is not `observed`.
 */
export const PROVENANCE_CLASSES = Object.freeze(['observed', 'inferred', 'normative', 'unresolved']);

/**
 * The values the extractor may emit for a contract candidate.
 *
 * `normative` is excluded by construction rather than by convention. A norm is
 * a human's decision recorded in the grill, and a machine that asserts one
 * without that record has invented an authority.
 */
export const EXTRACTOR_CLASSES = Object.freeze(['observed', 'unresolved']);

/** The declared strengths a lineage relation may carry. No fourth value. */
export const RELATION_STRENGTHS = Object.freeze(['strong', 'medium', 'weak']);

/**
 * The closed vocabulary of lineage relations, and how strongly each one joins.
 *
 * The strengths are the design's (5.5.2): `same_syntax_span` and
 * `same_generator` are 高, the four that follow are 中, and `similar_wording` is
 * 弱. The closed-ness matters as much as the values: a relation invented at a
 * call site would fold evidence by a rule no reader of the ledger could see.
 */
export const LINEAGE_RELATIONS = Object.freeze({
  same_syntax_span: 'strong',
  same_generator: 'strong',
  same_commit: 'medium',
  same_patch: 'medium',
  same_guard: 'medium',
  same_error_path: 'medium',
  similar_wording: 'weak',
});

/**
 * The strengths that collapse into one vote.
 *
 * `similar_wording` is absent deliberately. A resemblance between a comment and
 * a test name is a candidate for a human to review, never a machine's
 * conclusion that two artefacts share one origin — and a weak relation that
 * folded automatically would reduce the evidence count while looking like a
 * careful measurement.
 */
export const FOLDED_STRENGTHS = Object.freeze(['strong', 'medium']);

/**
 * What the ledger concluded about one item's independence.
 *
 * `unknown` is a legal and expected value rather than a failure. Whether two
 * artefacts descend from one human design decision is not computable from file
 * contents, so recording that plainly is more correct than guessing and calling
 * the guess proof.
 */
export const INDEPENDENCE_ASSESSMENTS = Object.freeze(['independent', 'folded', 'unknown']);

/** The classification a stage-two candidate carries, in place of a provenance class. */
export const CANDIDATE_CLASSIFICATION = 'candidate';

/** The field that keeps a candidate from being read as a settled fact. */
export const CANDIDATE_APPROVAL_KEY = 'requires_human_approval';

/**
 * The aggregation policy, stored beside the evidence it was applied to.
 *
 * It travels with the ledger so a human can correct a grouping later without
 * re-running the extraction. An implicit policy would be the answer itself.
 */
export const INDEPENDENCE_POLICY =
  'Evidence joined by a strong or medium lineage relation forms one connected component and counts as '
  + 'one independent piece of support; similar_wording never collapses automatically. The number of '
  + 'components is what a claim reports, never the number of evidence records. An item whose '
  + 'independence no consulted channel can settle is recorded as unknown.';

/**
 * The separator a composite map key uses.
 *
 * A space or a hyphen cannot carry this duty: paths, symbols and conditions all
 * contain them, so a key built by joining with one of those collides silently
 * and the collision reads as a merge.
 *
 * The code point is written numerically rather than as an escape sequence, and
 * that is not a style preference. An earlier version of this file wrote the
 * escape, a tool's JSON decoding resolved it, and the file acquired a literal
 * control byte — at which point `file` called it data and `grep` silently
 * refused to search it. Writing the number cannot be mangled that way.
 */
export const GROUP_KEY_SEPARATOR = String.fromCharCode(0);

/** Join key parts into a string no combination of the parts can forge. */
export function groupKey(...parts) {
  return parts.map((part) => (part === null || part === undefined ? '' : String(part))).join(GROUP_KEY_SEPARATOR);
}

/** The declared strength of a relation, or null when it is not in the vocabulary. */
export function relationStrength(relation) {
  return LINEAGE_RELATIONS[relation] ?? null;
}

/**
 * Whether a relation collapses its endpoints into one vote.
 *
 * An unknown relation does not fold. Folding on a relation nobody declared
 * would allow one typo in an edge to silently reduce the evidence count.
 */
export function foldsIndependence(relation) {
  const strength = relationStrength(relation);
  return strength !== null && FOLDED_STRENGTHS.includes(strength);
}
