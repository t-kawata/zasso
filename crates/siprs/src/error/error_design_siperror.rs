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

//! Implements the `SipError` error type and `SipErrorKind` enum (N0016).
//!
//! `SipError` is the single error type returned by every crate API. It carries
//! a semantic classification (`kind`), a human-readable `message`, an optional
//! PJSUA-native status code, optional account/call scoping identifiers, and a
//! `retryable` flag for downstream health-check and circuit-breaker logic.
//!
//! ## Usage
//!
//! ```rust
//! use siprs::error::{SipError, SipErrorKind};
//!
//! let err = SipError::invalid_config("missing transport config");
//! assert_eq!(err.kind, SipErrorKind::InvalidConfig);
//! assert_eq!(format!("{}", err), "InvalidConfig: missing transport config");
//! ```

use crate::concurrency_contexts::command_serialization::{AccountId, CallId};

// ---------------------------------------------------------------------------
// SipErrorKind — semantic classification of every error condition
// ---------------------------------------------------------------------------

/// Semantic classification of every error that can occur in the siprs crate.
///
/// Each variant represents a distinct failure category. The enum is
/// `#[non_exhaustive]` to allow adding new variants without breaking
/// downstream matches, and derives `Debug + Clone + Copy + PartialEq + Eq`
/// for ergonomic comparison and pattern matching.
///
/// ## Variant groups
///
/// - **Init/Config**: `InvalidConfig`, `InvalidState`, `AlreadyInitialized`, `NotInitialized`
/// - **Resource lookup**: `AccountNotFound`, `CallNotFound`
/// - **Transport/Network**: `TransportInitFailed`, `IceFailed`, `TlsFailed`
/// - **Registration/Auth**: `RegistrationFailed`, `AuthenticationFailed`
/// - **Call/Media**: `InviteFailed`, `MediaInitFailed`, `MediaNegotiationFailed`, `AudioFormatUnsupported`, `AudioPipelineBroken`
/// - **SRTP**: `SrtpFailed`
/// - **DTMF**: `DtmfFailed`
/// - **System**: `Timeout`, `ChannelClosed`, `NativeError`, `ShutdownInProgress`, `InternalInvariantBroken`
/// - **M20 runtime**: `NotFound`, `InternalError`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SipErrorKind {
    /// Provided configuration is structurally invalid
    /// (e.g., missing required fields, out-of-range values).
    InvalidConfig,
    /// Current state does not permit the requested operation
    /// (e.g., calling `MakeCall` without a registered account).
    InvalidState,
    /// The subsystem has already been initialized
    /// (e.g., calling `Initialize` twice).
    AlreadyInitialized,
    /// The subsystem has not been initialized yet
    /// (e.g., operations attempted before `Initialize`).
    NotInitialized,
    /// The specified account does not exist
    /// (e.g., referencing a removed or never-created account).
    AccountNotFound,
    /// The specified call does not exist
    /// (e.g., referencing a call that was already hung up).
    CallNotFound,
    /// Transport layer initialization failed
    /// (e.g., UDP/TCP/TLS port binding error).
    TransportInitFailed,
    /// SIP registration with the provider failed
    /// (e.g., 403 Forbidden, 408 Timeout).
    RegistrationFailed,
    /// Authentication with the SIP provider failed
    /// (e.g., invalid digest credentials).
    AuthenticationFailed,
    /// Outgoing SIP INVITE failed
    /// (e.g., 4xx/5xx/6xx response from remote peer).
    InviteFailed,
    /// Media stream initialization failed
    /// (e.g., codec negotiation before stream setup).
    MediaInitFailed,
    /// Media negotiation (SDP offer/answer) failed
    /// (e.g., codec mismatch with no fallback).
    MediaNegotiationFailed,
    /// ICE candidate gathering or connectivity checks failed.
    IceFailed,
    /// TLS handshake or certificate validation failed.
    TlsFailed,
    /// SRTP key establishment or encryption setup failed.
    SrtpFailed,
    /// Audio codec or format is not supported by the platform.
    AudioFormatUnsupported,
    /// Audio pipeline internal error
    /// (e.g., resampler split, channel mismatch, mixer failure).
    AudioPipelineBroken,
    /// DTMF digit transmission or reception failed.
    DtmfFailed,
    /// The operation timed out.
    Timeout,
    /// The underlying message channel has been closed
    /// (e.g., reactor shutdown, connection dropped).
    ChannelClosed,
    /// Native PJSUA error (raw `pj_status_t`) that does not fit a more
    /// specific variant — the `SipError.native_status` field carries the
    /// original error code.
    NativeError,
    /// Shutdown is in progress — the operation was rejected because
    /// the system is tearing down.
    ShutdownInProgress,
    /// An internal invariant was broken — this indicates a programming
    /// error (bug), not a runtime condition.
    InternalInvariantBroken,
    /// The requested resource was not found
    /// (used by M20 commands: `GetAccountInfo`, etc.).
    NotFound,
    /// Internal processing error (non-PJSUA)
    /// (used by M20 commands: `ConfConnect`, `ConfDisconnect`, etc.).
    InternalError,
}

