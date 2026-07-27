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
//   - NODE_ID=N0024:  §16 Raw SIP Message Specification
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0024 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Defines the `RawSipMessage` struct representing a captured SIP message.
//!
//! ## Design
//!
//! Per §16 (N0024), `RawSipMessage` captures the full SIP message content
//! including direction, transport, start line, headers, body, and addressing.
//! Authorization headers can be redacted for security.
//!
//! This type is used by `EventBus` (§15.4) for the raw SIP dedicated channel.

// [::STUB::] P0-7: RawSipMessage and related types are design-time contracts.
// They trigger dead_code until the runtime module (P0-7) or EventBus raw SIP
// channel consumes them.
#![allow(dead_code)]

use std::net::SocketAddr;

// ---------------------------------------------------------------------------
// SipMessageDirection
// ---------------------------------------------------------------------------

/// Direction of a raw SIP message relative to the local endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SipMessageDirection {
    Incoming,
    Outgoing,
}

// ---------------------------------------------------------------------------
// TransportKind
// ---------------------------------------------------------------------------

/// Transport protocol used for SIP message delivery.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum TransportKind {
    Udp,
    Tcp,
    Tls,
}

// ---------------------------------------------------------------------------
// RawSipMessage
// ---------------------------------------------------------------------------

/// A captured raw SIP message with full metadata.
///
/// When `redact_authorization` is enabled (planned), sensitive headers like
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
/// `Authorization` and `Proxy-Authorization` are replaced with `***REDACTED***`.
#[derive(Debug, Clone)]
pub(crate) struct RawSipMessage {
    /// Whether this message was sent or received.
    pub direction: SipMessageDirection,
    /// Transport protocol used.
    pub transport: TransportKind,
    /// SIP start line (e.g., "INVITE sip:user@domain SIP/2.0").
    pub start_line: String,
    /// SIP headers as (name, value) pairs.
    pub headers: Vec<(String, String)>,
    /// Optional message body as raw bytes.
    pub body: Option<Vec<u8>>,
    /// Full message text representation.
    pub text: String,
    /// Content-Length value parsed from headers.
    pub content_length: usize,
    /// Remote socket address (sender for incoming, destination for outgoing).
    pub remote_addr: Option<SocketAddr>,
    /// Local socket address.
    pub local_addr: Option<SocketAddr>,
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C025-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn raw_sip_message_fields_accessible() {
        let msg = RawSipMessage {
            direction: SipMessageDirection::Incoming,
            transport: TransportKind::Udp,
            start_line: "INVITE sip:user@domain SIP/2.0".into(),
            headers: vec![("Content-Length".into(), "145".into())],
            body: None,
            text: "INVITE sip:user@domain SIP/2.0\r\nContent-Length: 145\r\n\r\n".into(),
            content_length: 145,
            remote_addr: None,
            local_addr: None,
        };
        assert_eq!(msg.start_line.contains("INVITE"), true);
        assert_eq!(msg.content_length, 145);
    }

    /// @verifies C025-precondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn raw_sip_message_is_debug_and_clone() {
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_debug::<RawSipMessage>();
        assert_clone::<RawSipMessage>();
    }

    /// @verifies C025-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn sip_message_direction_variants() {
        let incoming = SipMessageDirection::Incoming;
        let outgoing = SipMessageDirection::Outgoing;
        assert_ne!(incoming, outgoing);
    }

    /// @verifies C025-postcondition
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn transport_kind_variants() {
        let _udp = TransportKind::Udp;
        let _tcp = TransportKind::Tcp;
        let _tls = TransportKind::Tls;
    }
}
