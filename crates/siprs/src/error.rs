// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.

// [::TICKET::] P0-4: SipError module root — re-exports from submodules.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.

// ── Submodule declarations ──────────────────────────────────────────────

/// SipError struct, SipErrorKind enum, constructors, and PJSUA error conversion.
pub mod error_design_siperror;

/// M20 RuntimeCommand error converters (ConfConnect, ConfDisconnect, GetAccountInfo).
pub mod m20_runtime_command_error;

/// M20 shutdown command routing (N0044) — shutdown command classifier.
pub mod m20_shutdown_routing;

// ── Public API re-exports ───────────────────────────────────────────────

pub use error_design_siperror::SipError;
pub use error_design_siperror::SipErrorKind;

#[cfg(test)]
mod tests {
    use super::*;

    // ── Invariant: Send + Sync ────────────────────────────────────────

    #[test]
    fn sip_error_is_send_sync() {
        fn assert_send<T: Send>() {}
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<SipError>();
        assert_sync::<SipError>();
    }

    // ── Invariant: Display format ─────────────────────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_invalid_config_display() {
        let err = SipError::new(SipErrorKind::InvalidConfig, "empty host");
        assert_eq!(format!("{err}"), "InvalidConfig: empty host");
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_runtime_error_display() {
        let err = SipError::new(SipErrorKind::NativeError, "reactor down");
        assert_eq!(format!("{err}"), "NativeError: reactor down");
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_shutdown_display() {
        let err = SipError::new(SipErrorKind::ShutdownInProgress, "");
        assert_eq!(format!("{err}"), "ShutdownInProgress: ");
    }
}
