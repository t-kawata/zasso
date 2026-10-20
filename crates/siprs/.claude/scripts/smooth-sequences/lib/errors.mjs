/**
 * The one error a smooth-sequences run raises.
 *
 * A detector that reports a half-read workspace as a verdict is worse than one that
 * stops: the caller cannot tell a missing input from a clean one. The error therefore
 * carries the artifact, the path and the repair a reader can perform, and `run.mjs`
 * turns it into exit code 2 without writing a report.
 */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
export class SmoothSequencesError extends Error {
  /**
   * @param {string} message
   * @param {{ code: string, path?: string|null, repair?: string|null }} details
   */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
  constructor(message, { code, path = null, repair = null }) {
    super(message);
    this.name = 'SmoothSequencesError';
    this.code = code;
    this.path = path;
    this.repair = repair;
  }
}
