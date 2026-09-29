/**
 * The one error type this command raises.
 *
 * A reader of a failure needs to know which artefact or field was at fault, so the
 * constructor carries it as a field rather than leaving it inside prose the caller would
 * have to parse back out.
 */

export const ERROR_PREFIX = '[workspacify-order]';

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
export class WorkspacifyOrderError extends Error {
  /**
   * @param {string} message — what went wrong, in the terms of the workspace being read
   * @param {{ artefact?: string | null }} [context] — the file or field the message is about
   */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
  constructor(message, { artefact = null } = {}) {
    super(message);
    this.name = 'WorkspacifyOrderError';
    this.artefact = artefact;
  }
}
