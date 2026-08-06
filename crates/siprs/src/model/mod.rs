// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.

// [::TICKET::] P2-3: model module — SQLite persistence schema & DatabasePool.
// The model/ directory also contains AudioChunkPair, ID design, memory/ownership,
// and the RFC §16 raw SIP message model (raw_sip_message_spec).

/// ID newtypes — unconditionally compiled (not behind sqlite-storage feature)
/// since AccountId, CallId, AudioSourceId are used across the entire crate.
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
pub mod id_design_newtype;

pub use id_design_newtype::{AccountId, AudioSourceId, CallId};

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
/// Audio format model — SampleRate, BitDepth, ChannelLayout, AudioFormat, AudioChunk, AudioChunkPair
pub mod audio_format_chunkpair;

pub use audio_format_chunkpair::{
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    AudioChunk,
    AudioChunkPair,
    AudioFormat,
    AudioFormatError,
    BitDepth,
    ChannelLayout,
    SampleRate,
};

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
/// IN/OUT Pair Alignment — PairAligner with tolerance-based matching and zero-padding
pub mod audio_aligner;

pub use audio_aligner::PairAligner;

/// Resampler design and stereo IN/OUT mapping — ResamplePipeline, interleave_in_out
pub mod audio_resampler;

pub use audio_resampler::interleave_in_out;
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.

/// Media bridge — lock-free RT/async boundary with AudioBridge and RustMediaPort.
pub mod media_bridge;

pub use media_bridge::{AudioBridge, MediaFrame, PortDirection};

/// SQLite persistence schema with SeaORM entities and DatabasePool.
///
/// Only compiled when the `sqlite-storage` feature is enabled.
#[cfg(feature = "sqlite-storage")]
pub mod sqlite_schema;

#[cfg(feature = "sqlite-storage")]
pub use sqlite_schema::*;

/// Raw SIP message model — RFC §16 (N0024): parsed fields, parser, accessors.
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
pub mod raw_sip_message_spec;

pub use raw_sip_message_spec::{RawSipMessage, SipMessageDirection};
