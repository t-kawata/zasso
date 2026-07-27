
// Module declarations for model sub-modules.
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
// [::TICKET::] P0-4: EventBus references RawSipMessage from raw_sip_message_spec.

// [::STUB::] P0-4: Only raw_sip_message_spec is declared here because EventBus
// references it. Other model files (audio_format_chunkpair, id_design_newtype,
// memory_ownership_defaults, sqlite_schema) will be declared in their respective tickets.
pub mod raw_sip_message_spec;
// [::TICKET::] P4-1: id_design_newtype module declared — AccountId, CallId, AudioSourceId.
pub mod id_design_newtype;
