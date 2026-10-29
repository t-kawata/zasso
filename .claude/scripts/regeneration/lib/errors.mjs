/**
 * The error a regeneration refusal raises.
 *
 * Every refusal carries a stable code the CLI and the repair loop can branch on, the
 * path the reader should open, and a one-clause repair. A caller never has to parse
 * the message to know what happened.
 */
// [::TICKET::] PX-278 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-278 --for-spec --no-implementation-order`.
export class RegenerationError extends Error {
// [::TICKET::] PX-278 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-278 --for-spec --no-implementation-order`.
  constructor(message, { code = 'REGENERATION_ERROR', path = null, repair = null } = {}) {
    super(message);
    this.name = 'RegenerationError';
    this.code = code;
    this.path = path;
    this.repair = repair;
  }
}
