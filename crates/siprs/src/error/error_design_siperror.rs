// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.

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

use crate::runtime::command::ReactorError;

// ---------------------------------------------------------------------------
// PJSUA error code constants
//
// [::STUB::] P2-4: Replace these manually-defined constants with the actual
// pj_status_t values from pjsua.h once the FFI layer is integrated.
// These values match the PJSIP documentation for each error code.
// ---------------------------------------------------------------------------

/// PJ_SUCCESS — no error.
const PJ_SUCCESS: i32 = 0;
/// PJ_ENOMEM — out of memory.
const PJ_ENOMEM: i32 = -2;
/// PJ_EINVALIDOP — invalid operation.
const PJ_EINVALIDOP: i32 = 150002;
/// PJ_EBUSY — resource busy.
const PJ_EBUSY: i32 = 150003;

// ---------------------------------------------------------------------------
// SipErrorKind — 23 semantically-named error variants
// ---------------------------------------------------------------------------

/// Semantic classification of a `SipError`.
///
/// Each variant represents a distinct category of failure in the SIP stack.
/// The 23 variants cover all siprs operations: configuration, registration,
/// call setup, media, transport, DTMF, shutdown, and internal invariants.
///
/// # Invariant
/// Exactly 23 variants exist (verified by `variant_count()` test).
/// No M20 command-specific variants are added — M20 errors reuse existing
/// variants (InvalidState, AccountNotFound, NativeError).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SipErrorKind {
    /// The provided configuration is invalid.
    InvalidConfig,
    /// The operation is not valid in the current state.
    InvalidState,
    /// The client is already initialized — cannot initialize again.
    AlreadyInitialized,
    /// The client has not been initialized yet.
    NotInitialized,
    /// The specified SIP account was not found.
    AccountNotFound,
    /// The specified call was not found.
    CallNotFound,
    /// Transport initialisation failed.
    TransportInitFailed,
    /// SIP registration with the proxy failed.
    RegistrationFailed,
    /// Authentication with the SIP proxy failed.
    AuthenticationFailed,
    /// Placing an outgoing SIP call failed.
    InviteFailed,
    /// Media session initialisation failed.
    MediaInitFailed,
    /// Media codec negotiation failed.
    MediaNegotiationFailed,
    /// ICE negotiation failed.
    IceFailed,
    /// TLS handshake or connection failed.
    TlsFailed,
    /// SRTP setup or key exchange failed.
    SrtpFailed,
    /// The remote audio format is not supported.
    AudioFormatUnsupported,
    /// The local audio pipeline (capture/playback) is broken.
    AudioPipelineBroken,
    /// Sending DTMF digits failed.
    DtmfFailed,
    /// The operation timed out.
    Timeout,
    /// The signalling channel was closed unexpectedly.
    ChannelClosed,
    /// An underlying PJSUA/PJSIP API call failed.
    NativeError,
    /// The client is in the process of shutting down.
    ShutdownInProgress,
    /// An internal invariant was violated — this is a bug.
    InternalInvariantBroken,
}

// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
impl std::fmt::Display for SipErrorKind {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            Self::InvalidConfig => "InvalidConfig",
            Self::InvalidState => "InvalidState",
            Self::AlreadyInitialized => "AlreadyInitialized",
            Self::NotInitialized => "NotInitialized",
            Self::AccountNotFound => "AccountNotFound",
            Self::CallNotFound => "CallNotFound",
            Self::TransportInitFailed => "TransportInitFailed",
            Self::RegistrationFailed => "RegistrationFailed",
            Self::AuthenticationFailed => "AuthenticationFailed",
            Self::InviteFailed => "InviteFailed",
            Self::MediaInitFailed => "MediaInitFailed",
            Self::MediaNegotiationFailed => "MediaNegotiationFailed",
            Self::IceFailed => "IceFailed",
            Self::TlsFailed => "TlsFailed",
            Self::SrtpFailed => "SrtpFailed",
            Self::AudioFormatUnsupported => "AudioFormatUnsupported",
            Self::AudioPipelineBroken => "AudioPipelineBroken",
            Self::DtmfFailed => "DtmfFailed",
            Self::Timeout => "Timeout",
            Self::ChannelClosed => "ChannelClosed",
            Self::NativeError => "NativeError",
            Self::ShutdownInProgress => "ShutdownInProgress",
            Self::InternalInvariantBroken => "InternalInvariantBroken",
        };
        write!(f, "{name}")
    }
}

// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
impl SipErrorKind {
    /// Returns `true` if operations producing this error are typically retryable.
    ///
    /// Transient errors (network, media negotiation, resource contention)
    /// are retryable. Configuration errors and terminal states are not.
    pub fn retryable(&self) -> bool {
        match self {
            Self::InvalidConfig
            | Self::InvalidState
            | Self::AlreadyInitialized
            | Self::NotInitialized
            | Self::AuthenticationFailed
            | Self::AudioFormatUnsupported
            | Self::AudioPipelineBroken
            | Self::DtmfFailed
            | Self::ShutdownInProgress
            | Self::InternalInvariantBroken => false,

            Self::AccountNotFound
            | Self::CallNotFound
            | Self::TransportInitFailed
            | Self::RegistrationFailed
            | Self::InviteFailed
            | Self::MediaInitFailed
            | Self::MediaNegotiationFailed
            | Self::IceFailed
            | Self::TlsFailed
            | Self::SrtpFailed
            | Self::Timeout
            | Self::ChannelClosed
            | Self::NativeError => true,
        }
    }
}

// ---------------------------------------------------------------------------
// SipError — the crate's public error type
// ---------------------------------------------------------------------------

/// The top-level error type for the siprs public API.
///
/// All public async functions return `Result<T, SipError>`. The `kind` field
/// provides semantic classification via `SipErrorKind`. The `retryable` flag
/// guides caller retry logic. Optional context fields (`account_id`, `call_id`,
/// `native_status`) enrich diagnostic information.
///
/// # Invariant
/// - `SipError` is `Send + Sync` for async API compatibility.
/// - Struct has exactly 6 public fields.
/// - Once constructed, immutable — `with_*` methods return new instances.
#[derive(Debug, Clone, thiserror::Error)]
#[error("{kind}: {message}")]
pub struct SipError {
    /// Semantic classification of the error.
    pub kind: SipErrorKind,
    /// Human-readable diagnostic message.
    pub message: String,
    /// Optional PJSUA/PJSIP native error code.
    ///
    /// `Some(status)` when the error originates from an FFI call.
    /// `None` for errors that do not involve the native stack.
    ///
    /// [::STUB::] P0-7: Replace `Option<u64>` with `Option<AccountId>` /
    /// `Option<CallId>` newtypes once P0-7 (N0012) is implemented.
    pub native_status: Option<i32>,
    /// Optional account ID associated with this error.
    pub account_id: Option<u64>,
    /// Optional call ID associated with this error.
    pub call_id: Option<u64>,
    /// Whether the caller should consider retrying the operation.
    ///
    /// `true` for transient failures (timeout, network, resource contention).
    /// `false` for permanent failures (invalid config, auth denied, shutdown).
    pub retryable: bool,
}

// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
impl SipError {
    /// Create a new `SipError` with the given `kind` and `message`.
    ///
    /// The `retryable` flag is automatically set based on `SipErrorKind::retryable()`.
    /// Context fields (`native_status`, `account_id`, `call_id`) default to `None`.
    pub fn new(kind: SipErrorKind, message: impl Into<String>) -> Self {
        let retryable = kind.retryable();
        Self {
            kind,
            message: message.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable,
        }
    }

    /// Create a convenience `SipError` with `kind = InvalidState`.
    ///
    /// `retryable` is set to `InvalidState::retryable()` (typically `false`)
    /// because an invalid-state error indicates a programming or sequencing
    /// error rather than a transient condition.
    pub fn invalid_state(message: impl Into<String>) -> Self {
        Self::new(SipErrorKind::InvalidState, message)
    }

    /// Create a convenience `SipError` with `kind = NativeError`.
    ///
    /// `retryable` is set to `NativeError::retryable()` (typically `true`)
    /// because most native PJSUA errors are transient (resource contention,
    /// network issues, temporary FFI failures).
    pub fn internal_error(message: impl Into<String>) -> Self {
        Self::new(SipErrorKind::NativeError, message)
    }

    /// Return a new `SipError` with the `account_id` field set.
    ///
    /// All other fields are preserved from `self`.
    pub fn with_account_id(self, account_id: u64) -> Self {
        Self {
            account_id: Some(account_id),
            ..self
        }
    }

