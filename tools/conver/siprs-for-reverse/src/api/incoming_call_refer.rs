
use crate::api::call_types::Codec;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default timeout in milliseconds for the auto-reject timer on unanswered
/// incoming calls. The call is automatically rejected if not answered within
/// this window and `IncomingCallConfig::auto_reject_enabled` is `true`.
pub const DEFAULT_AUTO_REJECT_TIMEOUT_MS: u64 = 30_000;

// ---------------------------------------------------------------------------
// IncomingCall
// ---------------------------------------------------------------------------

/// Information about an incoming call, emitted as `SipEventPayload::IncomingCall`.
///
/// This struct provides the SIP-level call metadata received in the INVITE
/// request, before the application decides to answer, reject, or ignore the call.
///
/// # Contract (C049)
/// - All URI fields are valid UTF-8 SIP URIs.
/// - `from_uri` and `to_uri` are always present (non-empty, but validation is
///   at the PJSIP layer — the struct accepts empty strings gracefully).
/// - `offered_codecs` may be empty if the SDP negotiation has not started
///   (pre-negotiation state).
#[derive(Debug, Clone)]
pub struct IncomingCall {
    /// SIP URI of the caller (From header).
    pub from_uri: String,
    /// SIP URI of the callee (To header).
    pub to_uri: String,
    /// Display name of the caller, if present in the From header.
    pub display_name: Option<String>,
    /// SIP headers from the incoming INVITE (name-value pairs).
    pub headers: Vec<(String, String)>,
    /// Codecs offered by the caller in the SDP body, if available.
    pub offered_codecs: Vec<Codec>,
    /// Whether early media (183 Session Progress) has been received.
    pub has_early_media: bool,
}

// ---------------------------------------------------------------------------
// IncomingCallConfig
// ---------------------------------------------------------------------------

/// Configuration for handling incoming calls.
///
/// Controls whether unanswered incoming calls are automatically rejected
/// after a configurable timeout.
///
/// # Contract (C049)
/// - `auto_reject_enabled` defaults to `false` (no auto-reject).
/// - `reject_timeout_ms` defaults to `DEFAULT_AUTO_REJECT_TIMEOUT_MS` (30s).
#[derive(Debug, Clone, PartialEq)]
pub struct IncomingCallConfig {
    /// If `true`, unanswered incoming calls are automatically rejected
    /// after `reject_timeout_ms`.
    pub auto_reject_enabled: bool,
    /// Timeout in milliseconds before auto-reject fires.
    pub reject_timeout_ms: u64,
}

impl Default for IncomingCallConfig {
    fn default() -> Self {
        Self {
            auto_reject_enabled: false,
            reject_timeout_ms: DEFAULT_AUTO_REJECT_TIMEOUT_MS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: IncomingCall construction ────────────────────────────────

    #[test]
    fn incoming_call_all_fields() {
        let call = IncomingCall {
            from_uri: "sip:alice@example.com".into(),
            to_uri: "sip:bob@example.com".into(),
            display_name: Some("Alice".into()),
            headers: vec![
                ("User-Agent".into(), "PJSIP".into()),
                ("X-Custom".into(), "value".into()),
            ],
            offered_codecs: vec![Codec::Pcmu, Codec::Opus],
            has_early_media: false,
        };
        assert_eq!(call.from_uri, "sip:alice@example.com");
        assert_eq!(call.to_uri, "sip:bob@example.com");
        assert_eq!(call.display_name.as_deref(), Some("Alice"));
        assert_eq!(call.headers.len(), 2);
        assert_eq!(call.offered_codecs.len(), 2);
        assert!(!call.has_early_media);
    }

    #[test]
    fn incoming_call_minimal_fields() {
        let call = IncomingCall {
            from_uri: "sip:alice@example.com".into(),
            to_uri: "sip:bob@example.com".into(),
            display_name: None,
            headers: vec![],
            offered_codecs: vec![],
            has_early_media: true,
        };
        assert_eq!(call.from_uri, "sip:alice@example.com");
        assert!(call.display_name.is_none());
        assert!(call.headers.is_empty());
        assert!(call.offered_codecs.is_empty());
        assert!(call.has_early_media);
    }

    // ── Normal: IncomingCallConfig defaults ──────────────────────────────

    #[test]
    fn incoming_call_config_defaults() {
        let config = IncomingCallConfig::default();
        assert!(!config.auto_reject_enabled);
        assert_eq!(config.reject_timeout_ms, DEFAULT_AUTO_REJECT_TIMEOUT_MS);
    }

    // ── Error: IncomingCall with empty URIs ──────────────────────────────

    #[test]
    fn incoming_call_empty_from_uri_does_not_panic() {
        let call = IncomingCall {
            from_uri: String::new(),
            to_uri: "sip:bob@example.com".into(),
            display_name: None,
            headers: vec![],
            offered_codecs: vec![],
            has_early_media: false,
        };
        assert!(call.from_uri.is_empty());
        // Accessing all fields should not panic
        let _ = format!("{call:?}");
    }

    #[test]
    fn incoming_call_empty_to_uri_does_not_panic() {
        let call = IncomingCall {
            from_uri: "sip:alice@example.com".into(),
            to_uri: String::new(),
            display_name: None,
            headers: vec![],
            offered_codecs: vec![],
            has_early_media: false,
        };
        assert!(call.to_uri.is_empty());
        let _ = format!("{call:?}");
    }

    // ── Boundary: IncomingCallConfig custom values ──────────────────────

    #[test]
    fn incoming_call_config_custom_values() {
        let config = IncomingCallConfig {
            auto_reject_enabled: true,
            reject_timeout_ms: 10_000,
        };
        assert!(config.auto_reject_enabled);
        assert_eq!(config.reject_timeout_ms, 10_000);
    }

    #[test]
    fn incoming_call_config_zero_timeout() {
        let config = IncomingCallConfig {
            auto_reject_enabled: true,
            reject_timeout_ms: 0,
        };
        assert!(config.auto_reject_enabled);
        assert_eq!(config.reject_timeout_ms, 0);
    }

    // ── Boundary: IncomingCall with extreme field values ─────────────────

    #[test]
    fn incoming_call_large_headers() {
        let many_headers: Vec<(String, String)> = (0..100)
            .map(|i| (format!("X-Header-{i}"), format!("value-{i}")))
            .collect();
        let call = IncomingCall {
            from_uri: "sip:a@b.com".into(),
            to_uri: "sip:c@d.com".into(),
            display_name: None,
            headers: many_headers.clone(),
            offered_codecs: vec![],
            has_early_media: false,
        };
        assert_eq!(call.headers.len(), 100);
    }

    // ── Invariant: Compile-time trait bounds ──────────────────────────

    #[test]
    fn incoming_call_is_clone_and_debug() {
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<IncomingCall>();
        assert_clone_debug::<IncomingCallConfig>();
    }

    #[test]
    fn incoming_call_config_is_partial_eq() {
        fn assert_partial_eq<T: PartialEq>() {}
        assert_partial_eq::<IncomingCallConfig>();
    }
}
