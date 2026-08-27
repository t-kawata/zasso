// [::TICKET::] P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-5 --for-spec --no-implementation-order`.
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: State-layer module — call state, NativeEvent conversion, registration command pattern

pub mod call_state_model;
pub mod m20_callstate_mapping;
pub mod m20_native_event_conv;
pub mod m20_registr_cmd_pat;
pub mod reg_account_lifecycle;
// [::TICKET::] P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-3 --for-spec --no-implementation-order`.
pub mod registr_state_machine;
pub mod registr_wiring;
pub mod shutdown_specification;
pub mod shutdown_wiring;
// [::TICKET::] P15-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-8 --for-spec --no-implementation-order`.

// Re-export public types at the state level
pub use m20_callstate_mapping::{
// [::TICKET::] P17-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-6 --for-spec --no-implementation-order`.
    convert_call_media_state, convert_call_media_state_with_previous, convert_call_state,
    CallMediaState, CallState,
};
pub use m20_native_event_conv::{convert_native_event_to_payload, NativeEvent};
pub use m20_registr_cmd_pat::{
    registration_state_from_status, registration_transition_from_native, AccountInfoSnapshot,
};
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
pub use registr_state_machine::RegistrationState;
pub use shutdown_specification::ShutdownSpec;
