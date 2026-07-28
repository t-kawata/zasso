// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: State-layer module — call state, NativeEvent conversion, registration command pattern

pub mod call_state_model;
pub mod m20_callstate_mapping;
pub mod m20_native_event_conv;
pub mod m20_registr_cmd_pat;
pub mod registr_state_machine;
pub mod shutdown_specification;

// Re-export public types at the state level
pub use m20_callstate_mapping::{
    convert_call_media_state, convert_call_state, CallMediaState, CallState,
};
pub use m20_native_event_conv::{convert_native_event_to_payload, NativeEvent};
pub use m20_registr_cmd_pat::{registration_status_to_payload, AccountInfoSnapshot};
