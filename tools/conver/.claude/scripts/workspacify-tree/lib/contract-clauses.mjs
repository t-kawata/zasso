// [::TICKET::] PX-192 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-192 --for-spec --no-implementation-order`.
// PX-192 @verifies C002
/**
 * The contract-clause vocabulary stage 2 must fill in for every dependency
 * boundary.
 *
 * Stage 2 writes a coupling contract per boundary; the clause names it may use
 * are frozen here so that "complete I/O boundary" is a mechanical property
 * rather than a matter of taste. The five core clauses are mandatory for every
 * boundary because a contract without them cannot express a precondition, a
 * postcondition or an invariant at all.
 */

/** Every clause name stage 2 may use. */
export const CONTRACT_CLAUSES = Object.freeze([
  'input',
  'output',
  'preconditions',
  'postconditions',
  'invariants',
  'errors',
  'state_ownership',
  'idempotency',
  'atomicity',
  'ordering',
  'finality',
  'canonicalization',
  'signature',
  'proof_verification',
  'tests',
]);

/** Clauses every boundary must declare, whatever its connection kind. */
export const CORE_CONTRACT_CLAUSES = Object.freeze([
  'input',
  'output',
  'preconditions',
  'postconditions',
  'invariants',
]);

/**
 * Clauses a connection kind adds on top of the core set. A kind that is not
 * listed adds nothing, so the core set is always a valid scope.
 */
const CLAUSES_BY_CONNECTION_KIND = Object.freeze({
  value_only: Object.freeze(['errors', 'canonicalization', 'tests']),
  typed_protocol_input: Object.freeze(['errors', 'canonicalization', 'signature', 'tests']),
  proof_verification: Object.freeze(['errors', 'canonicalization', 'signature', 'proof_verification', 'tests']),
  state_transition: Object.freeze(['errors', 'state_ownership', 'idempotency', 'atomicity', 'ordering', 'finality', 'tests']),
  external_effect: Object.freeze(['errors', 'idempotency', 'atomicity', 'ordering', 'finality', 'tests']),
  composition_obligation: Object.freeze(['errors', 'ordering', 'tests']),
  port_contract: Object.freeze(['errors', 'canonicalization', 'tests']),
});

/**
 * Build the contract scope for a boundary.
 *
 * @param {string} [connectionKind] - declared connection kind of the edge
 * @returns {string[]} core clauses first, then the kind-specific clauses in vocabulary order
 */
export function buildBoundaryContractScope(connectionKind) {
  const extraClauses = CLAUSES_BY_CONNECTION_KIND[connectionKind] ?? [];
  const selected = new Set([...CORE_CONTRACT_CLAUSES, ...extraClauses]);
  return CONTRACT_CLAUSES.filter((clause) => selected.has(clause));
}

/**
 * Check a declared scope against the vocabulary.
 *
 * @param {string[]} scope - clause names declared by a boundary
 * @returns {{ ok: boolean, unknown: string[], missingCore: string[], duplicates: string[] }}
 */
export function validateContractScope(scope) {
  const clauses = Array.isArray(scope) ? scope : [];
  const unknown = clauses.filter((clause) => !CONTRACT_CLAUSES.includes(clause));
  const missingCore = CORE_CONTRACT_CLAUSES.filter((clause) => !clauses.includes(clause));
  const seen = new Set();
  const duplicates = [];
  for (const clause of clauses) {
    if (seen.has(clause)) {
      duplicates.push(clause);
    }
    seen.add(clause);
  }
  return {
    ok: unknown.length === 0 && missingCore.length === 0 && duplicates.length === 0,
    unknown,
    missingCore,
    duplicates,
  };
}
