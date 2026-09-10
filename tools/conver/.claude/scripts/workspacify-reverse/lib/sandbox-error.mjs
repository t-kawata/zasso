/**
 * The error a sandbox operation raises when it cannot be carried out.
 *
 * It lives in its own module because both the environment and the shape of the
 * answer it produces need to raise it, and the environment imports the answer's
 * model — putting the class in either one would make the two import each other.
 *
 * `reason` is the machine-readable part: a caller branches on it, and the
 * message is written for the human who has to decide what to do next.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
export class SandboxError extends Error {
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
  constructor(reason, message) {
    super(message);
    this.name = 'SandboxError';
    this.reason = reason;
  }
}
