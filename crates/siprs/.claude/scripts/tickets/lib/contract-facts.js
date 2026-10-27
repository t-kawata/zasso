/**
 * contract-facts.js — the typed-axis and operation-obligation vocabulary the delivery
 * gate checks.
 *
 * A sequence step carries four typed axes beside pre/post/invariant. An operation unit
 * carries field values that describe the contract-bearing behaviour (finality,
 * idempotency, transitions) and surface declarations (REST, WebSocket, CLI). The
 * descriptive fields (kind, purpose, specLines) are provenance and design prose, not a
 * testable contract. The classification is declared once so the renderer and the gate
 * cannot disagree about which field is owed.
 */

const CONTRACT_AXES = Object.freeze(['consumes', 'produces', 'errors', 'crosses']);

const CONTRACT_BEARING_OPERATION_FIELDS = Object.freeze([
  'requiredAuthority',
  'requiresRemoteTimeHandshake',
  'requiresSessionBinding',
  'requiredPreStateCheckpoint',
  'requiredProofClasses',
  'idempotencyScope',
  'initialStatus',
  'allowedStatusTransitions',
  'externalDependencyClass',
  'finalityPredicate',
  'cancellationRule',
  'reversalOrRecoveryRule',
  'rejectCodeFamilies',
  'registryContribution',
  'boundaryEffects',
  'resultObjectClasses',
]);

const SURFACE_OPERATION_FIELDS = Object.freeze(['rest', 'websocket', 'cli']);

const DESCRIPTIVE_OPERATION_FIELDS = Object.freeze(['kind', 'purpose', 'specLines']);

/** The render order show-ticket-context uses; every field belongs to one class above. */
const OPERATION_OBLIGATION_FIELDS = Object.freeze([
  'kind',
  'purpose',
  'requiredAuthority',
  'requiresRemoteTimeHandshake',
  'requiresSessionBinding',
  'requiredPreStateCheckpoint',
  'requiredProofClasses',
  'idempotencyScope',
  'initialStatus',
  'allowedStatusTransitions',
  'externalDependencyClass',
  'finalityPredicate',
  'cancellationRule',
  'reversalOrRecoveryRule',
  'rest',
  'websocket',
  'cli',
  'rejectCodeFamilies',
  'registryContribution',
  'boundaryEffects',
  'resultObjectClasses',
  'specLines',
]);

/**
 * The text of each typed fact, accepting the string and object shapes the artifact uses.
 *
 * @param {unknown} facts
 * @returns {string[]}
 */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function factTexts(facts) {
  return (Array.isArray(facts) ? facts : [])
    .map((fact) => (typeof fact === 'string' ? fact : (fact?.text ?? fact?.factId ?? '')))
    .filter((text) => typeof text === 'string' && text.length > 0);
}

/**
 * Whether an obligation field carries a value that must be planned.
 *
 * A boolean is a declaration even when false (`requiresRemoteTimeHandshake: false` says
 * the operation needs no handshake), so it is present. An empty array or object is not.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
// [::TICKET::] PX-326 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-326 --for-spec --no-implementation-order`.
function hasObligationValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

module.exports = {
  CONTRACT_AXES,
  CONTRACT_BEARING_OPERATION_FIELDS,
  SURFACE_OPERATION_FIELDS,
  DESCRIPTIVE_OPERATION_FIELDS,
  OPERATION_OBLIGATION_FIELDS,
  factTexts,
  hasObligationValue,
};
