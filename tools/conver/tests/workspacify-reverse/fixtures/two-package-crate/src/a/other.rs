// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
//! A second member of `src/a`. Its import stays inside the package, so it is
//! internal coupling and not a boundary crossing.

use crate::a::dispatch;

pub fn again() -> u8 {
    dispatch()
}
