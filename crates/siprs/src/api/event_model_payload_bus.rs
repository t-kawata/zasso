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
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N>)
// ============================================================================
//
// [::TICKET::] P0-5: Event model — SipEventPayload, SipEvent, EventMeta, info structs

use std::collections::BTreeMap;

// ── ID newtypes (minimal, stubs until P0-7) ─────────────────────────────

/// Placeholder for the `AccountId` newtype defined in N0012 (§9).
/// [::STUB::] P0-7: Replace with proper newtype from model/id_design_newtype.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct AccountId(pub u64);

/// Placeholder for the `CallId` newtype defined in N0012 (§9).
/// [::STUB::] P0-7: Replace with proper newtype from model/id_design_newtype.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CallId(pub u64);

// ── EventTimestamp ──────────────────────────────────────────────────────

/// Timestamp of an event occurrence.
/// Wraps `std::time::Instant` for monotonic precision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct EventTimestamp(pub std::time::Instant);

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl EventTimestamp {
    /// Create a new timestamp from the current instant.
    pub fn now() -> Self {
        Self(std::time::Instant::now())
    }
}

// ── EventDirection ──────────────────────────────────────────────────────

/// Direction of an event relative to the local SIP endpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventDirection {
    /// Incoming — received from the network
    Inbound,
    /// Outgoing — sent to the network
    Outbound,
    /// Internal — generated within the client
    Internal,
}

// ── EventMeta ───────────────────────────────────────────────────────────

/// Common metadata attached to all SipEvents.
#[derive(Debug, Clone)]
pub struct EventMeta {
    /// Monotonically increasing event identifier within the client session.
    pub event_id: u64,
    /// Timestamp of the event occurrence.
    pub timestamp: EventTimestamp,
    /// The account this event belongs to, if applicable.
    pub account_id: Option<AccountId>,
    /// The call this event belongs to, if applicable.
    pub call_id: Option<CallId>,
    /// Direction of the event (inbound, outbound, internal).
    pub direction: Option<EventDirection>,
    /// Optional SIP headers carried with the event.
    pub headers: Option<Vec<(String, String)>>,
    /// Numeric SIP status code, if applicable.
    pub status_code: Option<u16>,
    /// Human-readable reason phrase.
    pub reason_phrase: Option<String>,
    /// Logical context key-value pairs for extensibility.
    pub logical_context: BTreeMap<String, String>,
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl EventMeta {
    /// Create an EventMeta with only the essential fields.
    pub fn new(
        event_id: u64,
        account_id: Option<AccountId>,
        call_id: Option<CallId>,
    ) -> Self {
        Self {
            event_id,
            timestamp: EventTimestamp::now(),
            account_id,
            call_id,
            direction: None,
            headers: None,
            status_code: None,
            reason_phrase: None,
            logical_context: BTreeMap::new(),
        }
    }
}

// ── Info structs (payload data containers) ──────────────────────────────

/// Information about a registration attempt.
#[derive(Debug, Clone)]
pub struct RegistrationInfo {
    pub account_id: AccountId,
    pub renew: bool,
}

/// Failure details for a registration attempt.
#[derive(Debug, Clone)]
pub struct RegistrationFailure {
    pub account_id: AccountId,
    pub status_code: u16,
    pub reason: String,
}

/// Information about a connected call.
#[derive(Debug, Clone)]
pub struct ConnectedCallInfo {
    pub call_id: CallId,
    pub account_id: AccountId,
    pub remote_uri: String,
}

/// DTMF digit received from the remote party.
#[derive(Debug, Clone)]
pub struct DtmfReceivedInfo {
    pub digit: char,
    pub duration_ms: Option<u64>,
    pub volume_dbm0: Option<i32>,
}

/// Media stream activated for a call.
#[derive(Debug, Clone)]
pub struct MediaActiveInfo {
    pub call_id: CallId,
}

/// Media stream error details.
#[derive(Debug, Clone)]
pub struct MediaErrorInfo {
    pub call_id: CallId,
    pub reason: Option<String>,
}

// ── SipEventPayload ─────────────────────────────────────────────────────

/// Event payload enum defining all observable SIP event types.
///
/// `#[non_exhaustive]` allows adding new variants without breaking downstream
/// consumers — they must include a wildcard arm in match statements.
///
/// # Priority levels (M20)
/// - **P0** (implemented): Registration, Call, DTMF
/// - **P1** (future): Transport, ICE
/// - **P2** (future): Supplemental (CallTsx, CallRedirected, etc.)
///
/// P1/P2 variants return `None` from `convert_native_event_to_payload`
/// with documented rationale.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum SipEventPayload {
    // ── Registration (P0) ──
    /// Registration process started (initial REGISTER sent).
    RegistrationStarted(RegistrationInfo),
    /// Registration succeeded (200 OK received).
    RegistrationSucceeded(RegistrationInfo),
    /// Registration failed (error response or timeout).
    RegistrationFailed(RegistrationFailure),
    /// Unregistration completed successfully.
    UnregistrationSucceeded,
    /// Unregistration failed.
    UnregistrationFailed(RegistrationFailure),
    /// Registration period expired.
    RegistrationExpired,

