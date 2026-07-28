// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: API-layer module — event model, EventBus, DTMF two-phase design
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
pub mod event_model_payload_bus;
pub mod eventbus_receiver;
// [::TICKET::] P3-1: Call types — OutgoingCallRequest, CallMediaPreferences, Codec
pub mod call_types;
// [::TICKET::] P3-1: Public API design — SipAccountHandle, OutgoingCallRequest
pub mod public_api_design;
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
// [::TICKET::] P2-2: HTTP/WS protocol types — REST endpoint constants, AudioFrameHeader
pub mod http_ws_protocol;
// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
pub mod m20_dtmfsent_twophase;
// [::TICKET::] P2-2: Standalone server configuration — ServerConfig, AuthConfig, AuthMode
pub mod standalone_server_config;
// [::TICKET::] P5-2: DTMF spec — DtmfReceivedInfo method field, DtmfPolicy helpers
pub mod dtmf_spec_received;
// [::TICKET::] P5-2: AsyncAudioSource adapter types — ErasedAudioSource, SyncAudioSource, SyncSourceAdapter
pub mod asyncaudiosrc_adapter;
// [::TICKET::] P5-2: Incoming call and REFER/transfer types — IncomingCall, IncomingCallConfig
pub mod incoming_call_refer;

// Re-export public types at the api level
pub use event_model_payload_bus::{
    ConnectedCallInfo, DtmfReceivedInfo, EventDirection, EventMeta, EventTimestamp,
    MediaActiveInfo, MediaErrorInfo, RegistrationFailure, RegistrationInfo, SipEvent,
    SipEventPayload,
};
pub use eventbus_receiver::{AccountEventReceiver, EventBus};
pub use m20_dtmfsent_twophase::{DtmfSentInfo, SentDtmfError};
// [::TICKET::] P5-2: Audio source adapter re-exports
pub use asyncaudiosrc_adapter::{ErasedAudioSource, SyncAudioSource, SyncSourceAdapter};
// [::TICKET::] P5-2: Incoming call re-exports
pub use incoming_call_refer::{IncomingCall, IncomingCallConfig};
