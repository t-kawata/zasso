// [::TICKET::] P0-5: Error module declarations for SipError and M20 error mapping.
pub mod error_design_siperror;
pub mod m20_runtime_command_error;

// Re-export core error types at the `error` module level so that
// `siprs::error::SipError` resolves directly (required by doctests).
pub use self::error_design_siperror::{SipError, SipErrorKind};
