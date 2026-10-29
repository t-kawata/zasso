// [::TICKET::] PX-192 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-192 --for-spec --no-implementation-order`.
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
 * Clauses a connection kind adds on top of the core set.
 *
 * Every kind the tree graph can emit has an explicit row. Three kinds used to
 * fall through to the core set because they had no row: checkpoint-reference,
 * adapter-implementation and conformance. The fallback still exists so a new
 * kind cannot crash a build, but unregisteredConnectionKinds names it and the
 * tree finalize refuses to write a boundary before the kind is registered.
 */
// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
export const CLAUSES_BY_CONNECTION_KIND = Object.freeze({
  value_only: Object.freeze(['errors', 'canonicalization', 'tests']),
  typed_protocol_input: Object.freeze(['errors', 'canonicalization', 'signature', 'tests']),
  proof_verification: Object.freeze(['errors', 'canonicalization', 'signature', 'proof_verification', 'tests']),
  state_transition: Object.freeze(['errors', 'state_ownership', 'idempotency', 'atomicity', 'ordering', 'finality', 'tests']),
  external_effect: Object.freeze(['errors', 'idempotency', 'atomicity', 'ordering', 'finality', 'tests']),
  composition_obligation: Object.freeze(['errors', 'ordering', 'tests']),
  port_contract: Object.freeze(['errors', 'canonicalization', 'tests']),
  'checkpoint-reference': Object.freeze(['errors', 'tests']),
  'adapter-implementation': Object.freeze(['errors', 'tests']),
  conformance: Object.freeze(['errors', 'tests']),
});

/** Every connection kind the contract scope map registers. */
// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
export const CONNECTION_KINDS = Object.freeze(Object.keys(CLAUSES_BY_CONNECTION_KIND));

/** Whether a connection kind has an explicit scope row. */
// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
export function isRegisteredConnectionKind(connectionKind) {
  return typeof connectionKind === 'string' && Object.hasOwn(CLAUSES_BY_CONNECTION_KIND, connectionKind);
}

/** The kinds in a census that have no explicit scope row. */
// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
export function unregisteredConnectionKinds(connectionKinds = []) {
  return [...new Set((Array.isArray(connectionKinds) ? connectionKinds : [])
    .filter((connectionKind) => !isRegisteredConnectionKind(connectionKind)))];
}

/**
 * Build the contract scope for a boundary.
 *
 * @param {string} [connectionKind] - declared connection kind of the edge
 * @returns {string[]} core clauses first, then the kind-specific clauses in vocabulary order
 */
// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
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
