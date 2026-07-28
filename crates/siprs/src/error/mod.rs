// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.

// Error module — unified error handling for siprs.
//
// Re-exports the SipError struct and SipErrorKind enum as the crate's
// primary error types. Sub-modules contain additional error definitions
// and conversion logic for specific sub-systems.

pub mod challenges_panic_policy;
pub mod error_design_siperror;
pub mod m20_runtime_command_error;
pub mod m20_shutdown_routing;

// [::STUB::] P0-5: SipError is consumed by reactor module (P0-5). Remove #[allow(dead_code)] once
// the reactor implements command dispatch and constructs SipError values.
pub(crate) use self::error_design_siperror::SipError;
