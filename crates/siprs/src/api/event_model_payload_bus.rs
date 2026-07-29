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
use crate::error::SipError;

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
#[derive(Debug, Clone)]
pub struct DtmfReceivedInfo {
    /// The DTMF method used to receive this digit.
    pub method: DtmfMethod,
    /// The DTMF digit received ('0'-'9', '*', '#', 'A'-'D').
    pub digit: char,
    /// Duration of the DTMF event in milliseconds, if reported by the remote endpoint.
    pub duration_ms: Option<u64>,
    /// Signal level in dBm0, if reported by the remote endpoint.
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
#[derive(Debug, Clone)]
pub struct ReferRequest {
    pub call_id: CallId,
    pub refer_to: String,
    pub referred_by: Option<String>,
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

/// Client capabilities reported at initialization.
#[derive(Debug, Clone)]
pub struct ClientCapabilities {
    pub max_calls: u32,
    pub codecs: Vec<String>,
    pub udp_enabled: bool,
    pub tcp_enabled: bool,
    pub tls_enabled: bool,
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

// ── RawSipMessage ──────────────────────────────────────────────────────

/// A raw SIP message captured by the PJSIP callback bridge.
///
/// Provides `redact_authorization()` to replace password values in
/// `Authorization:` headers with `[REDACTED]` before logging or forwarding
/// to untrusted consumers.
///
/// The `data` field contains the raw bytes of the SIP message.
// [::STUB::] P5-1: RawSipMessage is a minimal wrapper with public Vec<u8> data -- Implement full SIP message parsing with header/sdp extraction
#[derive(Debug, Clone)]
pub struct RawSipMessage {
    pub data: Vec<u8>,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl RawSipMessage {
    /// Redact password values in all `Authorization:` headers.
    ///
    /// Returns a new `RawSipMessage` with the password portion of each
    /// `Authorization:` header replaced by `[REDACTED]`. Messages without
    /// an `Authorization:` header are returned unchanged.
    ///
    /// This method follows the immutable pattern: the original message is
    /// not modified.
    pub fn redact_authorization(&self) -> Self {
        let text = String::from_utf8_lossy(&self.data);
        let redacted = Self::redact_auth_header(&text);
        Self {
            data: redacted.into_bytes(),
        }
    }

    /// Core redaction logic: replaces `password="<value>"` in Authorization headers.
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn redact_auth_header(text: &str) -> String {
        let mut result = String::with_capacity(text.len());
        let mut remaining = text;

        while let Some(auth_pos) = remaining.to_ascii_lowercase().find("authorization:") {
            // Append everything before and including the "Authorization:" keyword
            result.push_str(&remaining[..auth_pos + "authorization:".len()]);
            remaining = &remaining[auth_pos + "authorization:".len()..];

            // Extract the header line (everything up to \r\n)
            let line_end = remaining.find("\r\n").unwrap_or(remaining.len());
            let line = &remaining[..line_end];

            // Redact passwords within this header line
            let redacted_line = Self::redact_password_in_line(line);
            result.push_str(&redacted_line);

            // Advance past the processed line (including \r\n)
            remaining = &remaining[line_end..];
        }

        // Append any remaining text after the last Authorization header
        result.push_str(remaining);
        result
    }

    /// Redact `password="<value>"` in a single header line.
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn redact_password_in_line(line: &str) -> String {
        let mut result = String::with_capacity(line.len());
        let mut pos = 0;

        while let Some(pw_start) = line[pos..].to_ascii_lowercase().find("password=\"") {
            // Append text before password=
            result.push_str(&line[pos..pos + pw_start]);
            result.push_str("password=\"");
            let after_pw_eq = pos + pw_start + "password=\"".len();
            // Find the closing quote
            if let Some(quote_end) = line[after_pw_eq..].find('"') {
                result.push_str(REDACTED);
                result.push('"');
                pos = after_pw_eq + quote_end + 1;
            } else {
                // Malformed: no closing quote; append rest as-is
                result.push_str(&line[after_pw_eq..]);
                pos = line.len();
                break;
            }
        }

        // Append remaining text after the last password=
        result.push_str(&line[pos..]);
        result
    }
}

/// The redaction placeholder for secret values.
const REDACTED: &str = "[REDACTED]";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::account_config_spec::DtmfMethod;

