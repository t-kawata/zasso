// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
'use strict';

const { save } = require('./implementation.js');

try {
  if (save('x') !== 'saved:x') {
    throw new Error('postcondition violated');
  }
  process.stdout.write('PASS alpha_saves\n');
} catch {
  process.stdout.write('FAIL alpha_saves\n');
  process.exit(1);
}
