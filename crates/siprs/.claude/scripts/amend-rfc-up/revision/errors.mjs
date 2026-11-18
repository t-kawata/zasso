// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
export class RevisionError extends Error {
// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RevisionError';
    this.code = code;
    this.step = details.step ?? null;
    this.target = details.target ?? null;
    this.details = details;
  }
}

export function failRevision(code, message, details = {}) {
  throw new RevisionError(code, message, details);
}