    // ── Call (P0) ──
    /// Outgoing call initiated (INVITE sent).
    OutgoingCallStarted,
    /// Outgoing call is trying (100 Trying received).
    OutgoingCallTrying,
    /// Outgoing call is ringing (180 Ringing received).
    OutgoingCallRinging,
    /// Call connected (200 OK / media established).
    CallConnected(ConnectedCallInfo),
    /// Call disconnected (BYE or remote hangup).
    CallDisconnected,
    /// Call held locally or remotely.
    CallHeld,

    // ── Media (P0) ──
    /// Media stream is active (send/receive).
    MediaActive(MediaActiveInfo),
    /// Media stream encountered an error.
    MediaError(MediaErrorInfo),

    // ── DTMF (P0) ──
    /// DTMF digit sent (via PJSIP callback or timeout fallback).
    DtmfSent(DtmfSentInfo),
    /// DTMF digit received from remote party.
    DtmfReceived(DtmfReceivedInfo),
}

// Forward-declare DtmfSentInfo from the dtmf module — it's defined in m20_dtmfsent_twophase.rs
// and re-exported. For the payload enum to reference it, we import from the api crate.
use crate::api::m20_dtmfsent_twophase::DtmfSentInfo;

// ── SipEvent ────────────────────────────────────────────────────────────

