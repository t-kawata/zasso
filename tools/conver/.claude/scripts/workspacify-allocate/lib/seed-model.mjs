// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C003 C005
/**
 * RFC-SEED.md model (corrected ALLOCATE §10).
 *
 * A seed is the single machine-placed, AI-authored markdown document that
 * carries one package's normative material into the per-directory pipeline.
 * This module fixes the required section grammar, the Allocation Index table
 * grammar, and the body non-emptiness rule. No WIC JSON block exists in the
 * corrected architecture.
 */

/** Fixed required section titles in document order (1-15). */
export const SEED_REQUIRED_SECTIONS = Object.freeze([
  { index: 1, title: 'Seed Status and Package Identity' },
  { index: 2, title: 'Stage 1 Ownership and Forbidden Ownership' },
  { index: 3, title: 'Allocated Specification Material' },
  { index: 4, title: 'In-Scope Objects, Claims, Predicates, State and Invariants' },
  { index: 5, title: 'Incoming Dependencies and Consumer Obligations' },
  { index: 6, title: 'Outgoing Provider Obligations' },
  { index: 7, title: 'Integration Context (Stage-1 Manifest Edges)' },
  { index: 8, title: 'State Ownership and State-Transition Material' },
  { index: 9, title: 'Side-Effect and External-I/O Boundaries' },
  { index: 10, title: 'Canonicalization, Signatures and Proof Responsibilities' },
  { index: 11, title: 'Failure, Rejection, Recovery and Finality Material' },
  { index: 12, title: 'Required Unit, Integration, Exception and Malfeasance Test Material' },
  { index: 13, title: 'Grill Questions and Explicitly Unresolved Design Choices' },
  { index: 14, title: 'Source Traceability Index' },
  { index: 15, title: 'Forbidden Dependencies, Non-Interference Boundaries and Non-Goals' },
]);

/** Columns of the machine-extractable Allocation Index table. */
export const ALLOCATION_INDEX_HEADERS = Object.freeze(['Category', 'Inventory ID', 'Canonical Name']);

/** File name placed inside every package directory. */
export const SEED_FILE_NAME = 'RFC-SEED.md';

/** Title prefix of a seed document. */
export const SEED_TITLE_PREFIX = '# RFC Seed: ';

const NOT_APPLICABLE = /^not_applicable\b/i;

/**
 * Validate a seed body: non-empty, and a not_applicable marker must carry a
 * reason.
 *
 * @param {string} body - section body text
 * @returns {string|null} null when valid, otherwise the reason
 */
export function assertSeedBodyValid(body) {
  if (typeof body !== 'string') {
    return 'body is not a string';
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return 'section body is empty';
  }
  if (NOT_APPLICABLE.test(trimmed) && trimmed.replace(NOT_APPLICABLE, '').trim().length === 0) {
    return 'not_applicable marker requires a reason';
  }
  return null;
}
