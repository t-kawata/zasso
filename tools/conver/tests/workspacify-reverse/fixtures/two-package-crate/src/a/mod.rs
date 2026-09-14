// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
//! Package `src/a`: one crossing import and one call that crosses with it.

use crate::b::send;

pub fn dispatch() -> u8 {
    send()
}
