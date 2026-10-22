// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
/**
 * The artifact field that carries each risk class.
 *
 * The obligation id names the risk class; the artifact names the field. Keeping the
 * mapping in one place stops a basis from citing a class name that the operation row
 * never carried.
 */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export const RISK_FIELD_BY_CLASS = Object.freeze({
  idempotency: 'idempotency_scope',
  replay: 'idempotency_scope',
  'partial-failure': 'reversal_or_recovery_rule',
  concurrency: 'allowed_status_transitions',
  liveness: 'cancellation_rule',
  finality: 'finality_predicate',
  'external-dependency': 'external_dependency_class',
});

/** The real artifact field for a risk class, or null when the class is unknown. */
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
export function riskFieldForClass(riskClass) {
  return RISK_FIELD_BY_CLASS[riskClass] ?? null;
}

/**
 * Group risk classes by the artifact field they read.
 *
 * idempotency and replay both read idempotency_scope, so they are one claim over
 * one field rather than two obligations that could each cite the same value. The
 * first class in each group keeps the obligation id the worklist already uses.
 */
// [::TICKET::] PX-300 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-300 --for-spec --no-implementation-order`.
export function groupRiskClassesByField(riskClasses = []) {
  const groups = new Map();
  for (const riskClass of Array.isArray(riskClasses) ? riskClasses : []) {
    const field = riskFieldForClass(riskClass);
    if (field === null) continue;
    const group = groups.get(field) ?? { field, classes: [] };
    group.classes.push(riskClass);
    groups.set(field, group);
  }
  return [...groups.values()];
}
