// [::TICKET::] PX-175 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`.
/**
 * Shared error types, gate statuses, and exit codes for the workspacify-tree
 * toolchain. Library modules never print: they raise WorkSpacifyTreeError so
 * the CLI layer can translate a failure into an exit code and a report.
 */

/** Gate/status vocabulary defined by the design (PASS..COMPLETE). */
export const GATE_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  BLOCKED: 'BLOCKED',
  COMPLETE: 'COMPLETE',
});

/** Process exit codes used by the command entry point. */
export const EXIT_CODES = Object.freeze({
  OK: 0,
  FAIL: 1,
  USAGE: 2,
});

/**
 * Error raised for every gate/validation failure. Carries the gate id
 * (G0..G5, or a sub-gate such as G1.3) and the exit code the CLI must return.
 */
export class WorkSpacifyTreeError extends Error {
  constructor(message, { gateId = 'GENERAL', exitCode = EXIT_CODES.FAIL } = {}) {
    super(message);
    this.name = 'WorkSpacifyTreeError';
    this.gateId = gateId;
    this.exitCode = exitCode;
  }
}
