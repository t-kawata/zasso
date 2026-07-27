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
//   - NODE_ID=N0062:  §54 HTTP/WS API Protocol — REST & WebSocket
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0062 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! HTTP/WebSocket API protocol types for the siprs standalone server (§54).
//!
//! Defines the external network-facing interface: REST endpoint path constants
//! (18 endpoints), WebSocket endpoint paths, binary audio frame header
//! (AudioFrameHeader, 24 bytes), WS text event protocol (WsEvent), Axum Router
//! builder function signature, AppState, and authentication request/response types.
//!
//! ## Architecture
//!
//! This module contains **type-level contracts only** — no runtime HTTP server
//! logic. The actual Axum server integration (tower::Service, tokio::net::TcpListener)
//! belongs in the siprs-server binary (P5-3). The types here serve as the shared
//! protocol definition that both siprs (this crate) and siprs-server consume.
//!
//! ## Event-audio correlation (§54.5)
//!
//! SipEvent (event_model_payload_bus.rs) gains a `seq: u64` field and
//! AudioChunkPair (audio_format_chunkpair.rs) gains `first_seq` / `last_seq`
//! fields. AudioFrameHeader carries a `sequence_number` field in the same
//! global sequence number space.

// ---------------------------------------------------------------------------
// REST API endpoint path constants (§54.1)
// ---------------------------------------------------------------------------

/// Health check endpoint (no auth required).
pub const PATH_HEALTH: &str = "/api/v1/health";
/// SIP account authentication → JWT token issuance (no auth required).
pub const PATH_AUTH_TOKEN: &str = "/api/v1/auth/token";
/// List all SIP accounts.
pub const PATH_ACCOUNTS: &str = "/api/v1/accounts";
/// Get or delete a single SIP account by ID.
pub const PATH_ACCOUNTS_ID: &str = "/api/v1/accounts/:id";
/// Register a SIP account with its provider.
pub const PATH_ACCOUNTS_REGISTER: &str = "/api/v1/accounts/:id/register";
/// Unregister a SIP account.
pub const PATH_ACCOUNTS_UNREGISTER: &str = "/api/v1/accounts/:id/unregister";
/// Initiate an outgoing call from an account.
pub const PATH_ACCOUNTS_CALLS: &str = "/api/v1/accounts/:id/calls";
/// List all active calls.
pub const PATH_CALLS: &str = "/api/v1/calls";
/// Get call state by ID.
pub const PATH_CALLS_ID: &str = "/api/v1/calls/:id";
/// Hang up an active call.
pub const PATH_CALLS_HANGUP: &str = "/api/v1/calls/:id/hangup";
/// Place a call on hold.
pub const PATH_CALLS_HOLD: &str = "/api/v1/calls/:id/hold";
/// Release a held call.
pub const PATH_CALLS_UNHOLD: &str = "/api/v1/calls/:id/unhold";
/// Send DTMF digits on an active call.
pub const PATH_CALLS_DTMF: &str = "/api/v1/calls/:id/dtmf";
/// Transfer (REFER) a call to another party.
pub const PATH_CALLS_TRANSFER: &str = "/api/v1/calls/:id/transfer";
/// Server-Sent Events stream for control event monitoring.
pub const PATH_EVENTS: &str = "/api/v1/events";
/// Graceful SIP client shutdown.
pub const PATH_SHUTDOWN: &str = "/api/v1/shutdown";

// ---------------------------------------------------------------------------
// WebSocket endpoint path constants (§54.2)
// ---------------------------------------------------------------------------

/// WebSocket endpoint for control events + audio chunks.
pub const PATH_WS: &str = "/api/v1/ws";
/// WebSocket endpoint for audio chunks only (no control events).
pub const PATH_WS_AUDIO: &str = "/api/v1/ws/audio";

// ---------------------------------------------------------------------------
// Public routes (exempt from JWT authentication, §54.3 / §55.3)
// ---------------------------------------------------------------------------

/// Routes that do NOT require JWT authentication.
///
/// Currently includes health check and auth token endpoints only.
/// All other routes require a valid Bearer token.
pub const PUBLIC_ROUTES: &[&str] = &[PATH_HEALTH, PATH_AUTH_TOKEN];

// ---------------------------------------------------------------------------
// Audio frame binary header (§54.4)
// ---------------------------------------------------------------------------

