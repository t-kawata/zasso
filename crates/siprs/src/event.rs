// [::TICKET::] P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-5 --for-spec --no-implementation-order`.
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: Public event module — facade re-exporting API and state event types
//
// This module provides the canonical `siprs::event::*` namespace.
// Consumers should use these re-exports rather than importing from
// `crate::api` or `crate::state` directly.

// [::TICKET::] P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-2 --for-spec --no-implementation-order`.
// Re-export from API layer (event model, bus, DTMF)
pub use crate::api::event_model_payload_bus::{
    ConnectedCallInfo, DtmfReceivedInfo, EventDirection, EventMeta, EventTimestamp,
    MediaActiveInfo, MediaErrorInfo, RegistrationFailure, RegistrationInfo, SipEvent,
    SipEventPayload,
};
pub use crate::api::eventbus_receiver::{AccountEventReceiver, EventBus};
pub use crate::api::m20_dtmfsent_twophase::{DtmfSentInfo, SentDtmfError};
// [::TICKET::] P5-2: Audio source adapter types
pub use crate::api::asyncaudiosrc_adapter::{
    ErasedAudioSource, SyncAudioSource, SyncSourceAdapter,
};
// [::TICKET::] P5-2: Incoming call types
pub use crate::api::incoming_call_refer::{IncomingCall, IncomingCallConfig};

// Re-export from state layer (call state, native event, registration)
pub use crate::state::m20_callstate_mapping::{CallDirection, CallMediaState, CallState};
pub use crate::state::m20_native_event_conv::NativeEvent;
pub use crate::state::m20_registr_cmd_pat::AccountInfoSnapshot;
pub use crate::state::registr_state_machine::RegistrationState;
