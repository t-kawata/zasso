// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.


// ============================================================================
// State Module — Event conversion, call state, and registration handling
//
// This module groups all state-machine-related sub-modules for the M20 phase.
// Each sub-module is declared here; no implementation logic lives in this file.
// ============================================================================

pub mod m20_native_event_conv;
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
pub mod m20_callstate_mapping;
pub mod m20_registr_cmd_pat;
pub mod m20_dtmfsent_twophase;

// [::STUB::] P1-3: registr_state_machine module — uses RegistrationSucceeded/Failed from this ticket
// [::STUB::] P1-4: call_state_model module — provides full CallState enum
// [::STUB::] P1-5: shutdown_specification module — standalone shutdown state
pub mod call_state_model;
pub mod registr_state_machine;
pub mod shutdown_specification;
