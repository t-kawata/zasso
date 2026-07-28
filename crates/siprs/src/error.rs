// [::TICKET::] P0-3: SipError skeleton for facade API.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
//
// Full SipError with all variants is implemented in P0-4 (N0016).
// This file provides the minimal variants needed by the SipClient facade.

/// Errors produced by the siprs public API.
///
/// All public async functions return `Result<T, SipError>`. This enum
/// provides the top-level error type for the crate. Downstream tickets
/// (P0-4) will add additional variants covering FFI, transport, media,
/// and protocol errors.
///
/// # Invariant
/// Every `pub async fn` in the crate's public API must return `Result<_, SipError>`.
/// This is verified by compile-time assertions in the test suite.
#[derive(Debug, Clone, thiserror::Error)]
pub enum SipError {
    /// The provided `ClientConfig` failed validation.
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    /// A runtime operation failed (reactor down, backend error, etc.).
    #[error("Runtime error: {0}")]
    RuntimeError(String),

    /// The client has been shut down — no further operations allowed.
    #[error("Client is shut down")]
    Shutdown,

    // [::STUB::] P0-4: additional error variants (NetworkError, AuthError,
    // MediaError, ProtocolError, TimeoutError, etc.) will be added in P0-4
    // (N0016: §14 Error Design — SipError & SipErrorKind).
    //
    // These are deferred because the FFI layer (P0-6) and event system (P0-5)
    // must be in place first to define the concrete error sources.
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies N0001
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn sip_error_is_send_sync() {
        // Contract-N0001: SipError must be Send + Sync for async API use.
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<SipError>();
        assert_sync::<SipError>();
    }

    #[test]
    // @verifies N0001
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn sip_error_invalid_config_display() {
        let err = SipError::InvalidConfig("empty host".into());
        assert_eq!(format!("{err}"), "Invalid configuration: empty host");
    }

    #[test]
    // @verifies N0001
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn sip_error_runtime_error_display() {
        let err = SipError::RuntimeError("reactor down".into());
        assert_eq!(format!("{err}"), "Runtime error: reactor down");
    }

    #[test]
    // @verifies C044
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn sip_error_shutdown_display() {
        let err = SipError::Shutdown;
        assert_eq!(format!("{err}"), "Client is shut down");
    }
}
