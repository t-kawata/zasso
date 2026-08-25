// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: API-layer module — event model, EventBus, DTMF two-phase design
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
pub mod event_model_payload_bus;
pub mod eventbus_receiver;
// [::TICKET::] P15-4: Event bus unification — §62.3 single EventBus topology (N0072)
pub mod event_bus_unify;
// [::TICKET::] P15-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-4 --for-spec --no-implementation-order`.
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
// [::TICKET::] P9-2: Audio Subscribe API — AudioTapMode, AudioTapHandle, AudioTapSender
pub mod audio_subscribe_bp;
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
// [::TICKET::] P9-3: Call API & Answer Semantics — CallApiSemantics trait (RFC N0027)
pub mod call_api_semantics;
// [::TICKET::] P15-6: Call API expansion — §62.5 public call-control surface (N0074)
pub mod call_api_expansion;
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.

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
// [::TICKET::] P9-2: Audio Subscribe API re-exports
pub use audio_subscribe_bp::{AudioTapHandle, AudioTapMode, AudioTapSender};
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
