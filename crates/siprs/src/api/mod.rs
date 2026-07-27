// Module declarations for api sub-modules.
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
// [::TICKET::] P0-4: EventBus, AccountEventReceiver, SipEventPayload, SipEvent, EventMeta.

// [::STUB::] P0-4: Only modules required by this ticket are declared.
// Other api files (call_api_semantics, dtmf_spec_received, etc.)
// will be declared in their respective tickets.
pub mod event_model_payload_bus;
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

// Re-exports for crate-root convenience
pub use public_api_design::{
    CallMediaPreferences, Codec, OutgoingCallRequest, RegistrationState, SipAccountHandle,
    SipClient,
};
pub use standalone_server_config::{AuthConfig, AuthMode, ServerConfig};