/// WebSocket binary audio frame header — fixed 30-byte structure.
///
/// Every binary audio frame begins with this header, followed by variable-length
/// PCM sample data. The header is `#[repr(C, packed)]` for FFI compatibility
/// with the PJSIP media thread (P0-9).
///
/// ## Layout
///
/// | Offset | Size | Field            | Description                         |
/// |--------|------|------------------|-------------------------------------|
/// | 0      | 8    | sequence_number  | Global sequence number (EventBus)   |
/// | 8      | 8    | timestamp_ms     | Sampling time (Unix epoch ms)       |
/// | 16     | 2    | frame_ms         | Frame length in ms (typically 20)   |
/// | 18     | 2    | sample_rate      | Sampling rate in Hz                 |
/// | 20     | 1    | channels         | 1=mono, 2=stereo                   |
/// | 21     | 1    | bits_per_sample  | 16 = i16 PCM                        |
/// | 22     | 4    | call_id          | Call ID (0 = control frame)         |
/// | 26     | 4    | reserved         | Future expansion (zero-filled)      |
/// | **30** |      | **Total**        |                                     |
///
/// **Note**: The RFC §54.4 header comment states "24 bytes" but the actual size
/// is 30 bytes given the field types (u64+u64+u16+u16+u8+u8+u32+[u8;4] = 30).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(C, packed)]
pub struct AudioFrameHeader {
    /// Global monotonically increasing sequence number (shared with EventBus).
    pub sequence_number: u64,
    /// Sampling timestamp in milliseconds since UNIX epoch.
    pub timestamp_ms: u64,
    /// Frame duration in milliseconds (typically 20ms).
    pub frame_ms: u16,
    /// Sampling rate in Hz (e.g. 8000, 16000, 48000).
    pub sample_rate: u16,
    /// Number of audio channels (1=mono, 2=stereo).
    pub channels: u8,
    /// Bits per sample (16 = i16 PCM).
    pub bits_per_sample: u8,
    /// Call ID this frame belongs to (0 = control/auxiliary frame).
    pub call_id: u32,
    /// Reserved for future expansion. Must be zero-filled.
    pub reserved: [u8; 4],
}

// ---------------------------------------------------------------------------
// WebSocket text event protocol (§54.4)
// ---------------------------------------------------------------------------

/// A WebSocket text frame carrying a control event.
///
/// Serialised as JSON:
/// ```json
/// { "type": "event", "seq": 1042, "payload": { "kind": "CallConnected", ... } }
/// ```
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct WsEvent {
    /// Message type discriminator (e.g. "event").
    #[cfg_attr(feature = "serde", serde(rename = "type"))]
    pub event_type: String,
    /// Global sequence number for event-audio correlation.
    pub seq: u64,
    /// Event payload as an arbitrary JSON value (serde feature required).
    #[cfg(feature = "serde")]
    pub payload: serde_json::Value,
}

/// Discriminator for known WebSocket event payload kinds.
///
/// This enum lists every event kind that can appear in a WsEvent payload's
/// "kind" field. It is `#[non_exhaustive]` so that adding new kinds in
/// future releases is not a breaking change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[non_exhaustive]
pub enum WsEventPayloadKind {
    /// SIP account registration started.
    RegistrationStarted,
    /// SIP account registration succeeded.
    RegistrationSucceeded,
    /// SIP account registration failed.
    RegistrationFailed,
    /// SIP account unregistration succeeded.
    UnregistrationSucceeded,
    /// SIP account unregistration failed.
    UnregistrationFailed,
    /// Registration expired and requires re-registration.
    RegistrationExpired,
    /// Outgoing call started.
    OutgoingCallStarted,
    /// Outgoing call is trying to connect.
    OutgoingCallTrying,
    /// Outgoing call is ringing at the remote end.
    OutgoingCallRinging,
    /// Early media received (e.g. ringback tone).
    EarlyMediaReceived,
    /// Call successfully connected.
    CallConnected,
    /// Incoming call received.
    IncomingCall,
    /// Call disconnected.
    CallDisconnected,
    /// Call was cancelled.
    CallCancelled,
    /// Call was rejected.
    CallRejected,
    /// Call placed on hold.
    CallHeld,
    /// Call resumed from hold.
    CallResumed,
    /// REFER transfer received.
    ReferReceived,
    /// Call transfer completed.
    TransferCompleted,
    /// Media stream became active.
    MediaActive,
    /// Media stream stopped.
    MediaStopped,
    /// Media stream error.
    MediaError,
    /// DTMF digit received.
    DtmfReceived,
    /// ICE negotiation started.
    IceNegotiationStarted,
    /// ICE negotiation succeeded.
    IceNegotiationSucceeded,
    /// ICE negotiation failed.
    IceNegotiationFailed,
    /// Transport connected.
    TransportConnected,
    /// Transport disconnected.
    TransportDisconnected,
    /// Transport error occurred.
    TransportError,
    /// SIP account added.
    AccountAdded,
    /// SIP account removed.
    AccountRemoved,
    /// SIP account configuration changed.
    AccountConfigChanged,
    /// SIP client initialised.
    ClientInitialized,
    /// SIP client shutting down.
    ClientShutdown,
    /// Generic error event.
    Error,
}

