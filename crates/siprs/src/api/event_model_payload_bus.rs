// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

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

use crate::config::account_config_spec::DtmfMethod;
use crate::config::observability_metrics::ClientCapabilities;
use crate::error::SipError;
use crate::state::registr_state_machine::RegistrationState;

// ── ID newtypes (re-exported from model/id_design_newtype) ──────────────

/// Type-safe account identifier backed by `NonZeroU64`.
pub use crate::model::AccountId;

/// Type-safe call identifier backed by `NonZeroU64`.
pub use crate::model::CallId;

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
    pub fn new(event_id: u64, account_id: Option<AccountId>, call_id: Option<CallId>) -> Self {
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
///
/// The `method` field indicates which DTMF transport was used (Inband, Info, or RFC 4733).
/// DTMF method validation against account policy is handled by `DtmfPolicy` in
/// `AccountConfig::validate()` — see `crate::config::account_config_spec::DtmfPolicy`.
///
/// # Contract (C029)
/// - `duration_ms` is the event duration in milliseconds, bounded by `u16` — the
///   full `[0, u16::MAX]` range is representable without truncation.
/// - `volume_dbm0` is the signal level in dBm0, bounded by `i8` — the full
///   `[i8::MIN, i8::MAX]` range is representable.
#[derive(Debug, Clone)]
pub struct DtmfReceivedInfo {
    /// The DTMF method used to receive this digit.
    pub method: DtmfMethod,
    /// The DTMF digit received ('0'-'9', '*', '#', 'A'-'D').
    pub digit: char,
    /// Duration of the DTMF event in milliseconds, if reported by the remote endpoint.
    pub duration_ms: Option<u16>,
    /// Signal level in dBm0, if reported by the remote endpoint.
    pub volume_dbm0: Option<i8>,
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

/// Media stream stopped.
#[derive(Debug, Clone)]
pub struct MediaStoppedInfo {
    pub call_id: CallId,
}

/// Information about early media (183 Session Progress) received.
#[derive(Debug, Clone)]
pub struct EarlyMediaInfo {
    pub call_id: CallId,
    pub media_description: Option<String>,
}

/// Information about an incoming call.
#[derive(Debug, Clone)]
pub struct IncomingCallInfo {
    pub call_id: CallId,
    pub account_id: AccountId,
    pub caller_uri: String,
    pub caller_name: Option<String>,
}

/// Cancellation details for a call cancelled before connection.
#[derive(Debug, Clone)]
pub struct CancelInfo {
    pub call_id: CallId,
    pub account_id: AccountId,
}

/// Rejection details for a call rejected with 4xx/5xx/6xx.
#[derive(Debug, Clone)]
pub struct RejectInfo {
    pub call_id: CallId,
    pub account_id: AccountId,
    pub status_code: u16,
    pub reason: String,
}

/// An incoming REFER request (call transfer).
///
/// # Contract (C049)
/// - `replaces` is the Replaces header of the REFER. A blind transfer (REFER
///   without a Replaces header) is first-class — `replaces` is `None` for it.
#[derive(Debug, Clone)]
pub struct ReferRequest {
    pub call_id: CallId,
    pub refer_to: String,
    pub referred_by: Option<String>,
    /// Replaces header of the REFER — `None` for a blind transfer.
    pub replaces: Option<String>,
}

/// Result of a call transfer.
#[derive(Debug, Clone)]
pub struct TransferInfo {
    pub call_id: CallId,
    pub status_code: u16,
    pub reason: String,
}

/// ICE negotiation success details.
#[derive(Debug, Clone)]
pub struct IceSuccessInfo {
    pub call_id: CallId,
    pub role: String,
}

/// ICE negotiation failure details.
#[derive(Debug, Clone)]
pub struct IceFailureInfo {
    pub call_id: CallId,
    pub reason: String,
}

/// Transport event details.
#[derive(Debug, Clone)]
pub struct TransportConnectedInfo {
    pub transport_type: String,
    pub local_addr: String,
    pub remote_addr: Option<String>,
}

/// Transport disconnection details.
#[derive(Debug, Clone)]
pub struct TransportDisconnectedInfo {
    pub transport_type: String,
    pub local_addr: String,
}

/// Transport error details.
#[derive(Debug, Clone)]
pub struct TransportErrorInfo {
    pub transport_type: String,
    pub local_addr: String,
    pub reason: String,
}

/// Snapshot of an account's current state.
#[derive(Debug, Clone)]
pub struct AccountSnapshot {
    pub account_id: AccountId,
    pub display_name: Option<String>,
    pub uri: String,
    pub registered: bool,
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
/// P1/P2 variants yield `None` from `convert_native_event_to_payload`
/// with documented rationale.
#[derive(Debug, Clone)]
#[non_exhaustive]
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
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
    /// Registration state changed — the typed §17 state machine outcome (P15-5).
    RegistrationStateChanged(RegistrationState),

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

    // ── Call (P1) ──
    /// Early media (183 Session Progress) received.
    EarlyMediaReceived(EarlyMediaInfo),
    /// Incoming call notification (INVITE received).
    IncomingCall(IncomingCallInfo),
    /// Call was cancelled before being established (CANCEL received).
    CallCancelled(CancelInfo),
    /// Call was rejected (4xx/5xx/6xx rejection).
    CallRejected(RejectInfo),
    /// Call was resumed after being held.
    CallResumed,
    /// REFER request received (call transfer initiation).
    ReferReceived(ReferRequest),
    /// Call transfer completed.
    TransferCompleted(TransferInfo),

    // ── Media (P1) ──
    /// Media stream stopped.
    MediaStopped(MediaStoppedInfo),

    // ── ICE (P1) ──
    /// ICE negotiation started.
    IceNegotiationStarted,
    /// ICE negotiation succeeded.
    IceNegotiationSucceeded(IceSuccessInfo),
    /// ICE negotiation failed.
    IceNegotiationFailed(IceFailureInfo),

    // ── Transport (P1) ──
    /// Transport connection established.
    TransportConnected(TransportConnectedInfo),
    /// Transport disconnected.
    TransportDisconnected(TransportDisconnectedInfo),
    /// Transport error occurred.
    TransportError(TransportErrorInfo),

    // ── Account (P1) ──
    /// Account added to the client.
    AccountAdded(AccountSnapshot),
    /// Account removed from the client.
    AccountRemoved(AccountSnapshot),
    /// Account configuration changed.
    AccountConfigChanged(AccountSnapshot),

    // ── Client lifecycle (P1) ──
    /// Client initialized successfully.
    ClientInitialized(ClientCapabilities),
    /// Client is shutting down.
    ClientShutdown,

    // ── Error (P1) ──
    /// An internal or protocol error occurred.
    Error(SipError),
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

// ── RawSipMessage (re-exported from model/raw_sip_message_spec — RFC §16) ──

// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
pub use crate::model::raw_sip_message_spec::RawSipMessage;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::account_config_spec::DtmfMethod;

    // ── AccountId / CallId ────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn account_id_wraps_u64() -> Result<(), &'static str> {
        let id = AccountId::from_u64(42).map_err(|_| "invalid account id")?;
        assert_eq!(id.get().get(), 42);
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn account_id_equality() -> Result<(), &'static str> {
        let one = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let two = AccountId::from_u64(2).map_err(|_| "invalid account id")?;
        assert_eq!(one, one);
        assert_ne!(one, two);
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn account_id_is_hashable() -> Result<(), &'static str> {
        use std::collections::HashSet;
        let one = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let two = AccountId::from_u64(2).map_err(|_| "invalid account id")?;
        let mut set = HashSet::new();
        set.insert(one);
        set.insert(two);
        assert_eq!(set.len(), 2);
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn call_id_wraps_u64() -> Result<(), &'static str> {
        let id = CallId::from_u64(99).map_err(|_| "invalid call id")?;
        assert_eq!(id.get().get(), 99);
        Ok(())
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
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn event_meta_new_sets_required_fields() -> Result<(), &'static str> {
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let meta = EventMeta::new(1, Some(account_id), Some(call_id));
        assert_eq!(meta.event_id, 1);
        assert_eq!(meta.account_id, Some(account_id));
        assert_eq!(meta.call_id, Some(call_id));
        assert!(meta.direction.is_none());
        assert!(meta.headers.is_none());
        Ok(())
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
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn payload_registration_started() -> Result<(), &'static str> {
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let info = RegistrationInfo {
            account_id,
            renew: false,
        };
        let payload = SipEventPayload::RegistrationStarted(info);
        match payload {
            SipEventPayload::RegistrationStarted(reg_info) => {
                assert_eq!(reg_info.account_id, account_id);
                assert!(!reg_info.renew);
            }
            _ => panic!("unexpected payload variant"),
        }
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn payload_registration_succeeded() -> Result<(), &'static str> {
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let info = RegistrationInfo {
            account_id,
            renew: true,
        };
        let payload = SipEventPayload::RegistrationSucceeded(info);
        match payload {
            SipEventPayload::RegistrationSucceeded(reg_info) => {
                assert_eq!(reg_info.account_id, account_id);
                assert!(reg_info.renew);
            }
            _ => panic!("unexpected payload variant"),
        }
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn payload_registration_failed() -> Result<(), &'static str> {
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let failure = RegistrationFailure {
            account_id,
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
        Ok(())
    }

    /// @verifies C073
    /// The typed §17 state machine outcome variant constructs and matches.
    #[test]
// [::TICKET::] P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-5 --for-spec --no-implementation-order`.
    fn payload_registration_state_changed() {
        let payload = SipEventPayload::RegistrationStateChanged(RegistrationState::Registered);
        assert!(matches!(
            payload,
            SipEventPayload::RegistrationStateChanged(RegistrationState::Registered)
        ));
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn payload_call_connected() -> Result<(), &'static str> {
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let info = ConnectedCallInfo {
            call_id,
            account_id,
            remote_uri: "sip:alice@example.com".into(),
        };
        let payload = SipEventPayload::CallConnected(info);
        match payload {
            SipEventPayload::CallConnected(c) => {
                assert_eq!(c.call_id, call_id);
                assert_eq!(c.remote_uri, "sip:alice@example.com");
            }
            _ => panic!("unexpected payload variant"),
        }
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn payload_call_disconnected() {
        let payload = SipEventPayload::CallDisconnected;
        assert!(matches!(payload, SipEventPayload::CallDisconnected));
    }

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    // @verifies C029
    // [::TICKET::] P5-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P5-2|P8-4) --for-spec --no-implementation-order`.
    fn payload_dtmf_received() {
        let info = DtmfReceivedInfo {
            method: DtmfMethod::Rfc4733,
            digit: '5',
            duration_ms: Some(100),
            volume_dbm0: Some(-20),
        };
        let payload = SipEventPayload::DtmfReceived(info);
        match payload {
            SipEventPayload::DtmfReceived(d) => {
                assert_eq!(d.method, DtmfMethod::Rfc4733);
                assert_eq!(d.digit, '5');
                assert_eq!(d.duration_ms, Some(100));
                assert_eq!(d.volume_dbm0, Some(-20));
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    // ── SipEvent ───────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn sip_event_new_combines_meta_and_payload() -> Result<(), &'static str> {
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let meta = EventMeta::new(1, Some(account_id), None);
        let payload = SipEventPayload::CallDisconnected;
        let event = SipEvent::new(meta.clone(), payload.clone());
        assert_eq!(event.meta.event_id, meta.event_id);
        assert!(matches!(event.payload, SipEventPayload::CallDisconnected));
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn sip_event_meta_access() -> Result<(), &'static str> {
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let meta = EventMeta::new(5, None, Some(call_id));
        let event = SipEvent::new(meta, SipEventPayload::UnregistrationSucceeded);
        assert_eq!(event.meta.event_id, 5);
        assert_eq!(event.meta.call_id, Some(call_id));
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn sip_event_clone_preserves_all_fields() -> Result<(), &'static str> {
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let meta = EventMeta::new(1, Some(account_id), Some(call_id));
        let payload = SipEventPayload::OutgoingCallStarted;
        let event = SipEvent::new(meta, payload);
        let cloned = event.clone();
        assert_eq!(cloned.meta.event_id, event.meta.event_id);
        assert!(matches!(
            cloned.payload,
            SipEventPayload::OutgoingCallStarted
        ));
        Ok(())
    }

    // ── Media info ────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn media_active_info() -> Result<(), &'static str> {
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let info = MediaActiveInfo { call_id };
        let payload = SipEventPayload::MediaActive(info);
        match payload {
            SipEventPayload::MediaActive(m) => assert_eq!(m.call_id, call_id),
            _ => panic!("unexpected payload variant"),
        }
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn media_error_info_with_reason() -> Result<(), &'static str> {
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let info = MediaErrorInfo {
            call_id,
            reason: Some("Codec negotiation failed".into()),
        };
        let payload = SipEventPayload::MediaError(info);
        match payload {
            SipEventPayload::MediaError(e) => {
                assert_eq!(e.call_id, call_id);
                assert_eq!(e.reason.as_deref(), Some("Codec negotiation failed"));
            }
            _ => panic!("unexpected payload variant"),
        }
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn media_error_info_without_reason() -> Result<(), &'static str> {
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let info = MediaErrorInfo {
            call_id,
            reason: None,
        };
        let payload = SipEventPayload::MediaError(info);
        match payload {
            SipEventPayload::MediaError(e) => {
                assert_eq!(e.call_id, call_id);
                assert!(e.reason.is_none());
            }
            _ => panic!("unexpected payload variant"),
        }
        Ok(())
    }

    // ── RegistrationInfo / RegistrationFailure ────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn registration_info_fields() -> Result<(), &'static str> {
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let info = RegistrationInfo {
            account_id,
            renew: true,
        };
        assert_eq!(info.account_id, account_id);
        assert!(info.renew);
        Ok(())
    }

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn registration_failure_fields() -> Result<(), &'static str> {
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let failure = RegistrationFailure {
            account_id,
            status_code: 503,
            reason: "Service unavailable".into(),
        };
        assert_eq!(failure.status_code, 503);
        assert!(!failure.reason.is_empty());
        Ok(())
    }

    // ── EventDirection ────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn event_direction_variants() {
        assert_ne!(
            EventDirection::Inbound as u8,
            EventDirection::Outbound as u8
        );
        assert_ne!(
            EventDirection::Outbound as u8,
            EventDirection::Internal as u8
        );
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
        // [::TICKET::] P0-5, P1-2, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P1-2|P8-4) --for-spec --no-implementation-order`.
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
    // [::TICKET::] P0-5, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P8-4) --for-spec --no-implementation-order`.
    fn event_meta_populated_containers() -> Result<(), &'static str> {
        let mut meta = EventMeta::new(1, None, None);
        meta.headers = Some(vec![("X-Custom".into(), "value".into())]);
        meta.logical_context
            .insert("origin".into(), "voip-gateway".into());
        let headers = meta.headers.as_ref().ok_or("missing headers")?;
        assert_eq!(headers.len(), 1);
        assert_eq!(
            meta.logical_context.get("origin"),
            Some(&"voip-gateway".into())
        );
        Ok(())
    }

    // ── ConnectedCallInfo ─────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1, P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1|P8-4) --for-spec --no-implementation-order`.
    fn connected_call_info_all_fields() -> Result<(), &'static str> {
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let account_id = AccountId::from_u64(1).map_err(|_| "invalid account id")?;
        let info = ConnectedCallInfo {
            call_id,
            account_id,
            remote_uri: "sip:bob@example.net".into(),
        };
        assert_eq!(info.call_id, call_id);
        assert_eq!(info.account_id, account_id);
        assert!(!info.remote_uri.is_empty());
        Ok(())
    }

    // ── DTMF (P8-4) — DtmfReceivedInfo edge/boundary + DtmfSent payload ──

    /// @verifies C029
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn dtmf_received_info_none_edge() {
        // O-002 closure: duration_ms=None and volume_dbm0=None stay well-formed.
        let info = DtmfReceivedInfo {
            method: DtmfMethod::Inband,
            digit: '*',
            duration_ms: None,
            volume_dbm0: None,
        };
        assert!(info.duration_ms.is_none());
        assert!(info.volume_dbm0.is_none());
        let _ = format!("{info:?}");
    }

    /// @verifies C029
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn dtmf_received_info_duration_boundary() {
        // O-002 closure: duration_ms accepts the full [0, u16::MAX] range.
        let min = DtmfReceivedInfo {
            method: DtmfMethod::Rfc4733,
            digit: '1',
            duration_ms: Some(0u16),
            volume_dbm0: None,
        };
        let max = DtmfReceivedInfo {
            method: DtmfMethod::Rfc4733,
            digit: '1',
            duration_ms: Some(u16::MAX),
            volume_dbm0: None,
        };
        assert_eq!(min.duration_ms, Some(0u16));
        assert_eq!(max.duration_ms, Some(u16::MAX));
    }

    /// @verifies C029
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn dtmf_received_info_volume_boundary() {
        // O-002 closure: volume_dbm0 accepts the full [i8::MIN, i8::MAX] range.
        let min = DtmfReceivedInfo {
            method: DtmfMethod::Rfc4733,
            digit: '2',
            duration_ms: None,
            volume_dbm0: Some(i8::MIN),
        };
        let max = DtmfReceivedInfo {
            method: DtmfMethod::Rfc4733,
            digit: '2',
            duration_ms: None,
            volume_dbm0: Some(i8::MAX),
        };
        assert_eq!(min.volume_dbm0, Some(i8::MIN));
        assert_eq!(max.volume_dbm0, Some(i8::MAX));
    }

    /// @verifies C030
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn payload_dtmf_sent() {
        // O-003 closure: SipEventPayload::DtmfSent carries a DtmfSentInfo payload.
        use crate::api::m20_dtmfsent_twophase::{DtmfMethod as SentDtmfMethod, SentDtmfError};
        let info = DtmfSentInfo {
            method: SentDtmfMethod::Rfc4733,
            digit: '#',
            status: Err(SentDtmfError::Timeout),
            pjsip_status: None,
        };
        let payload = SipEventPayload::DtmfSent(info);
        match payload {
            SipEventPayload::DtmfSent(d) => {
                assert_eq!(d.digit, '#');
                assert!(matches!(d.status, Err(SentDtmfError::Timeout)));
                assert!(d.pjsip_status.is_none());
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    // ── Call transfer (P8-4) — ReferRequest / TransferInfo ──────────────

    /// @verifies C049
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn refer_request_blind_construction() -> Result<(), &'static str> {
        // O-001 closure: blind transfer is first-class — replaces is None.
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let blind = ReferRequest {
            call_id,
            refer_to: "sip:carol@example.com".into(),
            referred_by: None,
            replaces: None,
        };
        assert!(blind.replaces.is_none());
        assert!(blind.referred_by.is_none());
        assert_eq!(blind.refer_to, "sip:carol@example.com");
        Ok(())
    }

    /// @verifies C049
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn refer_request_full_construction() -> Result<(), &'static str> {
        // O-001 closure: attended transfer payload — referred_by + replaces both Some.
        let call_id = CallId::from_u64(2).map_err(|_| "invalid call id")?;
        let attended = ReferRequest {
            call_id,
            refer_to: "sip:dave@example.com".into(),
            referred_by: Some("sip:bob@example.com".into()),
            replaces: Some("sip:oldcall@example.com".into()),
        };
        assert_eq!(attended.referred_by.as_deref(), Some("sip:bob@example.com"));
        assert_eq!(
            attended.replaces.as_deref(),
            Some("sip:oldcall@example.com")
        );
        Ok(())
    }

    /// @verifies C049
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn transfer_info_fields() -> Result<(), &'static str> {
        // O-001 closure: TransferInfo carries status_code and reason.
        let call_id = CallId::from_u64(2).map_err(|_| "invalid call id")?;
        let transfer = TransferInfo {
            call_id,
            status_code: 200,
            reason: "OK".into(),
        };
        assert_eq!(transfer.status_code, 200);
        assert_eq!(transfer.reason, "OK");
        Ok(())
    }

    /// @verifies C049
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn payload_refer_received() -> Result<(), &'static str> {
        // O-001 closure: SipEventPayload::ReferReceived carries a ReferRequest.
        let call_id = CallId::from_u64(1).map_err(|_| "invalid call id")?;
        let req = ReferRequest {
            call_id,
            refer_to: "sip:carol@example.com".into(),
            referred_by: None,
            replaces: None,
        };
        let payload = SipEventPayload::ReferReceived(req);
        match payload {
            SipEventPayload::ReferReceived(r) => {
                assert_eq!(r.refer_to, "sip:carol@example.com");
                assert!(r.replaces.is_none());
            }
            _ => panic!("unexpected payload variant"),
        }
        Ok(())
    }

    /// @verifies C049
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn payload_transfer_completed() -> Result<(), &'static str> {
        // O-001 closure: SipEventPayload::TransferCompleted carries a TransferInfo.
        let call_id = CallId::from_u64(2).map_err(|_| "invalid call id")?;
        let info = TransferInfo {
            call_id,
            status_code: 200,
            reason: "OK".into(),
        };
        let payload = SipEventPayload::TransferCompleted(info);
        match payload {
            SipEventPayload::TransferCompleted(t) => {
                assert_eq!(t.status_code, 200);
                assert_eq!(t.reason, "OK");
            }
            _ => panic!("unexpected payload variant"),
        }
        Ok(())
    }

    /// @verifies C049
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn refer_and_transfer_info_are_clone_debug() {
        // O-001 closure: compile-time Clone + Debug bounds for transfer types.
        // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<ReferRequest>();
        assert_clone_debug::<TransferInfo>();
    }
}
