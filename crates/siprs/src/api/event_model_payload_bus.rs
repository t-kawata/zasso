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
//   - NODE_ID=N0018:  §15 Event Model — SipEventPayload & EventBus
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0018 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Defines the event model types: `SipEventPayload` enum, `SipEvent` wrapper,
//! `EventMeta` metadata struct, and `EventTimestamp` type alias.
//!
//! ## Design
//!
//! `SipEventPayload` is a `#[non_exhaustive]` enum covering all observable SIP
//! event categories. Each variant is a unit type in this crate; downstream
//! payload structs are added by their respective P1-* tickets.
//!
//! `SipEvent` wraps a payload with `EventMeta`, providing common metadata
//! fields (event_id, timestamp, account_id, call_id, direction, headers,
//! status_code, reason_phrase, logical_context).
//!
//! Per §15.7 (N0020), events are **observation-only** and must not be treated
//! as a source of truth. The query API (accounts(), call_state(), etc.) is the
//! authoritative data source.

use std::collections::BTreeMap;

use crate::concurrency_contexts::command_serialization::AccountId;
use crate::concurrency_contexts::command_serialization::CallId;

// ---------------------------------------------------------------------------
// EventTimestamp
// ---------------------------------------------------------------------------

/// Event timestamp in milliseconds since UNIX epoch.
pub(crate) type EventTimestamp = u64;

// ---------------------------------------------------------------------------
// EventDirection
// ---------------------------------------------------------------------------

/// Direction of the event relative to the local endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum EventDirection {
    Incoming,
    Outgoing,
    Internal,
}

// ---------------------------------------------------------------------------
// EventMeta
// ---------------------------------------------------------------------------

/// Common metadata attached to every `SipEvent`.
///
/// Provides fields specified by §15.3: event_id, timestamp, account_id, call_id,
/// direction, headers, status_code, reason_phrase, logical_context.
#[derive(Debug, Clone)]
pub(crate) struct EventMeta {
    pub event_id: u64,
    pub timestamp: EventTimestamp,
    pub account_id: Option<AccountId>,
    pub call_id: Option<CallId>,
    pub direction: Option<EventDirection>,
    pub headers: Option<Vec<(String, String)>>,
    pub status_code: Option<u16>,
    pub reason_phrase: Option<String>,
    pub logical_context: BTreeMap<String, String>,
}

// ---------------------------------------------------------------------------
// SipEventPayload
// ---------------------------------------------------------------------------

/// All possible SIP event payload variants, grouped by category.
///
/// This enum is `#[non_exhaustive]` so that adding new variants in future
/// releases is not a breaking change for downstream consumers.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub(crate) enum SipEventPayload {
    // ── Registration ──
    RegistrationStarted,
    RegistrationSucceeded,
    RegistrationFailed,
    UnregistrationSucceeded,
    UnregistrationFailed,
    RegistrationExpired,

    // ── Call ──
    OutgoingCallStarted,
    OutgoingCallTrying,
    OutgoingCallRinging,
    EarlyMediaReceived,
    CallConnected,
    IncomingCall,
    CallDisconnected,
    CallCancelled,
    CallRejected,
    CallHeld,
    CallResumed,
    ReferReceived,
    TransferCompleted,

    // ── Media ──
    MediaActive,
    MediaStopped,
    MediaError,

    // ── DTMF ──
    DtmfSent,
    DtmfReceived,

    // ── ICE ──
    IceNegotiationStarted,
    IceNegotiationSucceeded,
    IceNegotiationFailed,

    // ── Transport ──
    TransportConnected,
    TransportDisconnected,
    TransportError,

    // ── Account ──
    AccountAdded,
    AccountRemoved,
    AccountConfigChanged,

    // ── Client lifecycle ──
    ClientInitialized,
    ClientShutdown,

    // ── Error ──
    Error,
}

// ---------------------------------------------------------------------------
// SipEvent
// ---------------------------------------------------------------------------

/// Event envelope carrying metadata and a typed payload.
///
/// Every event published through `EventBus` is wrapped in this struct so that
/// consumers can inspect common metadata without matching the payload variant.
#[derive(Debug, Clone)]
pub(crate) struct SipEvent {
    pub meta: EventMeta,
    pub payload: SipEventPayload,
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C020 ── N0019→N0018: Event model established
    // -----------------------------------------------------------------------

    /// @verifies C020-precondition
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_event_payload_is_debug_and_clone() {
        // Assert: SipEventPayload implements Debug + Clone at compile time
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_debug::<SipEventPayload>();
        assert_clone::<SipEventPayload>();
        assert_debug::<SipEvent>();
        assert_clone::<SipEvent>();
        assert_debug::<EventMeta>();
        assert_clone::<EventMeta>();
    }

    /// @verifies C020-precondition
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_event_payload_has_non_exhaustive() {
        let doc = include_str!("event_model_payload_bus.rs");
        assert!(
            doc.contains("#[non_exhaustive]"),
            "SipEventPayload must be annotated with #[non_exhaustive]"
        );
    }

    /// @verifies C020-postcondition
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_event_wraps_payload_with_meta() {
        let meta = EventMeta {
            event_id: 42,
            timestamp: 1_700_000_000_000,
            account_id: Some(1u32),
            call_id: None,
            direction: Some(EventDirection::Incoming),
            headers: None,
            status_code: Some(200),
            reason_phrase: Some("OK".to_string()),
            logical_context: BTreeMap::new(),
        };
        let payload = SipEventPayload::ClientShutdown;
        let event = SipEvent {
            meta: meta.clone(),
            payload: payload.clone(),
        };

        // Verify the wrapper contains the correct data
        assert_eq!(event.meta.event_id, 42);
        assert_eq!(event.meta.timestamp, 1_700_000_000_000);
        assert_eq!(event.meta.account_id, Some(1u32));
        assert_eq!(event.meta.direction, Some(EventDirection::Incoming));
        assert_eq!(event.meta.status_code, Some(200));
    }

    /// @verifies C020-postcondition
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn sip_event_variants_are_constructible() {
        // Every category must have at least one constructible variant
        let _registration = SipEventPayload::RegistrationStarted;
        let _call_event = SipEventPayload::CallConnected;
        let _media = SipEventPayload::MediaActive;
        let _dtmf = SipEventPayload::DtmfReceived;
        let _ice = SipEventPayload::IceNegotiationSucceeded;
        let _transport = SipEventPayload::TransportConnected;
        let _account = SipEventPayload::AccountAdded;
        let _client = SipEventPayload::ClientInitialized;
        let _error = SipEventPayload::Error;
    }

    /// @verifies C020-postcondition
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn event_direction_is_comparison_safe() {
        assert_eq!(EventDirection::Incoming, EventDirection::Incoming);
        assert_ne!(EventDirection::Incoming, EventDirection::Outgoing);
        assert_ne!(EventDirection::Incoming, EventDirection::Internal);
    }
}
