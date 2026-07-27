
// Module declarations for api sub-modules.
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
// [::TICKET::] P0-4: EventBus, AccountEventReceiver, SipEventPayload, SipEvent, EventMeta.

// [::STUB::] P0-4: Only modules required by this ticket are declared.
// Other api files (public_api_design, call_api_semantics, dtmf_spec_received, etc.)
// will be declared in their respective tickets.
pub mod event_model_payload_bus;
pub mod eventbus_receiver;
