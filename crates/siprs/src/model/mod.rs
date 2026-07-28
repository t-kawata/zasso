

// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.

// [::TICKET::] P2-3: model module — SQLite persistence schema & DatabasePool.
// The model/ directory also contains AudioChunkPair, ID design, and memory/ownership
// stubs for future tickets (P1+, P0-7).

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
    AudioChunk, AudioChunkPair, AudioFormat, AudioFormatError, BitDepth, ChannelLayout, SampleRate,
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