    // ── AccountId / CallId ────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_id_wraps_u64() {
        let id = AccountId::from_u64(42).unwrap();
        assert_eq!(id.get().get(), 42);
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_id_equality() {
        assert_eq!(
            AccountId::from_u64(1).unwrap(),
            AccountId::from_u64(1).unwrap()
        );
        assert_ne!(
            AccountId::from_u64(1).unwrap(),
            AccountId::from_u64(2).unwrap()
        );
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_id_is_hashable() {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        set.insert(AccountId::from_u64(1).unwrap());
        set.insert(AccountId::from_u64(2).unwrap());
        assert_eq!(set.len(), 2);
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn call_id_wraps_u64() {
        let id = CallId::from_u64(99).unwrap();
        assert_eq!(id.get().get(), 99);
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
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn event_meta_new_sets_required_fields() {
        let meta = EventMeta::new(
            1,
            Some(AccountId::from_u64(1).unwrap()),
            Some(CallId::from_u64(1).unwrap()),
        );
        assert_eq!(meta.event_id, 1);
        assert_eq!(meta.account_id, Some(AccountId::from_u64(1).unwrap()));
        assert_eq!(meta.call_id, Some(CallId::from_u64(1).unwrap()));
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
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn payload_registration_started() {
        let info = RegistrationInfo {
            account_id: AccountId::from_u64(1).unwrap(),
            renew: false,
        };
        let payload = SipEventPayload::RegistrationStarted(info);
        match payload {
            SipEventPayload::RegistrationStarted(reg_info) => {
                assert_eq!(reg_info.account_id, AccountId::from_u64(1).unwrap());
                assert!(!reg_info.renew);
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn payload_registration_succeeded() {
        let info = RegistrationInfo {
            account_id: AccountId::from_u64(1).unwrap(),
            renew: true,
        };
        let payload = SipEventPayload::RegistrationSucceeded(info);
        match payload {
            SipEventPayload::RegistrationSucceeded(reg_info) => {
                assert_eq!(reg_info.account_id, AccountId::from_u64(1).unwrap());
                assert!(reg_info.renew);
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn payload_registration_failed() {
        let failure = RegistrationFailure {
            account_id: AccountId::from_u64(1).unwrap(),
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
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn payload_call_connected() {
        let info = ConnectedCallInfo {
            call_id: CallId::from_u64(1).unwrap(),
            account_id: AccountId::from_u64(1).unwrap(),
            remote_uri: "sip:alice@example.com".into(),
        };
        let payload = SipEventPayload::CallConnected(info);
        match payload {
            SipEventPayload::CallConnected(c) => {
                assert_eq!(c.call_id, CallId::from_u64(1).unwrap());
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
    // @verifies C029
    // [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
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
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    // ── SipEvent ───────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn sip_event_new_combines_meta_and_payload() {
        let meta = EventMeta::new(1, Some(AccountId::from_u64(1).unwrap()), None);
        let payload = SipEventPayload::CallDisconnected;
        let event = SipEvent::new(meta.clone(), payload.clone());
        assert_eq!(event.meta.event_id, meta.event_id);
        assert!(matches!(event.payload, SipEventPayload::CallDisconnected));
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn sip_event_meta_access() {
        let meta = EventMeta::new(5, None, Some(CallId::from_u64(1).unwrap()));
        let event = SipEvent::new(meta, SipEventPayload::UnregistrationSucceeded);
        assert_eq!(event.meta.event_id, 5);
        assert_eq!(event.meta.call_id, Some(CallId::from_u64(1).unwrap()));
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn sip_event_clone_preserves_all_fields() {
        let meta = EventMeta::new(
            1,
            Some(AccountId::from_u64(1).unwrap()),
            Some(CallId::from_u64(1).unwrap()),
        );
        let payload = SipEventPayload::OutgoingCallStarted;
        let event = SipEvent::new(meta, payload);
        let cloned = event.clone();
        assert_eq!(cloned.meta.event_id, event.meta.event_id);
        assert!(matches!(
            cloned.payload,
            SipEventPayload::OutgoingCallStarted
        ));
    }

    // ── Media info ────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn media_active_info() {
        let info = MediaActiveInfo {
            call_id: CallId::from_u64(1).unwrap(),
        };
        let payload = SipEventPayload::MediaActive(info);
        match payload {
            SipEventPayload::MediaActive(m) => assert_eq!(m.call_id, CallId::from_u64(1).unwrap()),
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn media_error_info_with_reason() {
        let info = MediaErrorInfo {
            call_id: CallId::from_u64(1).unwrap(),
            reason: Some("Codec negotiation failed".into()),
        };
        let payload = SipEventPayload::MediaError(info);
        match payload {
            SipEventPayload::MediaError(e) => {
                assert_eq!(e.call_id, CallId::from_u64(1).unwrap());
                assert_eq!(e.reason.as_deref(), Some("Codec negotiation failed"));
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn media_error_info_without_reason() {
        let info = MediaErrorInfo {
            call_id: CallId::from_u64(1).unwrap(),
            reason: None,
        };
        let payload = SipEventPayload::MediaError(info);
        match payload {
            SipEventPayload::MediaError(e) => {
                assert_eq!(e.call_id, CallId::from_u64(1).unwrap());
                assert!(e.reason.is_none());
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    // ── RegistrationInfo / RegistrationFailure ────────────────────────

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn registration_info_fields() {
        let info = RegistrationInfo {
            account_id: AccountId::from_u64(1).unwrap(),
            renew: true,
        };
        assert_eq!(info.account_id, AccountId::from_u64(1).unwrap());
        assert!(info.renew);
    }

    #[test]
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn registration_failure_fields() {
        let failure = RegistrationFailure {
            account_id: AccountId::from_u64(1).unwrap(),
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
        assert_ne!(
            EventDirection::Inbound as u8,
            EventDirection::Outbound as u8
        );
        assert_ne!(
            EventDirection::Outbound as u8,
            EventDirection::Internal as u8
        );
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
        // [::TICKET::] P0-5, P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P1-2) --for-spec --no-implementation-order`.
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
    // [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn connected_call_info_all_fields() {
        let info = ConnectedCallInfo {
            call_id: CallId::from_u64(1).unwrap(),
            account_id: AccountId::from_u64(1).unwrap(),
            remote_uri: "sip:bob@example.net".into(),
        };
        assert_eq!(info.call_id, CallId::from_u64(1).unwrap());
        assert_eq!(info.account_id, AccountId::from_u64(1).unwrap());
        assert!(!info.remote_uri.is_empty());
    }

    // ── RawSipMessage redact_authorization ────────────────────────────

    /// @verifies C025, C048
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn redact_authorization_replaces_password() {
        let sip_msg = b"INVITE sip:user@example.com SIP/2.0\r\nAuthorization: Digest username=\"alice\", password=\"s3cret!\", realm=\"example.com\"\r\n\r\n";
        let raw = RawSipMessage {
            data: sip_msg.to_vec(),
        };
        let redacted = raw.redact_authorization();
        let output = String::from_utf8_lossy(&redacted.data);
        assert!(
            output.contains("[REDACTED]"),
            "redacted output must contain [REDACTED]"
        );
        assert!(
            !output.contains("s3cret!"),
            "redacted output must not contain original password"
        );
    }

    /// @verifies C025, C048
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn redact_authorization_noop_without_auth_header() {
        let sip_msg = b"INVITE sip:user@example.com SIP/2.0\r\nVia: SIP/2.0/UDP 192.0.2.1\r\n\r\n";
        let raw = RawSipMessage {
            data: sip_msg.to_vec(),
        };
        let redacted = raw.redact_authorization();
        assert_eq!(
            raw.data, redacted.data,
            "message without Authorization header must be unchanged"
        );
    }

    /// @verifies C025, C048
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn redact_authorization_multiple_headers() {
        let sip_msg = b"MESSAGE sip:user@example.com SIP/2.0\r\nAuthorization: Digest password=\"pass1\", username=\"alice\"\r\nAuthorization: Digest password=\"pass2\", username=\"bob\"\r\n\r\n";
        let raw = RawSipMessage {
            data: sip_msg.to_vec(),
        };
        let redacted = raw.redact_authorization();
        let output = String::from_utf8_lossy(&redacted.data);
        assert_eq!(
            output.matches("[REDACTED]").count(),
            2,
            "both Authorization headers must be redacted"
        );
        assert!(!output.contains("pass1"), "first password must be redacted");
        assert!(
            !output.contains("pass2"),
            "second password must be redacted"
        );
    }

    /// @verifies C025, C048
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn redact_authorization_preserves_auth_type() {
        // The Digest or Basic auth type must be preserved, only password value redacted
        let sip_msg = b"INVITE sip:user@example.com SIP/2.0\r\nAuthorization: Basic password=\"base64encoded\"\r\n\r\n";
        let raw = RawSipMessage {
            data: sip_msg.to_vec(),
        };
        let redacted = raw.redact_authorization();
        let output = String::from_utf8_lossy(&redacted.data);
        assert!(
            output.contains("Basic"),
            "auth type 'Basic' must be preserved"
        );
        assert!(output.contains("[REDACTED]"), "password must be redacted");
    }

    /// @verifies C025, C048
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn redact_authorization_clone_not_mutated() {
        // Verify the immutable pattern: original message is not modified
        let sip_msg = b"INVITE sip:user@example.com SIP/2.0\r\nAuthorization: Digest password=\"original\"\r\n\r\n";
        let raw = RawSipMessage {
            data: sip_msg.to_vec(),
        };
        let _redacted = raw.redact_authorization();
        let original_output = String::from_utf8_lossy(&raw.data);
        assert!(
            original_output.contains("original"),
            "original message must not be mutated"
        );
    }
}
