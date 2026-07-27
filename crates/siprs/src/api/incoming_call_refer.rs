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

//! Incoming call and REFER/Transfer data structures.
//!
//! Defines `IncomingCall` — a pure data container describing an inbound SIP
//! call — and `ReferRequest` for blind transfer via the SIP REFER method.
//!
//! ## N0048 → N0027 (C049)
//!
//! Relies on the Call API (P5-1) defining `SipClient::transfer()` and the
//! event bus (`SipEventPayload::IncomingCall`). The structs defined here are
//! consumed as event payloads by the event model.

use crate::api::public_api_design::Codec;
use crate::model::id_design_newtype::CallId;

// ---------------------------------------------------------------------------
// IncomingCall — metadata for an inbound SIP call
// ---------------------------------------------------------------------------

/// Describes an incoming SIP call.
///
/// Emitted as `SipEventPayload::IncomingCall(IncomingCall)` when a new
/// INVITE arrives. The consumer inspects the caller/callee URIs, headers,
/// offered codecs, and early-media flag to decide whether and how to answer.
///
/// All fields are public; this is a pure data container with no behavioural
/// methods.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncomingCall {
    /// SIP URI of the caller (e.g. `"sip:alice@sip.example.com"`).
    pub from_uri: String,
    /// SIP URI of the callee / destination (e.g. `"sip:bob@sip.example.com"`).
    pub to_uri: String,
    /// Human-readable display name of the caller, if present in the INVITE's
    /// From header.
    pub display_name: Option<String>,
    /// Custom SIP headers from the incoming INVITE.
    pub headers: Vec<(String, String)>,
    /// Audio codecs offered by the caller in the SDP body.
    pub offered_codecs: Vec<Codec>,
    /// Whether the caller has early media (e.g., 183 Session Progress with
    /// SDP) before the call is answered.
    pub has_early_media: bool,
}

// ---------------------------------------------------------------------------
// ReferRequest — blind transfer via REFER
// ---------------------------------------------------------------------------

/// Describes a blind call transfer request via the SIP REFER method.
///
/// Blind transfer forwards the call to a new target URI without establishing
/// a consultation call first. The `refer_to_uri` is the transfer destination.
/// The `referred_by_uri` (optional) identifies the transfer initiator.
///
/// Per §38, only blind transfer is supported at this stage — attended transfer
/// (REFER with prior consultation call) is deferred to a future ticket.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReferRequest {
    /// The target SIP URI to which the call should be transferred.
    pub refer_to_uri: String,
    /// SIP URI of the transfer initiator, if present in the REFER's
    /// Referred-By header.
    pub referred_by_uri: Option<String>,
    /// The call ID being transferred.
    pub call_id: CallId,
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C049: Incoming call & REFER/Transfer ───────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C049-precondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn call_api_methods_exist() {
        // CallId type used by ReferRequest
        let call_id = CallId::from_u64(42).unwrap();
        let _req = ReferRequest {
            refer_to_uri: "sip:bob@example.com".to_string(),
            referred_by_uri: None,
            call_id,
        };
    }

    /// @verifies C049-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn incoming_call_all_fields_accessible() {
        let incoming = IncomingCall {
            from_uri: "sip:alice@example.com".to_string(),
            to_uri: "sip:bob@example.com".to_string(),
            display_name: Some("Alice".to_string()),
            headers: vec![("X-Custom".to_string(), "value".to_string())],
            offered_codecs: vec![Codec::Pcmu, Codec::Opus],
            has_early_media: false,
        };
        assert_eq!(incoming.from_uri, "sip:alice@example.com");
        assert_eq!(incoming.to_uri, "sip:bob@example.com");
        assert_eq!(incoming.display_name, Some("Alice".to_string()));
        assert_eq!(incoming.offered_codecs.len(), 2);
        assert!(!incoming.has_early_media);
    }

    /// @verifies C049-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn incoming_call_with_empty_fields() {
        let incoming = IncomingCall {
            from_uri: String::new(),
            to_uri: String::new(),
            display_name: None,
            headers: vec![],
            offered_codecs: vec![],
            has_early_media: false,
        };
        assert!(incoming.from_uri.is_empty());
        assert!(incoming.to_uri.is_empty());
        assert_eq!(incoming.display_name, None);
        assert!(incoming.headers.is_empty());
        assert!(incoming.offered_codecs.is_empty());
        assert!(!incoming.has_early_media);
    }

    /// @verifies C049-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn incoming_call_has_early_media_true() {
        let incoming = IncomingCall {
            from_uri: "sip:alice@example.com".to_string(),
            to_uri: "sip:bob@example.com".to_string(),
            display_name: None,
            headers: vec![],
            offered_codecs: vec![],
            has_early_media: true,
        };
        assert!(incoming.has_early_media);
    }

    /// @verifies C049-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn refer_request_blind_transfer_semantics() {
        let req = ReferRequest {
            refer_to_uri: "sip:carol@example.com".to_string(),
            referred_by_uri: None,
            call_id: CallId::from_u64(1).unwrap(),
        };
        // Blind transfer: target URI directly in refer_to_uri, no consultation call
        assert!(!req.refer_to_uri.is_empty());
        assert_eq!(req.referred_by_uri, None);
    }

    /// @verifies C049-postcondition
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn refer_request_with_referred_by() {
        let req = ReferRequest {
            refer_to_uri: "sip:carol@example.com".to_string(),
            referred_by_uri: Some("sip:transferor@example.com".to_string()),
            call_id: CallId::from_u64(2).unwrap(),
        };
        assert_eq!(req.refer_to_uri, "sip:carol@example.com");
        assert_eq!(
            req.referred_by_uri,
            Some("sip:transferor@example.com".to_string())
        );
    }

    /// @verifies C049-invariant
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn incoming_call_implements_traits() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}

        assert_debug::<IncomingCall>();
        assert_clone::<IncomingCall>();
        assert_partial_eq::<IncomingCall>();
        assert_eq_trait::<IncomingCall>();
    }

    /// @verifies C049-invariant
    #[test]
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
    fn refer_request_implements_traits() {
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}

        assert_debug::<ReferRequest>();
        assert_clone::<ReferRequest>();
        assert_partial_eq::<ReferRequest>();
        assert_eq_trait::<ReferRequest>();
    }
}
