
/// Higher-level audio orchestration — composes the model/ audio primitives
/// (AudioFormat, AudioChunkPair, PairAligner, ResamplePipeline) and the
/// config/ codec policy types (NegotiatedCodec, CodecSelectionPolicy) into a
/// usable align → resample → codec-policy pipeline.
pub mod pipeline;

/// §62.6 media path architecture — ChannelSelector unified audio injection.
pub mod media_path_arch;

/// §62.16 media path completion — WAV writer / WAV file source.
pub mod media_path_wiring;

pub use pipeline::{AudioOrchestrationError, AudioPipeline, AudioPipelineConfig, ProcessedFrame};

pub use media_path_arch::ChannelSelector;
