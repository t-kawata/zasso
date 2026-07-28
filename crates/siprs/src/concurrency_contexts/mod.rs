
// [::TICKET::] P0-3: RuntimeCommand Enum & Command Serialization.
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.

pub mod command_serialization;
// [::STUB::] P0-7: SipClient facade uses RuntimeCommand via this re-export.
// The unused_import warning will resolve once P0-7 imports concurrency_contexts.
// See: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-7 --for-spec --no-implementation-order`.
#[allow(unused_imports)]
pub(crate) use self::command_serialization::RuntimeCommand;
