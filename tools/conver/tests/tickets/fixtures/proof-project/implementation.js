'use strict';

/** A tiny behaviour a detection proof can mutate. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function save(value) {
  if (!value) {
    throw new Error('empty');
  }
  return 'saved:' + value;
}

module.exports = { save };
