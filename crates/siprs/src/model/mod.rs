


// Module declarations for model sub-modules.
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
// [::TICKET::] P0-4: EventBus references RawSipMessage from raw_sip_message_spec.

// [::TICKET::] P4-3: audio_format_chunkpair module declared — SampleRate, BitDepth,
// ChannelLayout, AudioFormat, AudioChunk, AudioChunkPair.
pub mod audio_format_chunkpair;
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
// [::STUB::] P0-4: Only raw_sip_message_spec is declared here because EventBus
// references it. Other model files (id_design_newtype, memory_ownership_defaults,
// sqlite_schema) will be declared in their respective tickets.
pub mod raw_sip_message_spec;
// [::TICKET::] P4-1: id_design_newtype module declared — AccountId, CallId, AudioSourceId.
pub mod id_design_newtype;
// [::TICKET::] P4-4: sqlite_schema module — SQL persistence schema constants and migration types.
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
pub mod sqlite_schema;

// Re-export audio format types at model level.
pub use audio_format_chunkpair::{
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    AudioChunk, AudioChunkPair, AudioFormat, BitDepth, ChannelLayout, SampleRate,
};
