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
//   - NODE_ID=N0048:  §37 Incoming Call & §38 REFER/Transfer
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0048 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================
//
// [::TICKET::] P5-2: Incoming call and REFER/transfer types per N0048
//
// This module defines the pure data types for incoming call notification,
// REFER-based call transfer requests, and transfer completion events.
// Event bus integration (firing SipEventPayload::IncomingCall) is handled
// by the Reactor in P5-3.

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

// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
impl Default for IncomingCallConfig {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
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

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
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

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
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

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn incoming_call_config_defaults() {
        let config = IncomingCallConfig::default();
        assert!(!config.auto_reject_enabled);
        assert_eq!(config.reject_timeout_ms, DEFAULT_AUTO_REJECT_TIMEOUT_MS);
    }

    // ── Error: IncomingCall with empty URIs ──────────────────────────────

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
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

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
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

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn incoming_call_config_custom_values() {
        let config = IncomingCallConfig {
            auto_reject_enabled: true,
            reject_timeout_ms: 10_000,
        };
        assert!(config.auto_reject_enabled);
        assert_eq!(config.reject_timeout_ms, 10_000);
    }

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn incoming_call_config_zero_timeout() {
        let config = IncomingCallConfig {
            auto_reject_enabled: true,
            reject_timeout_ms: 0,
        };
        assert!(config.auto_reject_enabled);
        assert_eq!(config.reject_timeout_ms, 0);
    }

    // ── Boundary: IncomingCall with extreme field values ─────────────────

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
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

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn incoming_call_is_clone_and_debug() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<IncomingCall>();
        assert_clone_debug::<IncomingCallConfig>();
    }

    /// @verifies C049
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn incoming_call_config_is_partial_eq() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
        assert_partial_eq::<IncomingCallConfig>();
    }
}
