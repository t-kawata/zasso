// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.


// Module declarations for api sub-modules.
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
// [::TICKET::] P0-4: EventBus, AccountEventReceiver, SipEventPayload, SipEvent, EventMeta.

// [::STUB::] P0-4: Only modules required by this ticket are declared.
// Other api files (call_api_semantics, dtmf_spec_received, etc.)
// will be declared in their respective tickets.
pub mod event_model_payload_bus;
// [::TICKET::] P4-4: http_ws_protocol module — REST/WS protocol types, AudioFrameHeader,
// WsEvent, AuthRequest/AuthResponse, endpoint path constants, build_router.
pub mod http_ws_protocol;
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
pub mod eventbus_receiver;
// [::TICKET::] P0-7: m20_dtmfsent_twophase module — DtmfSentInfo, DtmfMethod,
// SentDtmfError, DtmfConfig, and two-phase semantics types.
pub mod m20_dtmfsent_twophase;
// [::TICKET::] P3-1: public_api_design module — SipClient, SipAccountHandle,
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
// OutgoingCallRequest, CallMediaPreferences, RegistrationState, Codec.
pub mod public_api_design;
// [::TICKET::] P3-3: standalone_server_config module — ServerConfig, AuthConfig, AuthMode.
pub mod standalone_server_config;
// [::TICKET::] P5-1: call_api_semantics module — SipClient call control methods.
pub mod call_api_semantics;
// [::TICKET::] P5-1: audio_subscribe_bp module — AudioTapMode, AudioTapHandle, types.
pub mod audio_subscribe_bp;

// Re-exports for crate-root convenience
pub use public_api_design::{
    CallMediaPreferences, Codec, OutgoingCallRequest, RegistrationState, SipAccountHandle,
    SipClient,
};
pub use standalone_server_config::{AuthConfig, AuthMode, ServerConfig};
#[cfg(feature = "serde")]
pub use http_ws_protocol::{AuthRequest, AuthResponse};
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
pub use http_ws_protocol::{AudioFrameHeader, WsEvent, WsEventPayloadKind};
// [::TICKET::] P5-1: Re-export AudioSubscribe types.
pub use audio_subscribe_bp::{AudioTapHandle, AudioTapMode, HangupReason, MediaDirection};