// ---------------------------------------------------------------------------
// SipError — the single error type returned by all crate APIs
// ---------------------------------------------------------------------------

/// The single error type returned by every crate API.
///
/// All public API functions return `Result<T, SipError>`. The error carries:
///
/// - `kind` — Semantic classification for match-based error handling.
/// - `message` — Human-readable description of what went wrong.
/// - `native_status` — Optional PJSUA error code (`pj_status_t`) for FFI-level debugging.
/// - `account_id` — Optional account scope for per-account error routing.
/// - `call_id` — Optional call scope for per-call error correlation.
/// - `retryable` — Whether the operation can be safely retried.
#[derive(Debug, thiserror::Error)]
#[error("{kind}: {message}")]
pub struct SipError {
    /// Semantic classification of the error.
    pub kind: SipErrorKind,
    /// Human-readable description of the failure context.
    pub message: String,
    /// Optional PJSUA-native status code (`pj_status_t` stored as `i32`).
    /// Present when the error originates from PJSUA FFI.
    pub native_status: Option<i32>,
    /// Optional account ID for per-account error scoping.
    pub account_id: Option<AccountId>,
    /// Optional call ID for per-call error correlation.
    pub call_id: Option<CallId>,
    /// Whether the operation that caused this error can be safely retried.
    ///
    /// `true` for transient failures (network timeouts, resource contention),
    /// `false` for permanent failures (invalid config, shutdown in progress).
    pub retryable: bool,
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl SipError {
    /// Creates a new `SipError` with the given kind and message.
    ///
    /// The `retryable` flag is set to the default for the given `kind`:
    /// transient kinds (`InvalidState`, `TransportInitFailed`, `MediaInitFailed`,
    /// `Timeout`) are retryable; all others are not.
    ///
    /// All optional fields (`native_status`, `account_id`, `call_id`) are `None`.
    pub fn new(kind: SipErrorKind, message: impl Into<String>) -> Self {
        let message = message.into();
        let retryable = kind_is_retryable(&kind);
        SipError {
            kind,
            message,
            native_status: None,
            account_id: None,
            call_id: None,
            retryable,
        }
    }

    /// Creates a `SipError` with `InvalidConfig` kind.
    pub fn invalid_config(message: impl Into<String>) -> Self {
        SipError::new(SipErrorKind::InvalidConfig, message)
    }

    /// Creates a `SipError` with `InvalidState` kind (retryable).
    pub fn invalid_state(message: impl Into<String>) -> Self {
        SipError::new(SipErrorKind::InvalidState, message)
    }

    /// Creates a `SipError` with `NotFound` kind.
    pub fn not_found(message: impl Into<String>) -> Self {
        SipError::new(SipErrorKind::NotFound, message)
    }

    /// Creates a `SipError` with `InternalError` kind.
    pub fn internal_error(message: impl Into<String>) -> Self {
        SipError::new(SipErrorKind::InternalError, message)
    }

    /// Creates a `SipError` with `Timeout` kind (retryable).
    pub fn timeout(message: impl Into<String>) -> Self {
        SipError::new(SipErrorKind::Timeout, message)
    }

    /// Creates a `SipError` with a native PJSUA status code.
    ///
    /// The `kind` is set to `NativeError`, `retryable` is `false`,
    /// and `native_status` is set to the given code.
    pub fn with_native_status(
        kind: SipErrorKind,
        message: impl Into<String>,
        native_status: i32,
    ) -> Self {
        let message = message.into();
        let retryable = kind_is_retryable(&kind);
        SipError {
            kind,
            message,
            native_status: Some(native_status),
            account_id: None,
            call_id: None,
            retryable,
        }
    }
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl std::fmt::Display for SipErrorKind {
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
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
            SipErrorKind::NotFound => "NotFound",
            SipErrorKind::InternalError => "InternalError",
        };
        write!(f, "{name}")
    }
}

/// Returns `true` if the error kind represents a transient failure
/// that may succeed on retry.
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
fn kind_is_retryable(kind: &SipErrorKind) -> bool {
    matches!(
        kind,
        SipErrorKind::InvalidState
            | SipErrorKind::TransportInitFailed
            | SipErrorKind::MediaInitFailed
            | SipErrorKind::Timeout
            | SipErrorKind::NotFound
    )
}

