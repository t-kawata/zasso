/**
 * Typed-origin inference for authored facts.
 *
 * The migration and the detector must agree on what a fact's source is. A legacy v3
 * artifact predates the explicit `origin` field; its facts still project an operation
 * row, a contract-registry clause, or the step quote. This module is the one place
 * that decides which, so migrate-v3 and the layer-B check cannot drift.
 */

/** The share of a fact's content terms a quote must support before the fact is prose. */
export const MIN_FACT_SUPPORT_RATIO = 0.5;

const FACT_STOPWORDS = new Set([
  'the', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'to', 'and', 'or', 'in',
  'on', 'for', 'with', 'by', 'as', 'that', 'this', 'it', 'its', 'from', 'at', 'not',
  'no', 'must', 'shall', 'may', 'will', 'can', 'has', 'have', 'had', 'when', 'then',
]);

/** The operation field each fixed legacy fact family projects. */
export const OPERATION_FACT_FIELDS = Object.freeze({
  authority: 'required_authority',
  session_binding: 'requires_session_binding',
  remote_time_handshake: 'requires_remote_time_handshake',
  pre_state_checkpoint: 'required_pre_state_checkpoint',
  object: 'result_object_classes',
  status: 'initial_status',
  finality: 'finality_predicate',
  idempotency: 'idempotency_scope',
  reversal: 'reversal_or_recovery_rule',
  external: 'external_dependency_class',
  proof: 'required_proof_classes',
});

/**
 * The canonical phrase a boolean operation field is written as.
 *
 * The phrase is a fixed rendering of `field === true`; it is not free prose and must
 * only be accepted when the row is true.
 */
export const BOOLEAN_FACT_PHRASES = Object.freeze({
  session_binding: 'a session binding is required',
  remote_time_handshake: 'a remote time handshake is required',
  pre_state_checkpoint: 'a pre-state checkpoint is required',
});

/** Whitespace-normalized text for a comparison. */
export function normalizeFactText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** The content terms a fact and a quote are compared on. */
export function contentTokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !FACT_STOPWORDS.has(token))
    .map((token) => token.replace(/(ing|ed|es|s)$/u, ''))
    .filter((token) => token.length >= 3);
}

/**
 * Whether a quote supports a fact's text.
 *
 * A reader may paraphrase the line; what it may not do is state a clause the line never
 * mentions. The rule accepts a literal substring or a majority of the fact's content
 * terms, with the s/ed/ing suffix folded so "derived" and "derives" meet.
 */
export function isFactTextSupported(text, quote) {
  const normalizedText = normalizeFactText(text).toLowerCase();
  const normalizedQuote = normalizeFactText(quote).toLowerCase();
  if (normalizedText === '') return false;
  if (normalizedQuote.includes(normalizedText)) return true;
  const factTokens = contentTokens(text);
  if (factTokens.length === 0) return false;
  const quoteTokens = new Set(contentTokens(quote));
  const supported = factTokens.filter((token) => quoteTokens.has(token)).length;
  return supported / factTokens.length >= MIN_FACT_SUPPORT_RATIO;
}

/** The family prefix a fact id carries, or the whole id when it has no colon. */
// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
function factPrefix(fact) {
  const id = String(fact?.factId ?? '');
  const separator = id.indexOf(':');
  return separator === -1 ? id : id.slice(0, separator);
}

/** The typed field a fact names, falling back to the fixed family table. */
export function fieldForFact(fact) {
  const declared = fact?.source?.field;
  if (typeof declared === 'string' && declared.trim() !== '') return declared;
  return OPERATION_FACT_FIELDS[factPrefix(fact)] ?? null;
}

/** Whether a value carries a fact's text. */
// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
function valueCarriesText(value, text) {
  if (value === undefined || value === null) return false;
  const haystack = normalizeFactText(typeof value === 'string' ? value : JSON.stringify(value));
  const needle = normalizeFactText(text);
  return needle !== '' && haystack.includes(needle);
}

/** Whether the boolean row carries the canonical phrase of a legacy fact. */
// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
function booleanPhraseSupports(fact, operation, field) {
  const phrase = BOOLEAN_FACT_PHRASES[factPrefix(fact)];
  if (phrase === undefined) return false;
  if (operation?.[field] !== true) return false;
  return normalizeFactText(fact?.text).toLowerCase() === phrase;
}

/** Whether an operation row carries a fact, by named field or by any scalar row. */
// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
function operationSupports(fact, operation) {
  if (operation === null || operation === undefined) return false;
  const field = fieldForFact(fact);
  if (field !== null) {
    if (booleanPhraseSupports(fact, operation, field)) return true;
    if (valueCarriesText(operation[field], fact?.text)) return true;
  }
  for (const [key, value] of Object.entries(operation)) {
    if (booleanPhraseSupports(fact, operation, key)) return true;
    if (valueCarriesText(value, fact?.text)) return true;
  }
  return false;
}

/** Whether a contract-registry clause carries a fact. */
// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
function contractRegistrySupports(fact, contractRegistry) {
  const rows = Array.isArray(contractRegistry) ? contractRegistry : [];
  const declaredBoundary = fact?.source?.boundaryId;
  const declaredField = fact?.source?.field;
  for (const contract of rows) {
    const boundaryId = contract?.boundary_id ?? contract?.contract_id;
    if (typeof declaredBoundary === 'string' && boundaryId !== declaredBoundary) continue;
    for (const [field, clause] of Object.entries(contract?.clauses ?? {})) {
      if (typeof declaredField === 'string' && field !== declaredField) continue;
      const values = Array.isArray(clause) ? clause : [clause];
      if (values.some((value) => typeof value === 'string' && valueCarriesText(value, fact?.text))) return true;
    }
  }
  return false;
}

/** The registry row and clause a fact's text reproduces, or null. */
export function registryOriginOf(text, contractRegistry) {
  const value = normalizeFactText(text);
  if (value === '') return null;
  for (const contract of Array.isArray(contractRegistry) ? contractRegistry : []) {
    for (const [field, clause] of Object.entries(contract?.clauses ?? {})) {
      const values = Array.isArray(clause) ? clause : [clause];
      const matches = values.some((entry) => typeof entry === 'string'
        && (normalizeFactText(entry).includes(value) || value.includes(normalizeFactText(entry))));
      if (matches) return { boundaryId: contract.boundary_id ?? contract.contract_id, field };
    }
  }
  return null;
}

/**
 * The typed origin a fact carries or reproduces, or null when it is prose.
 *
 * Explicit origin wins. A declared boundary/field pair is a registry row. A text the
 * step quote supports is authored prose even when it also matches a registry clause;
 * only a text the quote cannot support needs a typed row.
 */
export function resolveFactOrigin(fact, { operation, contractRegistry, step } = {}) {
  if (typeof fact?.origin === 'string' && fact.origin.trim() !== '') return fact.origin;
  if (typeof fact?.source?.boundaryId === 'string' && typeof fact?.source?.field === 'string') {
    return 'contract_registry';
  }
  if (step !== undefined && step !== null && isFactTextSupported(fact?.text, step.quote)) return null;
  if (operationSupports(fact, operation)) return 'operation';
  if (contractRegistrySupports(fact, contractRegistry)) return 'contract_registry';
  return null;
}

/** Whether the typed row a fact names actually carries its text. */
export function typedFactSupports(fact, origin, { operation, contractRegistry } = {}) {
  if (origin === 'contract_registry') return contractRegistrySupports(fact, contractRegistry);
  if (origin === 'operation' || origin === 'artifact') return operationSupports(fact, operation);
  return false;
}