// ---------------------------------------------------------------------------
// Authentication types (§54.1: POST /api/v1/auth/token)
// ---------------------------------------------------------------------------

/// Token authentication request body.
///
/// Sent to `POST /api/v1/auth/token` to authenticate a SIP account and receive
/// a JWT token.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AuthRequest {
    /// SIP account username (e.g. "1001").
    pub sip_username: String,
    /// SIP account password.
    pub sip_password: String,
    /// SIP domain (e.g. "pbx.example.com").
    pub sip_domain: String,
}

/// Token authentication response body.
///
/// Returned by `POST /api/v1/auth/token` on successful authentication.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AuthResponse {
    /// JWT bearer token string.
    pub token: String,
    /// Token expiry in seconds from issuance.
    pub expires_in: u64,
}

// ---------------------------------------------------------------------------
// Application state (§54.3)
// ---------------------------------------------------------------------------

/// Shared application state passed to all route handlers via Axum's `State`.
///
/// Holds references to the SIP client, JWT validator, and database pool.
/// The actual type fields will be populated when axum is integrated in P5-3.
#[derive(Debug, Clone, Default)]
pub struct AppState {
    /// SIP client for making and managing calls.
    pub sip_client: std::sync::Arc<std::sync::Mutex<()>>,
    // [::STUB::] P5-3: Add db_pool (rusqlite::Connection or r2d2::Pool) and
    // jwt_validator (JwtValidator from P2-4) fields when axum is integrated.
}

// ---------------------------------------------------------------------------
// Router builder (§54.3)
// ---------------------------------------------------------------------------