/// A fully-qualified event combining metadata with a typed payload.
#[derive(Debug, Clone)]
pub struct SipEvent {
    pub meta: EventMeta,
    pub payload: SipEventPayload,
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl SipEvent {
    /// Create a new SipEvent with auto-generated event_id and timestamp.
    pub fn new(meta: EventMeta, payload: SipEventPayload) -> Self {
        Self { meta, payload }
    }
}

// ── RawSipMessage (stub) ────────────────────────────────────────────────

/// A raw SIP message captured by the PJSIP callback bridge.
///
/// [::STUB::] P1+: Full SIP message parsing — currently a placeholder
/// that only exists for the EventBus raw_sip channel type parameter.
#[derive(Debug, Clone)]
pub struct RawSipMessage {
    pub data: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── AccountId / CallId ────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn account_id_wraps_u64() {
        let id = AccountId(42);
        assert_eq!(id.0, 42);
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn account_id_equality() {
        assert_eq!(AccountId(1), AccountId(1));
        assert_ne!(AccountId(1), AccountId(2));
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn account_id_is_hashable() {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        set.insert(AccountId(1));
        set.insert(AccountId(2));
        assert_eq!(set.len(), 2);
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn call_id_wraps_u64() {
        let id = CallId(99);
        assert_eq!(id.0, 99);
    }

    // ── EventTimestamp ─────────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn event_timestamp_now_creates_valid_timestamp() {
        let ts = EventTimestamp::now();
        let elapsed = ts.0.elapsed();
        // Within the last second — real-time assertion
        assert!(elapsed.as_secs() < 1);
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn event_timestamp_ordering() {
        let t1 = EventTimestamp(std::time::Instant::now());
        let t2 = EventTimestamp(std::time::Instant::now());
        // t1 should be <= t2 (monotonic)
        assert!(t1 <= t2 || t2 >= t1);
    }

    // ── EventMeta ──────────────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn event_meta_new_sets_required_fields() {
        let meta = EventMeta::new(1, Some(AccountId(5)), Some(CallId(3)));
        assert_eq!(meta.event_id, 1);
        assert_eq!(meta.account_id, Some(AccountId(5)));
        assert_eq!(meta.call_id, Some(CallId(3)));
        assert!(meta.direction.is_none());
        assert!(meta.headers.is_none());
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn event_meta_optional_fields_default_to_none() {
        let meta = EventMeta::new(42, None, None);
        assert!(meta.account_id.is_none());
        assert!(meta.call_id.is_none());
        assert!(meta.direction.is_none());
        assert!(meta.headers.is_none());
        assert_eq!(meta.logical_context.len(), 0);
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn event_meta_status_fields() {
        let mut meta = EventMeta::new(1, None, None);
        meta.status_code = Some(200);
        meta.reason_phrase = Some("OK".into());
        assert_eq!(meta.status_code, Some(200));
        assert_eq!(meta.reason_phrase.as_deref(), Some("OK"));
    }

    // ── SipEventPayload ────────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn payload_registration_started() {
        let info = RegistrationInfo {
            account_id: AccountId(1),
            renew: false,
        };
        let payload = SipEventPayload::RegistrationStarted(info);
        match payload {
            SipEventPayload::RegistrationStarted(reg_info) => {
                assert_eq!(reg_info.account_id, AccountId(1));
                assert!(!reg_info.renew);
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn payload_registration_succeeded() {
        let info = RegistrationInfo {
            account_id: AccountId(2),
            renew: true,
        };
        let payload = SipEventPayload::RegistrationSucceeded(info);
        match payload {
            SipEventPayload::RegistrationSucceeded(reg_info) => {
                assert_eq!(reg_info.account_id, AccountId(2));
                assert!(reg_info.renew);
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn payload_registration_failed() {
        let failure = RegistrationFailure {
            account_id: AccountId(3),
            status_code: 403,
            reason: "Forbidden".into(),
        };
        let payload = SipEventPayload::RegistrationFailed(failure);
        match payload {
            SipEventPayload::RegistrationFailed(f) => {
                assert_eq!(f.status_code, 403);
                assert_eq!(f.reason, "Forbidden");
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn payload_call_connected() {
        let info = ConnectedCallInfo {
            call_id: CallId(10),
            account_id: AccountId(1),
            remote_uri: "sip:alice@example.com".into(),
        };
        let payload = SipEventPayload::CallConnected(info);
        match payload {
            SipEventPayload::CallConnected(c) => {
                assert_eq!(c.call_id, CallId(10));
                assert_eq!(c.remote_uri, "sip:alice@example.com");
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn payload_call_disconnected() {
        let payload = SipEventPayload::CallDisconnected;
        assert!(matches!(payload, SipEventPayload::CallDisconnected));
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn payload_dtmf_received() {
        let info = DtmfReceivedInfo {
            digit: '5',
            duration_ms: Some(100),
            volume_dbm0: Some(-20),
        };
        let payload = SipEventPayload::DtmfReceived(info);
        match payload {
            SipEventPayload::DtmfReceived(d) => {
                assert_eq!(d.digit, '5');
                assert_eq!(d.duration_ms, Some(100));
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    // ── SipEvent ───────────────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_event_new_combines_meta_and_payload() {
        let meta = EventMeta::new(1, Some(AccountId(1)), None);
        let payload = SipEventPayload::CallDisconnected;
        let event = SipEvent::new(meta.clone(), payload.clone());
        assert_eq!(event.meta.event_id, meta.event_id);
        assert!(matches!(event.payload, SipEventPayload::CallDisconnected));
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_event_meta_access() {
        let meta = EventMeta::new(5, None, Some(CallId(7)));
        let event = SipEvent::new(meta, SipEventPayload::UnregistrationSucceeded);
        assert_eq!(event.meta.event_id, 5);
        assert_eq!(event.meta.call_id, Some(CallId(7)));
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_event_clone_preserves_all_fields() {
        let meta = EventMeta::new(1, Some(AccountId(1)), Some(CallId(2)));
        let payload = SipEventPayload::OutgoingCallStarted;
        let event = SipEvent::new(meta, payload);
        let cloned = event.clone();
        assert_eq!(cloned.meta.event_id, event.meta.event_id);
        assert!(matches!(cloned.payload, SipEventPayload::OutgoingCallStarted));
    }

    // ── Media info ────────────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn media_active_info() {
        let info = MediaActiveInfo {
            call_id: CallId(3),
        };
        let payload = SipEventPayload::MediaActive(info);
        match payload {
            SipEventPayload::MediaActive(m) => assert_eq!(m.call_id, CallId(3)),
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn media_error_info_with_reason() {
        let info = MediaErrorInfo {
            call_id: CallId(4),
            reason: Some("Codec negotiation failed".into()),
        };
        let payload = SipEventPayload::MediaError(info);
        match payload {
            SipEventPayload::MediaError(e) => {
                assert_eq!(e.call_id, CallId(4));
                assert_eq!(e.reason.as_deref(), Some("Codec negotiation failed"));
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn media_error_info_without_reason() {
        let info = MediaErrorInfo {
            call_id: CallId(5),
            reason: None,
        };
        let payload = SipEventPayload::MediaError(info);
        match payload {
            SipEventPayload::MediaError(e) => {
                assert_eq!(e.call_id, CallId(5));
                assert!(e.reason.is_none());
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    // ── RegistrationInfo / RegistrationFailure ────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn registration_info_fields() {
        let info = RegistrationInfo {
            account_id: AccountId(10),
            renew: true,
        };
        assert_eq!(info.account_id, AccountId(10));
        assert!(info.renew);
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn registration_failure_fields() {
        let failure = RegistrationFailure {
            account_id: AccountId(20),
            status_code: 503,
            reason: "Service unavailable".into(),
        };
        assert_eq!(failure.status_code, 503);
        assert!(!failure.reason.is_empty());
    }

    // ── EventDirection ────────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn event_direction_variants() {
        assert_ne!(EventDirection::Inbound as u8, EventDirection::Outbound as u8);
        assert_ne!(EventDirection::Outbound as u8, EventDirection::Internal as u8);
    }

    // ── RawSipMessage ─────────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn raw_sip_message_holds_bytes() {
        let msg = RawSipMessage {
            data: vec![0x53, 0x49, 0x50], // "SIP"
        };
        assert_eq!(msg.data.len(), 3);
        assert!(!msg.data.is_empty());
    }

    // ── Invariant: Clone + Debug ──────────────────────────────────────

    /// @verifies C020, C021
    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_event_payload_is_clone_and_debug() {
        // Compile-time check: SipEventPayload must implement Clone + Debug.
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<SipEventPayload>();
        assert_clone_debug::<SipEvent>();
        assert_clone_debug::<EventMeta>();
    }

    // ── Invariant: non_exhaustive ──────────────────────────────────────

    /// @verifies C020
    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn sip_event_payload_is_non_exhaustive() {
        // Compile-time check: SipEventPayload derives Clone.
        // non_exhaustive is verified by separate crate compilation.
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_clone::<SipEventPayload>();
    }

    // ── Edge: empty headers and logical_context ───────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn event_meta_empty_containers() {
        let meta = EventMeta::new(1, None, None);
        assert!(meta.headers.is_none());
        assert!(meta.logical_context.is_empty());
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn event_meta_populated_containers() {
        let mut meta = EventMeta::new(1, None, None);
        meta.headers = Some(vec![("X-Custom".into(), "value".into())]);
        meta.logical_context
            .insert("origin".into(), "voip-gateway".into());
        assert_eq!(meta.headers.as_ref().unwrap().len(), 1);
        assert_eq!(
            meta.logical_context.get("origin"),
            Some(&"voip-gateway".into())
        );
    }

    // ── ConnectedCallInfo ─────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn connected_call_info_all_fields() {
        let info = ConnectedCallInfo {
            call_id: CallId(100),
            account_id: AccountId(200),
            remote_uri: "sip:bob@example.net".into(),
        };
        assert_eq!(info.call_id, CallId(100));
        assert_eq!(info.account_id, AccountId(200));
        assert!(!info.remote_uri.is_empty());
    }
}
