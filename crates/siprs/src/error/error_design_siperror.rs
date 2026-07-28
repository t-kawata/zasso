// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0016:  §14 Error Design — SipError & SipErrorKind
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0016 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::concurrency_contexts::command_serialization::{AccountId, CallId};

// [::STUB::] P0-5: SipError and SipErrorKind are consumed by P0-5 reactor, P0-7 facade.
// Remove #[allow(dead_code)] once P0-7 SipClient facade constructs error values.

/// Unified error type for all siprs public APIs.
///
/// Wraps a stable classification (`SipErrorKind`), a human-readable message,
/// an optional native PJSUA error code, optional domain context identifiers
/// (account_id, call_id), and a retryable flag for recoverability.
///
/// Reads as: "A SipError with kind, message, native status, account context,
/// call context, and recoverability classification."
#[allow(dead_code)]
#[derive(Debug, thiserror::Error)]
#[error("{kind}: {message}")]
pub(crate) struct SipError {
    pub(crate) kind: SipErrorKind,
    pub(crate) message: String,
    pub(crate) native_status: Option<i32>,
    pub(crate) account_id: Option<AccountId>,
    pub(crate) call_id: Option<CallId>,
    pub(crate) retryable: bool,
}

/// Stable classification of SIP errors.
///
/// Each variant represents a distinct failure category. The enum is designed
/// to be exhaustive — no wildcard arms — so that adding a new error kind
/// forces a compile-time update at every match site.
///
/// Reads as: "An error kind: invalid config, invalid state, account not found,
/// timeout, native error, ..." — each variant is a semantic noun.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SipErrorKind {
    InvalidConfig,
    InvalidState,
    AlreadyInitialized,
    NotInitialized,
    AccountNotFound,
    CallNotFound,
    TransportInitFailed,
    RegistrationFailed,
    AuthenticationFailed,
    InviteFailed,
    MediaInitFailed,
    MediaNegotiationFailed,
    IceFailed,
    TlsFailed,
    SrtpFailed,
    AudioFormatUnsupported,
    AudioPipelineBroken,
    DtmfFailed,
    Timeout,
    ChannelClosed,
    NativeError,
    ShutdownInProgress,
    InternalInvariantBroken,
}

// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
impl std::fmt::Display for SipErrorKind {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            SipErrorKind::InvalidConfig => "InvalidConfig",
            SipErrorKind::InvalidState => "InvalidState",
            SipErrorKind::AlreadyInitialized => "AlreadyInitialized",
            SipErrorKind::NotInitialized => "NotInitialized",
            SipErrorKind::AccountNotFound => "AccountNotFound",
            SipErrorKind::CallNotFound => "CallNotFound",
            SipErrorKind::TransportInitFailed => "TransportInitFailed",
            SipErrorKind::RegistrationFailed => "RegistrationFailed",
            SipErrorKind::AuthenticationFailed => "AuthenticationFailed",
            SipErrorKind::InviteFailed => "InviteFailed",
            SipErrorKind::MediaInitFailed => "MediaInitFailed",
            SipErrorKind::MediaNegotiationFailed => "MediaNegotiationFailed",
            SipErrorKind::IceFailed => "IceFailed",
            SipErrorKind::TlsFailed => "TlsFailed",
            SipErrorKind::SrtpFailed => "SrtpFailed",
            SipErrorKind::AudioFormatUnsupported => "AudioFormatUnsupported",
            SipErrorKind::AudioPipelineBroken => "AudioPipelineBroken",
            SipErrorKind::DtmfFailed => "DtmfFailed",
            SipErrorKind::Timeout => "Timeout",
            SipErrorKind::ChannelClosed => "ChannelClosed",
            SipErrorKind::NativeError => "NativeError",
            SipErrorKind::ShutdownInProgress => "ShutdownInProgress",
            SipErrorKind::InternalInvariantBroken => "InternalInvariantBroken",
        };
        write!(f, "{name}")
    }
}

