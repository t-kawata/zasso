// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-193 @verifies C002 C006
/**
 * RFC-SEED.md model.
 *
 * Coupling and dependency come first: section 1 states where the directory sits
 * in the whole system (the three reference paths, the verified implementation
 * order, the contract ids it owes and the segments it carries) and section 2 is
 * the coupling contract itself. Both are machine-injected, so the AI can neither
 * omit nor rewrite them. The remaining sections are the AI's authoring surface.
 *
 * Old grammar (PX-190) -> new grammar mapping:
 *   1 identity + 2 ownership + 3 allocation + 7 integration  ->  1 (machine)
 *   7 integration context                                     ->  2 (machine, JSON)
 *   3 allocated specification material                        ->  3 (machine index)
 *   4,5,6,8,9,10,11,12,13,15                                  ->  4..13 (AI prose)
 *   14 source traceability index                              ->  14 (machine table)
 */

/** Fixed required section titles in document order (1-14). */
export const SEED_REQUIRED_SECTIONS = Object.freeze([
  { index: 1, title: 'Identity and Position in the Whole System' },
  { index: 2, title: 'Coupling Contracts (I/O Boundary)' },
  { index: 3, title: 'Source Coverage and Allocation Index' },
  { index: 4, title: 'In-Scope Objects, Claims, Predicates, State and Invariants' },
  { index: 5, title: 'Incoming Dependencies and Consumer Obligations' },
  { index: 6, title: 'Outgoing Provider Obligations' },
  { index: 7, title: 'State Ownership and State-Transition Material' },
  { index: 8, title: 'Side-Effect and External-I/O Boundaries' },
  { index: 9, title: 'Canonicalization, Signatures and Proof Responsibilities' },
  { index: 10, title: 'Failure, Rejection, Recovery and Finality Material' },
  { index: 11, title: 'Required Unit, Integration, Exception and Malfeasance Test Material' },
  { index: 12, title: 'Grill Questions and Explicitly Unresolved Design Choices' },
  { index: 13, title: 'Forbidden Dependencies, Non-Interference Boundaries and Non-Goals' },
  { index: 14, title: 'Source Traceability Index' },
]);

/** Section written from the machine reference block. */
export const SEED_MACHINE_SECTION_INDEX = 1;

/** Section written from the machine contract edges. */
export const SEED_CONTRACT_SECTION_INDEX = 2;

/** Sections only the AI authors. */
export const SEED_AUTHORING_SECTION_INDEXES = Object.freeze([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

/** Columns of the machine-extractable Allocation Index table. */
export const ALLOCATION_INDEX_HEADERS = Object.freeze(['Category', 'Inventory ID', 'Canonical Name']);

/** File name placed inside every package directory. */
export const SEED_FILE_NAME = 'RFC-SEED.md';

/** Title prefix of a seed document. */
export const SEED_TITLE_PREFIX = '# RFC Seed: ';

/** Canonical published name of the stage-2 machine authority. */
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

const NOT_APPLICABLE = /^not_applicable\b/i;

/**
 * Validate a seed body: non-empty, and a not_applicable marker must carry a reason.
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

/** Whether a body is an explicit not_applicable statement without a reason. */
export function isReasonlessNotApplicable(body) {
  return assertSeedBodyValid(body) === 'not_applicable marker requires a reason';
}

/**
 * Check the AI authoring surface of a decisions payload.
 *
 * The shared schema validator understands enum/pattern/required but not
 * propertyNames, so the authoring range is enforced here as well as declared in
 * the schema: a payload that carries a machine section or an unknown key, or that
 * omits an authoring section, is rejected before anything is rendered.
 *
 * @param {object} decisions - decisions payload
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDecisionsAuthoringSurface(decisions) {
  const errors = [];
  const seeds = Array.isArray(decisions?.seeds) ? decisions.seeds : [];
  if (seeds.length === 0) {
    errors.push('the decisions payload must declare at least one seed');
  }
  for (const seed of seeds) {
    const aiSections = seed?.aiSections;
    if (aiSections === null || typeof aiSections !== 'object' || Array.isArray(aiSections)) {
      errors.push(`seed ${seed?.packageId ?? '?'} must carry an aiSections object`);
      continue;
    }
    for (const key of Object.keys(aiSections)) {
      if (!SEED_AUTHORING_SECTION_INDEXES.includes(Number(key))) {
        errors.push(`seed ${seed.packageId} must not author section "${key}": sections 1 and 2 are machine-injected`);
      }
    }
    for (const index of SEED_AUTHORING_SECTION_INDEXES) {
      if (!Object.prototype.hasOwnProperty.call(aiSections, String(index))) {
        errors.push(`seed ${seed.packageId} is missing the authoring section "${index}"`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