    /// Return a new `SipError` with the `call_id` field set.
    ///
    /// All other fields are preserved from `self`.
    pub fn with_call_id(self, call_id: u64) -> Self {
        Self {
            call_id: Some(call_id),
            ..self
        }
    }
}

// ---------------------------------------------------------------------------
// Error conversion: ReactorError → SipError
// ---------------------------------------------------------------------------

// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
impl From<ReactorError> for SipError {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn from(err: ReactorError) -> Self {
        match err {
            ReactorError::ReactorDown => SipError::new(
                SipErrorKind::ShutdownInProgress,
                "reactor thread is down",
            ),
            ReactorError::NotInitialized(msg) => {
                SipError::new(SipErrorKind::NotInitialized, msg)
            }
            ReactorError::BackendError(msg) => {
                SipError::new(SipErrorKind::NativeError, msg)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// pj_status_t to SipErrorKind conversion
// ---------------------------------------------------------------------------

/// Convert a PJSUA `pj_status_t` value to a semantic `SipErrorKind`.
///
/// Returns `None` for `PJ_SUCCESS` (no error). Maps known error codes to
/// specific variants; all unknown codes map to `NativeError`.
///
/// [::STUB::] P2-4: Once the FFI layer provides actual `pj_status_t` constants
/// from `pjsua.h`, this function should be updated to use the real values.
pub fn convert_pj_status(status: i32) -> Option<SipErrorKind> {
    match status {
        PJ_SUCCESS => None,
        PJ_ENOMEM => Some(SipErrorKind::NativeError),
        PJ_EINVALIDOP => Some(SipErrorKind::NativeError),
        PJ_EBUSY => Some(SipErrorKind::NativeError),
        _ => Some(SipErrorKind::NativeError),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: SipError construction ──────────────────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_new_creates_with_correct_kind_and_message() {
        let err = SipError::new(SipErrorKind::InvalidConfig, "bad host");
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert_eq!(err.message, "bad host");
        assert_eq!(err.native_status, None);
        assert_eq!(err.account_id, None);
        assert_eq!(err.call_id, None);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_new_sets_retryable_true_for_transient_variants() {
        assert!(SipError::new(SipErrorKind::AccountNotFound, "").retryable);
        assert!(SipError::new(SipErrorKind::Timeout, "").retryable);
        assert!(SipError::new(SipErrorKind::NativeError, "").retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_new_sets_retryable_false_for_permanent_variants() {
        assert!(!SipError::new(SipErrorKind::InvalidConfig, "").retryable);
        assert!(!SipError::new(SipErrorKind::ShutdownInProgress, "").retryable);
        assert!(!SipError::new(SipErrorKind::InternalInvariantBroken, "").retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_with_account_id_sets_field() {
        let err = SipError::new(SipErrorKind::AccountNotFound, "not found")
            .with_account_id(42);
        assert_eq!(err.account_id, Some(42));
        assert_eq!(err.kind, SipErrorKind::AccountNotFound);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_with_call_id_sets_field() {
        let err = SipError::new(SipErrorKind::CallNotFound, "not found")
            .with_call_id(99);
        assert_eq!(err.call_id, Some(99));
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_with_account_id_preserves_existing_account_id() {
        // Calling with_account_id twice should keep the second value
        let err = SipError::new(SipErrorKind::AccountNotFound, "")
            .with_account_id(1)
            .with_account_id(2);
        assert_eq!(err.account_id, Some(2));
        assert_eq!(err.call_id, None);
    }

    // ── Normal: Display & Debug ───────────────────────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_display_format_is_kind_colon_message() {
        let err = SipError::new(SipErrorKind::InvalidConfig, "bad host");
        assert_eq!(format!("{err}"), "InvalidConfig: bad host");
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_debug_includes_all_fields() {
        let err = SipError {
            kind: SipErrorKind::InvalidConfig,
            message: "err".into(),
            native_status: Some(123),
            account_id: Some(456),
            call_id: Some(789),
            retryable: true,
        };
        let debug = format!("{err:?}");
        assert!(debug.contains("InvalidConfig"), "Debug must show kind");
        assert!(debug.contains("native_status: Some(123)"), "Debug must show native_status");
        assert!(debug.contains("account_id: Some(456)"), "Debug must show account_id");
        assert!(debug.contains("call_id: Some(789)"), "Debug must show call_id");
        assert!(debug.contains("retryable: true"), "Debug must show retryable");
    }

    // ── Normal: Convenience constructors ──────────────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_invalid_state_uses_correct_kind() {
        let err = SipError::invalid_state("bad state");
        assert_eq!(err.kind, SipErrorKind::InvalidState);
        assert_eq!(err.message, "bad state");
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_internal_error_uses_correct_kind() {
        let err = SipError::internal_error("ffi failed");
        assert_eq!(err.kind, SipErrorKind::NativeError);
        assert_eq!(err.message, "ffi failed");
        assert!(err.retryable);
    }

    // ── Normal: From<ReactorError> conversion ─────────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn from_reactor_error_reactor_down_maps_to_shutdown_in_progress() {
        let sip: SipError = ReactorError::ReactorDown.into();
        assert_eq!(sip.kind, SipErrorKind::ShutdownInProgress);
        assert!(!sip.retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn from_reactor_error_not_initialized_preserves_message() {
        let sip: SipError = ReactorError::NotInitialized("no boot".into()).into();
        assert_eq!(sip.kind, SipErrorKind::NotInitialized);
        assert_eq!(sip.message, "no boot");
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn from_reactor_error_backend_error_maps_to_native() {
        let sip: SipError = ReactorError::BackendError("pjsua failed".into()).into();
        assert_eq!(sip.kind, SipErrorKind::NativeError);
        assert_eq!(sip.message, "pjsua failed");
        assert!(sip.retryable);
    }

    // ── Normal: convert_pj_status ─────────────────────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn convert_pj_status_success_returns_none() {
        assert!(convert_pj_status(PJ_SUCCESS).is_none());
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn convert_pj_status_known_errors_map_to_native() {
        assert_eq!(convert_pj_status(PJ_ENOMEM), Some(SipErrorKind::NativeError));
        assert_eq!(convert_pj_status(PJ_EINVALIDOP), Some(SipErrorKind::NativeError));
        assert_eq!(convert_pj_status(PJ_EBUSY), Some(SipErrorKind::NativeError));
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn convert_pj_status_unknown_error_falls_back_to_native() {
        assert_eq!(convert_pj_status(-9999), Some(SipErrorKind::NativeError));
    }

    // ── Error: SipError with all context fields ───────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_with_all_fields_round_trips_correctly() {
        let err = SipError {
            kind: SipErrorKind::InvalidConfig,
            message: "err".into(),
            native_status: Some(123),
            account_id: Some(456),
            call_id: Some(789),
            retryable: true,
        };
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert_eq!(err.message, "err");
        assert_eq!(err.native_status, Some(123));
        assert_eq!(err.account_id, Some(456));
        assert_eq!(err.call_id, Some(789));
        assert!(err.retryable);
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_with_no_context_fields_returns_none() {
        let err = SipError::new(SipErrorKind::Timeout, "timeout");
        assert!(err.native_status.is_none());
        assert!(err.account_id.is_none());
        assert!(err.call_id.is_none());
    }

    // ── Boundary: empty message ───────────────────────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_accepts_empty_message() {
        let err = SipError::new(SipErrorKind::InvalidConfig, "");
        assert_eq!(err.message, "");
        assert_eq!(format!("{err}"), "InvalidConfig: ");
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_with_account_id_zero_is_valid() {
        // Account ID 0 is a valid sentinel — not treated as None
        let err = SipError::new(SipErrorKind::AccountNotFound, "")
            .with_account_id(0);
        assert_eq!(err.account_id, Some(0));
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_with_call_id_zero_is_valid() {
        let err = SipError::new(SipErrorKind::CallNotFound, "")
            .with_call_id(0);
        assert_eq!(err.call_id, Some(0));
    }

    // ── Invariant: Send + Sync ────────────────────────────────────────

    #[test]
    #[allow(clippy::extra_unused_type_parameters)]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_is_send_sync() {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<SipError>();
        assert_sync::<SipError>();
    }

    // ── Invariant: SipErrorKind traits ────────────────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_kind_implements_required_traits() {
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_clone::<SipErrorKind>();
        assert_copy::<SipErrorKind>();
        assert_partial_eq::<SipErrorKind>();
        assert_eq_trait::<SipErrorKind>();
        assert_debug::<SipErrorKind>();
    }

    // ── Invariant: SipErrorKind variant count = 23 ────────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_kind_variant_count_is_23() {
        // @verifies C018

        const EXPECTED: usize = 23;
        let all = vec![
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
        assert_eq!(all.len(), EXPECTED,
            "SipErrorKind must have exactly {EXPECTED} variants. \
             If a variant was added/removed, update both the enum and this test."
        );
    }

    // ── Invariant: SipErrorKind::retryable() consistency ──────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_error_kind_retryable_is_consistent_with_new() {
        // SipError::new() must set retryable to the same value as kind.retryable()
        let all = [
            (SipErrorKind::InvalidConfig, false),
            (SipErrorKind::InvalidState, false),
            (SipErrorKind::AlreadyInitialized, false),
            (SipErrorKind::NotInitialized, false),
            (SipErrorKind::AccountNotFound, true),
            (SipErrorKind::CallNotFound, true),
            (SipErrorKind::TransportInitFailed, true),
            (SipErrorKind::RegistrationFailed, true),
            (SipErrorKind::AuthenticationFailed, false),
            (SipErrorKind::InviteFailed, true),
            (SipErrorKind::MediaInitFailed, true),
            (SipErrorKind::MediaNegotiationFailed, true),
            (SipErrorKind::IceFailed, true),
            (SipErrorKind::TlsFailed, true),
            (SipErrorKind::SrtpFailed, true),
            (SipErrorKind::AudioFormatUnsupported, false),
            (SipErrorKind::AudioPipelineBroken, false),
            (SipErrorKind::DtmfFailed, false),
            (SipErrorKind::Timeout, true),
            (SipErrorKind::ChannelClosed, true),
            (SipErrorKind::NativeError, true),
            (SipErrorKind::ShutdownInProgress, false),
            (SipErrorKind::InternalInvariantBroken, false),
        ];
        for (kind, expected_retryable) in &all {
            assert_eq!(
                kind.retryable(),
                *expected_retryable,
                "retryable flag mismatch for {kind:?}"
            );
            let err = SipError::new(*kind, "");
            assert_eq!(
                err.retryable,
                *expected_retryable,
                "SipError::new retryable mismatch for {kind:?}"
            );
        }
    }

    // ── Contract: C017 exhaustive match over all kinds ────────────────

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    // @verifies C017
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn exhaustive_match_over_sip_error_kind_has_23_branches() {
        // If a variant is added without updating this match, the test
        // fails to compile — guaranteeing exhaustive coverage.
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn classify(kind: SipErrorKind) -> &'static str {
            match kind {
                SipErrorKind::InvalidConfig => "config",
                SipErrorKind::InvalidState => "state",
                SipErrorKind::AlreadyInitialized => "init",
                SipErrorKind::NotInitialized => "not_init",
                SipErrorKind::AccountNotFound => "account",
                SipErrorKind::CallNotFound => "call",
                SipErrorKind::TransportInitFailed => "transport",
                SipErrorKind::RegistrationFailed => "registration",
                SipErrorKind::AuthenticationFailed => "auth",
                SipErrorKind::InviteFailed => "invite",
                SipErrorKind::MediaInitFailed => "media_init",
                SipErrorKind::MediaNegotiationFailed => "media_neg",
                SipErrorKind::IceFailed => "ice",
                SipErrorKind::TlsFailed => "tls",
                SipErrorKind::SrtpFailed => "srtp",
                SipErrorKind::AudioFormatUnsupported => "audio_fmt",
                SipErrorKind::AudioPipelineBroken => "audio_pipe",
                SipErrorKind::DtmfFailed => "dtmf",
                SipErrorKind::Timeout => "timeout",
                SipErrorKind::ChannelClosed => "channel",
                SipErrorKind::NativeError => "native",
                SipErrorKind::ShutdownInProgress => "shutdown",
                SipErrorKind::InternalInvariantBroken => "invariant",
            }
        }
        // Smoke-test a few variants — the real validation is compile-time
        assert_eq!(classify(SipErrorKind::InvalidConfig), "config");
        assert_eq!(classify(SipErrorKind::NativeError), "native");
        assert_eq!(classify(SipErrorKind::InternalInvariantBroken), "invariant");
    }
}