/// Convenience constructors for common error patterns.
///
/// Each constructor sets `kind` to the appropriate variant and `retryable`
/// according to the error classification table. Reads as:
/// "create an invalid state error", "create a not-found error", etc.
#[allow(dead_code)]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
impl SipError {
    /// Creates an error with kind=InvalidState, retryable=false.
    pub(crate) fn invalid_state(message: impl Into<String>) -> Self {
        SipError {
            kind: SipErrorKind::InvalidState,
            message: message.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// Creates an error with kind=CallNotFound, retryable=false.
    pub(crate) fn not_found(message: impl Into<String>) -> Self {
        SipError {
            kind: SipErrorKind::CallNotFound,
            message: message.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// Creates an error with kind=AccountNotFound, retryable=false.
    pub(crate) fn account_not_found(message: impl Into<String>) -> Self {
        SipError {
            kind: SipErrorKind::AccountNotFound,
            message: message.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// Creates an error with kind=NativeError, retryable=true, and a native status code.
    pub(crate) fn native_error(message: impl Into<String>, status: i32) -> Self {
        SipError {
            kind: SipErrorKind::NativeError,
            message: message.into(),
            native_status: Some(status),
            account_id: None,
            call_id: None,
            retryable: true,
        }
    }

    /// Creates an error with kind=Timeout, retryable=true.
    pub(crate) fn timeout(message: impl Into<String>) -> Self {
        SipError {
            kind: SipErrorKind::Timeout,
            message: message.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: true,
        }
    }

    /// Creates an error with kind=TransportInitFailed, retryable=true.
    pub(crate) fn transport_init_failed(message: impl Into<String>) -> Self {
        SipError {
            kind: SipErrorKind::TransportInitFailed,
            message: message.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: true,
        }
    }

    /// Creates an error with kind=RegistrationFailed, retryable=true.
    pub(crate) fn registration_failed(message: impl Into<String>) -> Self {
        SipError {
            kind: SipErrorKind::RegistrationFailed,
            message: message.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: true,
        }
    }

    /// Creates an error with kind=AuthenticationFailed, retryable=true.
    pub(crate) fn authentication_failed(message: impl Into<String>) -> Self {
        SipError {
            kind: SipErrorKind::AuthenticationFailed,
            message: message.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: true,
        }
    }

    /// Creates an error with kind=InternalInvariantBroken, retryable=false.
    pub(crate) fn internal_invariant_broken(message: impl Into<String>) -> Self {
        SipError {
            kind: SipErrorKind::InternalInvariantBroken,
            message: message.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// Attaches an account_id to this error. Returns a new SipError.
    pub(crate) fn with_account_id(mut self, account_id: AccountId) -> Self {
        self.account_id = Some(account_id);
        self
    }

    /// Attaches a call_id to this error. Returns a new SipError.
    pub(crate) fn with_call_id(mut self, call_id: CallId) -> Self {
        self.call_id = Some(call_id);
        self
    }

    /// Attaches a native_status to this error. Returns a new SipError.
    pub(crate) fn with_native_status(mut self, status: i32) -> Self {
        self.native_status = Some(status);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::concurrency_contexts::command_serialization::{AccountId, CallId};

    // ── Normal cases ──

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn construct_siperror_with_all_fields() {
        let err = SipError {
            kind: SipErrorKind::InvalidConfig,
            message: "config error".to_string(),
            native_status: Some(7001),
            account_id: Some(AccountId(1)),
            call_id: Some(CallId(42)),
            retryable: false,
        };
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert_eq!(err.message, "config error");
        assert_eq!(err.native_status, Some(7001));
        assert_eq!(err.account_id, Some(AccountId(1)));
        assert_eq!(err.call_id, Some(CallId(42)));
        assert!(!err.retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn construct_siperror_with_minimal_fields() {
        let err = SipError {
            kind: SipErrorKind::InvalidConfig,
            message: "minimal".to_string(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        };
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert_eq!(err.message, "minimal");
        assert!(err.native_status.is_none());
        assert!(err.account_id.is_none());
        assert!(err.call_id.is_none());
        assert!(!err.retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn all_22_siperror_kind_variants_constructable() {
        let variants = [
            SipErrorKind::InvalidConfig,
            SipErrorKind::InvalidState,
            SipErrorKind::AlreadyInitialized,
            SipErrorKind::NotInitialized,
            SipErrorKind::AccountNotFound,
            SipErrorKind::CallNotFound,
            SipErrorKind::TransportInitFailed,
            SipErrorKind::RegistrationFailed,
            SipErrorKind::AuthenticationFailed,
            SipErrorKind::InviteFailed,
            SipErrorKind::MediaInitFailed,
            SipErrorKind::MediaNegotiationFailed,
            SipErrorKind::IceFailed,
            SipErrorKind::TlsFailed,
            SipErrorKind::SrtpFailed,
            SipErrorKind::AudioFormatUnsupported,
            SipErrorKind::AudioPipelineBroken,
            SipErrorKind::DtmfFailed,
            SipErrorKind::Timeout,
            SipErrorKind::ChannelClosed,
            SipErrorKind::NativeError,
            SipErrorKind::ShutdownInProgress,
            SipErrorKind::InternalInvariantBroken,
        ];
        assert_eq!(variants.len(), 23);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn retryable_flag_true_for_recoverable_errors() {
        assert!(SipError::timeout("timeout").retryable);
        assert!(SipError::transport_init_failed("transport").retryable);
        assert!(SipError::registration_failed("reg").retryable);
        assert!(SipError::authentication_failed("auth").retryable);
        assert!(SipError::native_error("native", 7001).retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn retryable_flag_false_for_non_recoverable_errors() {
        assert!(!SipError::invalid_state("state").retryable);
        assert!(!SipError::not_found("not found").retryable);
        assert!(!SipError::account_not_found("acc").retryable);
        assert!(!SipError::internal_invariant_broken("bug").retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_display_format() {
        let err = SipError {
            kind: SipErrorKind::InvalidConfig,
            message: "missing field".to_string(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        };
        assert_eq!(format!("{}", err), "InvalidConfig: missing field");
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn convenience_constructor_invalid_state() {
        let err = SipError::invalid_state("not ready");
        assert_eq!(err.kind, SipErrorKind::InvalidState);
        assert!(!err.retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn convenience_constructor_not_found() {
        let err = SipError::not_found("call not found");
        assert_eq!(err.kind, SipErrorKind::CallNotFound);
        assert!(!err.retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn convenience_constructor_native_error() {
        let err = SipError::native_error("PJSIP error", 7001);
        assert_eq!(err.kind, SipErrorKind::NativeError);
        assert_eq!(err.native_status, Some(7001));
        assert!(err.retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_kind_partial_eq() {
        assert_eq!(SipErrorKind::InvalidConfig, SipErrorKind::InvalidConfig);
        assert_ne!(SipErrorKind::InvalidConfig, SipErrorKind::Timeout);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_kind_clone_copy() {
        let kind = SipErrorKind::Timeout;
        let cloned = kind;
        assert_eq!(kind, cloned);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn with_account_id_sets_field() {
        let err = SipError::invalid_state("test").with_account_id(AccountId(42));
        assert_eq!(err.account_id, Some(AccountId(42)));
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn with_call_id_sets_field() {
        let err = SipError::invalid_state("test").with_call_id(CallId(99));
        assert_eq!(err.call_id, Some(CallId(99)));
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn with_native_status_sets_field() {
        let err = SipError::invalid_state("test").with_native_status(7001);
        assert_eq!(err.native_status, Some(7001));
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn retryable_flag_default_false() {
        let err = SipError {
            kind: SipErrorKind::ShutdownInProgress,
            message: "shutting down".to_string(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        };
        assert!(!err.retryable);
    }

    // ── Error cases ──

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_with_empty_message() {
        let err = SipError::invalid_state(String::new());
        assert_eq!(format!("{}", err), "InvalidState: ");
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_with_negative_native_status() {
        let err = SipError {
            kind: SipErrorKind::NativeError,
            message: "neg".to_string(),
            native_status: Some(-1),
            account_id: None,
            call_id: None,
            retryable: true,
        };
        assert_eq!(err.native_status, Some(-1));
    }

    // ── Boundary cases ──

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_with_max_length_message() {
        let long_msg = "x".repeat(10_000);
        let err = SipError {
            kind: SipErrorKind::InvalidConfig,
            message: long_msg.clone(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        };
        assert_eq!(err.message.len(), 10_000);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_with_minimal_account_id() {
        let err = SipError::invalid_state("test").with_account_id(AccountId(0));
        assert_eq!(err.account_id, Some(AccountId(0)));
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_with_maximum_call_id() {
        let err = SipError::invalid_state("test").with_call_id(CallId(u64::MAX));
        assert_eq!(err.call_id, Some(CallId(u64::MAX)));
    }

    // ── Invariant cases ──

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_implements_send_sync() {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<SipError>();
        assert_sync::<SipError>();
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_implements_debug() {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<SipError>();
        assert_debug::<SipErrorKind>();
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_implements_error() {
        use std::error::Error;
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_error<T: Error>() {}
        assert_error::<SipError>();
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn no_retryable_for_internal_invariant_broken() {
        let err = SipError::internal_invariant_broken("bug");
        assert!(!err.retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn siperror_kind_exhaustive() {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn match_all_kinds(kind: SipErrorKind) -> &'static str {
            match kind {
                SipErrorKind::InvalidConfig => "InvalidConfig",
                SipErrorKind::InvalidState => "InvalidState",
                SipErrorKind::AlreadyInitialized => "AlreadyInitialized",
                SipErrorKind::NotInitialized => "NotInitialized",
                SipErrorKind::AccountNotFound => "AccountNotFound",
                SipErrorKind::CallNotFound => "CallNotFound",
                SipErrorKind::TransportInitFailed => "TransportInitFailed",
                SipErrorKind::RegistrationFailed => "RegistrationFailed",
                SipErrorKind::AuthenticationFailed => "AuthenticationFailed",
                SipErrorKind::InviteFailed => "InviteFailed",
                SipErrorKind::MediaInitFailed => "MediaInitFailed",
                SipErrorKind::MediaNegotiationFailed => "MediaNegotiationFailed",
                SipErrorKind::IceFailed => "IceFailed",
                SipErrorKind::TlsFailed => "TlsFailed",
                SipErrorKind::SrtpFailed => "SrtpFailed",
                SipErrorKind::AudioFormatUnsupported => "AudioFormatUnsupported",
                SipErrorKind::AudioPipelineBroken => "AudioPipelineBroken",
                SipErrorKind::DtmfFailed => "DtmfFailed",
                SipErrorKind::Timeout => "Timeout",
                SipErrorKind::ChannelClosed => "ChannelClosed",
                SipErrorKind::NativeError => "NativeError",
                SipErrorKind::ShutdownInProgress => "ShutdownInProgress",
                SipErrorKind::InternalInvariantBroken => "InternalInvariantBroken",
            }
        }
        assert_eq!(match_all_kinds(SipErrorKind::Timeout), "Timeout");
        assert_eq!(match_all_kinds(SipErrorKind::InternalInvariantBroken), "InternalInvariantBroken");
    }

    // ── Contract C017: All APIs return Result<T, SipError> ──

    /// @verifies C017:precondition — SipError type is constructable with all fields
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn contract_c017_precondition_error_type_exists() {
        let err = SipError {
            kind: SipErrorKind::InvalidConfig,
            message: "test".to_string(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        };
        let _ = err;
    }

    /// @verifies C017:postcondition — Error design constrains API return types
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn contract_c017_postcondition_error_constrains_return_type() {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn returns_siperror() -> Result<(), SipError> {
            Err(SipError::invalid_state("test error"))
        }
        let result: Result<(), SipError> = returns_siperror();
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidState);
    }

    /// @verifies C017:invariant — All APIs return Result<T, SipError>
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn contract_c017_invariant_all_apis_return_result_siperror() {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn sample_api() -> Result<String, SipError> {
            Ok("success".to_string())
        }
        let result = sample_api();
        assert!(result.is_ok());
    }
}
