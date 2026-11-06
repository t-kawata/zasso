// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
/**
 * The gate names a grill completion and a cross-package evidence record share.
 *
 * The completion command evaluates these gates; the edit guard validates evidence
 * against the same vocabulary. Keeping the names here means a gate cannot be added
 * to one side and silently ignored by the other.
 */

/** The ten conditions STEP 8 requires, in the order the command states them. */
export const REQUIRED_GATE_NAMES = Object.freeze([
  'design-tree-resolved',
  'checklist-approved',
  'rfc-no-deferred-work',
  'seed-divergence-ledger',
  'defect-ledger',
  'obligation-coverage',
  'ledger-discharge',
  'contribution-completeness',
  'distribution-completeness',
  'rederive-receipts',
  'formula-coverage',
]);

/** The cross-package API verdict, evaluated only by a cross-package completion. */
export const API_CONSISTENCY_GATE_NAME = 'api-consistency';

/**
 * The script the guard's evidence names for the same verdict.
 *
 * PX-371 evidence named the program (`verify-api-consistency`); the completion
 * report names the gate (`api-consistency`). Both spellings reach the same verdict,
 * so both are known and neither is treated as a fabricated gate.
 */
export const API_CONSISTENCY_SCRIPT_NAME = 'verify-api-consistency';

/** Every gate name evidence may carry. */
export const KNOWN_GATE_NAMES = Object.freeze([
  ...REQUIRED_GATE_NAMES,
  API_CONSISTENCY_GATE_NAME,
  API_CONSISTENCY_SCRIPT_NAME,
]);
