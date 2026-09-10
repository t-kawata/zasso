// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
/**
 * The single source of truth for forward-rotation traces.
 *
 * Detection and verification must agree by construction, so both consume this
 * module instead of re-declaring patterns. If they could drift, a scrub could
 * silently pass a weaker check than the one that found the traces.
 *
 * Layer model (docs/ABOUT-REVERSE.md 11.9節):
 *   L1 provenance  — ticket keys, graph node ids and design-document paths
 *   L2 contract    — contract ids and contract prose carried in comments
 *   L3 design-doc  — *code* (not comments) that reads the design document
 *   L4 structure   — module names and public API: the legitimate reverse input
 *
 * L4 is deliberately never removable. Removing it would not clean an
 * experiment, it would destroy the very artefact the experiment analyses.
 */

/**
 * Comment introducers across the file types that carry provenance
 * (.rs / .h use `//`, .toml / .yml / .conf use `#` or `;`).
 */
const COMMENT_PREFIX = String.raw`^\s*(?://+|#|;)`;

/** A line is a comment line when it starts with one of the known introducers. */
export function isCommentLine(line) {
  return /^\s*(?:\/\/|\/\*|\*|#|;)/.test(line);
}

/**
 * IETF standards look like design-RFC references but are ordinary domain
 * knowledge (RFC 4733 DTMF, RFC 2833 telephone-event, RFC 2976 SIP INFO).
 * They must survive every scrub, so every removal path consults this guard.
 */
export const IETF_REFERENCE = /\bRFC\s+\d{3,5}\b/;

/** Detection layers, with the removability decision stated explicitly. */
export const TRACE_LAYERS = Object.freeze({
  L1: Object.freeze({
    id: 'L1',
    removable: true,
    description: 'Forward-rotation provenance: ticket keys, node ids, design-document paths',
  }),
  L2: Object.freeze({
    id: 'L2',
    removable: true,
    description: 'Contract ids and contract prose carried as comments',
  }),
  L3: Object.freeze({
    id: 'L3',
    removable: true,
    description: 'Test-only files that read the design document (removed whole, never line-wise)',
  }),
  L4: Object.freeze({
    id: 'L4',
    removable: false,
    description: 'Code structure (module names, public API): legitimate reverse input',
  }),
});

/** Provenance comment patterns. Anchored to comment lines so code is never matched. */
export const L1_PATTERNS = Object.freeze([
  new RegExp(`${COMMENT_PREFIX}.*\\[::TICKET::\\]`),
  new RegExp(`${COMMENT_PREFIX}\\s*Details:\\s*\`node `),
  new RegExp(`${COMMENT_PREFIX}.*\\bNODE_ID=`),
  new RegExp(`${COMMENT_PREFIX}.*To show details`),
  new RegExp(`${COMMENT_PREFIX}.*\\bRFC-ROOT`),
  new RegExp(`${COMMENT_PREFIX}.*RFC-driven`),
  new RegExp(`${COMMENT_PREFIX}.*\\(N\\d{4}\\)`),
  new RegExp(`${COMMENT_PREFIX}.*\\bstub-gated\\b`),
  new RegExp(`${COMMENT_PREFIX}.*\\bresponsible ticket\\b`),
]);

/**
 * Contract patterns. These leak the answer key, not just the process.
 *
 * `@verifies` is matched without constraining the id family: contracts are
 * named `C###` and `TS-###` (and possibly others), so a pattern that knows one
 * family silently leaves the rest of the annotations in the tree.
 */
export const L2_PATTERNS = Object.freeze([
  new RegExp(`${COMMENT_PREFIX}.*@verifies\\b`),
  new RegExp(`${COMMENT_PREFIX}\\s*C\\d+\\s+(invariant|postcondition|precondition)`, 'i'),
  new RegExp(`${COMMENT_PREFIX}.*\\bO-\\d{3}\\b`),
]);

/**
 * L3: a non-comment line that names the design document. The negative
 * lookahead keeps provenance comments out of this layer so that L1 and L3
 * never report the same line twice.
 */
export const L3_PATTERN = /^(?!\s*(?:\/\/|#|;)).*\bRFC-ROOT\b/;

/** Marks the start of a boundify-generated traceability header. */
export const HEADER_MARKER = /^\s*(?:\/\/+|#)\s*Initial Design Artifact/;

/** The `// =====` rule that bounds a traceability header block. */
export const FENCE = /^\s*(?:\/\/+|#)\s*=+\s*$/;

/**
 * The pattern bundle shared by the detector and the verifier.
 * Frozen so that neither caller can redefine the predicate at runtime.
 */
export const TRACE_PATTERNS = Object.freeze({
  L1_PATTERNS,
  L2_PATTERNS,
  L3_PATTERN,
  HEADER_MARKER,
  FENCE,
  IETF_REFERENCE,
});

/** Which pattern list applies to a given layer id. */
export function patternsForLayer(layerId) {
  if (layerId === 'L1') return L1_PATTERNS;
  if (layerId === 'L2') return L2_PATTERNS;
  return [];
}
