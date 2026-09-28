/**
 * The one error type this command raises.
 *
 * Every failure here is a statement about an artefact the command could not use, so
 * the error carries the field or file it is about. A caller that reports the error
 * therefore names what was wrong rather than only that something was.
 */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
export class ExplainSeedError extends Error {
  /**
   * @param {string} message - what could not be done, and to which artefact
   * @param {{ field?: string|null }} [details] - the manifest field or seed field at fault
   */
// [::TICKET::] PX-221 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-221 --for-spec --no-implementation-order`.
  constructor(message, { field = null } = {}) {
    super(message);
    this.name = 'ExplainSeedError';
    this.field = field;
  }
}
