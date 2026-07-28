// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: API-layer module — event model, EventBus, DTMF two-phase design
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
pub mod event_model_payload_bus;
pub mod eventbus_receiver;
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
// [::TICKET::] P2-2: HTTP/WS protocol types — REST endpoint constants, AudioFrameHeader
pub mod http_ws_protocol;
pub mod m20_dtmfsent_twophase;
// [::TICKET::] P2-2: Standalone server configuration — ServerConfig, AuthConfig, AuthMode
pub mod standalone_server_config;

// Re-export public types at the api level
pub use event_model_payload_bus::{
    ConnectedCallInfo, DtmfReceivedInfo, EventDirection, EventMeta, EventTimestamp,
    MediaActiveInfo, MediaErrorInfo, RegistrationFailure, RegistrationInfo, SipEvent,
    SipEventPayload,
};
pub use eventbus_receiver::{AccountEventReceiver, EventBus};
pub use m20_dtmfsent_twophase::{DtmfSentInfo, SentDtmfError};
