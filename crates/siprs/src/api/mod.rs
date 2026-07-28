// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: API-layer module — event model, EventBus, DTMF two-phase design

pub mod event_model_payload_bus;
pub mod eventbus_receiver;
pub mod m20_dtmfsent_twophase;

// Re-export public types at the api level
pub use event_model_payload_bus::{
    ConnectedCallInfo, DtmfReceivedInfo, EventDirection, EventMeta, EventTimestamp,
    MediaActiveInfo, MediaErrorInfo, RegistrationFailure, RegistrationInfo, SipEvent,
    SipEventPayload,
};
pub use eventbus_receiver::{AccountEventReceiver, EventBus};
pub use m20_dtmfsent_twophase::{DtmfSentInfo, SentDtmfError};
