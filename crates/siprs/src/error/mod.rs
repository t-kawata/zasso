// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: Error module declarations for SipError and M20 error mapping.
pub mod error_design_siperror;
pub mod m20_runtime_command_error;
// [::TICKET::] P1-1: M20 Shutdown Command Routing — dispatch_command gate for shutdown-safe command dispatch.
pub mod m20_shutdown_routing;

// Re-export core error types at the `error` module level so that
// `siprs::error::SipError` resolves directly (required by doctests).
pub use self::error_design_siperror::{SipError, SipErrorKind};