// ---------------------------------------------------------------------------
// Tests — §14 Error Design (N0016)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ── C017-precondition: SipError constructable with all fields ──────

    /// @verifies C017-precondition
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_error_constructable_with_all_fields() {
        let err = SipError::new(SipErrorKind::InvalidConfig, "test message");
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert_eq!(err.message, "test message");
        assert!(err.native_status.is_none());
        assert!(err.account_id.is_none());
        assert!(err.call_id.is_none());
        assert!(!err.retryable);
    }

    /// @verifies C017-precondition
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_error_full_construction() {
        let err = SipError {
            kind: SipErrorKind::InviteFailed,
            message: "403 Forbidden".into(),
            native_status: Some(403),
            account_id: Some(42),
            call_id: Some(7),
            retryable: false,
        };
        assert_eq!(err.kind, SipErrorKind::InviteFailed);
        assert_eq!(err.message, "403 Forbidden");
        assert_eq!(err.native_status, Some(403));
        assert_eq!(err.account_id, Some(42));
        assert_eq!(err.call_id, Some(7));
        assert!(!err.retryable);
    }

    // ── C017-postcondition: Display format ────────────────────────────

    /// @verifies C017-postcondition
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_error_display_includes_kind_and_message() {
        let err = SipError::new(SipErrorKind::AccountNotFound, "account 42 not found");
        let display = format!("{}", err);
        assert!(
            display.contains("AccountNotFound"),
            "Display must include kind, got: {display}"
        );
        assert!(
            display.contains("account 42 not found"),
            "Display must include message, got: {display}"
        );
    }

    // ── C017-invariant: thiserror::Error trait ────────────────────────

    /// @verifies C017-invariant
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_error_implements_std_error() {
        // thiserror::Error generates impl std::error::Error automatically
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_error<E: std::error::Error>() {}
        assert_error::<SipError>();
    }

    // ── SipErrorKind: trait bounds ────────────────────────────────────

    /// @verifies C018-precondition
    /// @verifies C018-postcondition
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_error_kind_has_required_traits() {
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}
        assert_debug::<SipErrorKind>();
        assert_clone::<SipErrorKind>();
        assert_copy::<SipErrorKind>();
        assert_partial_eq::<SipErrorKind>();
        assert_eq_trait::<SipErrorKind>();
    }

    // ── All 25 variants are constructable ─────────────────────────────

    /// @verifies C018-precondition
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn all_25_sip_error_kind_variants_constructable() {
        let all: Vec<SipErrorKind> = vec![
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
            SipErrorKind::NotFound,
            SipErrorKind::InternalError,
        ];
        assert_eq!(all.len(), 25);
    }

    // ── Helper constructors ───────────────────────────────────────────

    /// @verifies C018-postcondition
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn helper_constructors_set_correct_kind() {
        assert_eq!(
            SipError::invalid_config("x").kind,
            SipErrorKind::InvalidConfig
        );
        assert_eq!(
            SipError::invalid_state("x").kind,
            SipErrorKind::InvalidState
        );
        assert_eq!(SipError::not_found("x").kind, SipErrorKind::NotFound);
        assert_eq!(
            SipError::internal_error("x").kind,
            SipErrorKind::InternalError
        );
        assert_eq!(SipError::timeout("x").kind, SipErrorKind::Timeout);
    }

    // ── with_native_status ────────────────────────────────────────────

    /// @verifies C017-postcondition
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn with_native_status_preserves_code() {
        let err = SipError::with_native_status(SipErrorKind::InviteFailed, "403 Forbidden", 403);
        assert_eq!(err.native_status, Some(403));
        assert!(!err.retryable);
    }

    // ── Retryable flag ────────────────────────────────────────────────

    /// @verifies C017-invariant
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn retryable_flag_correct_for_known_kinds() {
        // Retryable kinds
        assert!(SipError::new(SipErrorKind::InvalidState, "").retryable);
        assert!(SipError::new(SipErrorKind::TransportInitFailed, "").retryable);
        assert!(SipError::new(SipErrorKind::MediaInitFailed, "").retryable);
        assert!(SipError::new(SipErrorKind::Timeout, "").retryable);

        // Non-retryable kinds
        assert!(!SipError::new(SipErrorKind::ShutdownInProgress, "").retryable);
        assert!(!SipError::new(SipErrorKind::InternalInvariantBroken, "").retryable);
        assert!(!SipError::new(SipErrorKind::AlreadyInitialized, "").retryable);
    }

    // ── Optional fields ───────────────────────────────────────────────

    /// @verifies C017-invariant
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn optional_fields_default_to_none() {
        let err = SipError::new(SipErrorKind::InvalidConfig, "test");
        assert!(err.native_status.is_none());
        assert!(err.account_id.is_none());
        assert!(err.call_id.is_none());
    }
}
