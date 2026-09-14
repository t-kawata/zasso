// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
//! Package `src/b`: it imports back into `src/a`, so the two packages form a
//! cycle and every edge between them is a crossing in both directions.
//!
//! `send` is deliberately a name R3's call vocabulary reads. A fixture whose
//! crossing call the syntax layer cannot see would prove nothing about the
//! boundary-crossing count, because no extractor could produce a call site for
//! it.

use crate::a::dispatch;

pub fn send() -> u8 {
    dispatch()
}