/// Builds the Axum Router with all REST and WebSocket routes.
///
/// Returns an `axum::Router` configured with 18 REST routes, 2 WebSocket routes,
/// and a JWT authentication layer.
///
/// This function is a placeholder until axum is added as a dependency (P5-3).
/// The return type is `axum::Router` which requires the `axum` crate.
/// Currently returns a unit type for compilation without axum.
// [::STUB::] P5-3: Full axum Router construction deferred to P5-3
pub fn build_router(_state: AppState) {
    // [::STUB::] P5-3: Implement full Axum Router construction with:
    //   Router::new()
    //     .route(PATH_HEALTH, get(health_check))
    //     .route(PATH_AUTH_TOKEN, post(auth::issue_token))
    //     ...
    //     .layer(AxumJWTAuthLayer::new(state.jwt_validator.clone()))
    //     .with_state(state)
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C063-postcondition: REST endpoint path constants ───────────────────
    // -----------------------------------------------------------------------

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn rest_path_health() {
        assert_eq!(PATH_HEALTH, "/api/v1/health");
    }

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn rest_path_auth_token() {
        assert_eq!(PATH_AUTH_TOKEN, "/api/v1/auth/token");
    }

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn rest_path_accounts() {
        assert_eq!(PATH_ACCOUNTS, "/api/v1/accounts");
        assert_eq!(PATH_ACCOUNTS_ID, "/api/v1/accounts/:id");
        assert_eq!(PATH_ACCOUNTS_REGISTER, "/api/v1/accounts/:id/register");
        assert_eq!(PATH_ACCOUNTS_UNREGISTER, "/api/v1/accounts/:id/unregister");
        assert_eq!(PATH_ACCOUNTS_CALLS, "/api/v1/accounts/:id/calls");
    }

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn rest_path_calls() {
        assert_eq!(PATH_CALLS, "/api/v1/calls");
        assert_eq!(PATH_CALLS_ID, "/api/v1/calls/:id");
        assert_eq!(PATH_CALLS_HANGUP, "/api/v1/calls/:id/hangup");
        assert_eq!(PATH_CALLS_HOLD, "/api/v1/calls/:id/hold");
        assert_eq!(PATH_CALLS_UNHOLD, "/api/v1/calls/:id/unhold");
        assert_eq!(PATH_CALLS_DTMF, "/api/v1/calls/:id/dtmf");
        assert_eq!(PATH_CALLS_TRANSFER, "/api/v1/calls/:id/transfer");
    }

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn rest_path_events_shutdown() {
        assert_eq!(PATH_EVENTS, "/api/v1/events");
        assert_eq!(PATH_SHUTDOWN, "/api/v1/shutdown");
    }

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn ws_path_constants() {
        assert_eq!(PATH_WS, "/api/v1/ws");
        assert_eq!(PATH_WS_AUDIO, "/api/v1/ws/audio");
    }

    // -----------------------------------------------------------------------
    // ── C064-postcondition: PUBLIC_ROUTES ──────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C064-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn public_routes_contain_health_and_auth() {
        assert!(PUBLIC_ROUTES.contains(&PATH_HEALTH));
        assert!(PUBLIC_ROUTES.contains(&PATH_AUTH_TOKEN));
        assert_eq!(PUBLIC_ROUTES.len(), 2);
    }

    // -----------------------------------------------------------------------
    // ── C063-postcondition: AudioFrameHeader ────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn audio_frame_header_size_exactly_30_bytes() {
        assert_eq!(std::mem::size_of::<AudioFrameHeader>(), 30);
    }

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn audio_frame_header_construct_and_access() {
        let hdr = AudioFrameHeader {
            sequence_number: 42,
            timestamp_ms: 1748935200123,
            frame_ms: 20,
            sample_rate: 48000,
            channels: 1,
            bits_per_sample: 16,
            call_id: 7,
            reserved: [0u8; 4],
        };
        // Copy fields to local variables to avoid misaligned reference UB
        // on #[repr(C, packed)] struct.
        let seq = { hdr.sequence_number };
        let ts = { hdr.timestamp_ms };
        let frame = { hdr.frame_ms };
        let rate = { hdr.sample_rate };
        let ch = { hdr.channels };
        let bps = { hdr.bits_per_sample };
        let cid = { hdr.call_id };
        let res = { hdr.reserved };
        assert_eq!(seq, 42);
        assert_eq!(ts, 1748935200123);
        assert_eq!(frame, 20);
        assert_eq!(rate, 48000);
        assert_eq!(ch, 1);
        assert_eq!(bps, 16);
        assert_eq!(cid, 7);
        assert_eq!(res, [0u8; 4]);
    }

    /// @verifies C063-boundary
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn audio_frame_header_call_id_zero_is_control_frame() {
        // SAFETY: zero_init creates an all-zero AudioFrameHeader using safe initialization.
        // This is safe because AudioFrameHeader is #[repr(C, packed)] and all-zero
        // is a valid representation for all field types (u64, u16, u8, [u8; 4]).
        // unsafe not used; zeroed() is avoided due to #![forbid(unsafe_code)].
        let hdr = AudioFrameHeader {
            sequence_number: 0,
            timestamp_ms: 0,
            frame_ms: 0,
            sample_rate: 0,
            channels: 0,
            bits_per_sample: 0,
            call_id: 0,
            reserved: [0u8; 4],
        };
        let call_id = { hdr.call_id };
        assert_eq!(call_id, 0);
    }

    // -----------------------------------------------------------------------
    // ── C063-postcondition: WsEvent ─────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn ws_event_constructable() {
        let event = WsEvent {
            event_type: "event".to_string(),
            seq: 1042,
            payload: serde_json::json!({"kind": "CallConnected"}),
        };
        let s = { event.seq };
        assert_eq!(s, 1042);
        assert_eq!(event.event_type, "event");
    }

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn ws_event_serde_round_trip() {
        let event = WsEvent {
            event_type: "event".to_string(),
            seq: 1042,
            payload: serde_json::json!({"kind": "CallConnected", "call_id": 7}),
        };
        let json = serde_json::to_string(&event).expect("serialise WsEvent");
        let deserialized: WsEvent = serde_json::from_str(&json).expect("deserialise WsEvent");
        assert_eq!(deserialized.seq, event.seq);
        assert_eq!(deserialized.event_type, event.event_type);
    }

    // -----------------------------------------------------------------------
    // ── C063-postcondition: WsEventPayloadKind ─────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C063-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn ws_event_payload_kind_variants_constructable() {
        let variants: Vec<WsEventPayloadKind> = vec![
            WsEventPayloadKind::RegistrationStarted,
            WsEventPayloadKind::RegistrationSucceeded,
            WsEventPayloadKind::RegistrationFailed,
            WsEventPayloadKind::UnregistrationSucceeded,
            WsEventPayloadKind::UnregistrationFailed,
            WsEventPayloadKind::RegistrationExpired,
            WsEventPayloadKind::OutgoingCallStarted,
            WsEventPayloadKind::OutgoingCallTrying,
            WsEventPayloadKind::OutgoingCallRinging,
            WsEventPayloadKind::EarlyMediaReceived,
            WsEventPayloadKind::CallConnected,
            WsEventPayloadKind::IncomingCall,
            WsEventPayloadKind::CallDisconnected,
            WsEventPayloadKind::CallCancelled,
            WsEventPayloadKind::CallRejected,
            WsEventPayloadKind::CallHeld,
            WsEventPayloadKind::CallResumed,
            WsEventPayloadKind::ReferReceived,
            WsEventPayloadKind::TransferCompleted,
            WsEventPayloadKind::MediaActive,
            WsEventPayloadKind::MediaStopped,
            WsEventPayloadKind::MediaError,
            WsEventPayloadKind::DtmfReceived,
            WsEventPayloadKind::IceNegotiationStarted,
            WsEventPayloadKind::IceNegotiationSucceeded,
            WsEventPayloadKind::IceNegotiationFailed,
            WsEventPayloadKind::TransportConnected,
            WsEventPayloadKind::TransportDisconnected,
            WsEventPayloadKind::TransportError,
            WsEventPayloadKind::AccountAdded,
            WsEventPayloadKind::AccountRemoved,
            WsEventPayloadKind::AccountConfigChanged,
            WsEventPayloadKind::ClientInitialized,
            WsEventPayloadKind::ClientShutdown,
            WsEventPayloadKind::Error,
        ];
        assert_eq!(variants.len(), 35);
        // Verify Debug formatting
        assert_eq!(format!("{:?}", WsEventPayloadKind::CallConnected), "CallConnected");
        assert_eq!(format!("{:?}", WsEventPayloadKind::Error), "Error");
    }

    // -----------------------------------------------------------------------
    // ── C064-postcondition: Auth types ──────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C064-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn auth_request_serde_round_trip() {
        let req = AuthRequest {
            sip_username: "1001".to_string(),
            sip_password: "secret".to_string(),
            sip_domain: "pbx.example.com".to_string(),
        };
        let json = serde_json::to_string(&req).expect("serialise AuthRequest");
        let deserialized: AuthRequest =
            serde_json::from_str(&json).expect("deserialise AuthRequest");
        assert_eq!(deserialized.sip_username, "1001");
        assert_eq!(deserialized.sip_password, "secret");
        assert_eq!(deserialized.sip_domain, "pbx.example.com");
    }

    /// @verifies C064-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn auth_response_serde_round_trip() {
        let res = AuthResponse {
            token: "eyJ...".to_string(),
            expires_in: 3600,
        };
        let json = serde_json::to_string(&res).expect("serialise AuthResponse");
        let deserialized: AuthResponse =
            serde_json::from_str(&json).expect("deserialise AuthResponse");
        assert_eq!(deserialized.token, "eyJ...");
        assert_eq!(deserialized.expires_in, 3600);
    }

    // -----------------------------------------------------------------------
    // ── C063-invariant: Debug derive ────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C063-invariant
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn types_implement_debug_and_clone() {
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}

        assert_debug::<AudioFrameHeader>();
        assert_clone::<AudioFrameHeader>();
        assert_copy::<AudioFrameHeader>();

        assert_debug::<WsEvent>();
        assert_clone::<WsEvent>();

        assert_debug::<WsEventPayloadKind>();
        assert_clone::<WsEventPayloadKind>();
        assert_copy::<WsEventPayloadKind>();

        assert_debug::<AuthRequest>();
        assert_clone::<AuthRequest>();

        assert_debug::<AuthResponse>();
        assert_clone::<AuthResponse>();
    }

    /// @verifies C064-invariant
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn auth_types_partial_eq() {
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
        assert_partial_eq::<AuthRequest>();
        assert_partial_eq::<AuthResponse>();
    }
}
