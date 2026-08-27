// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0030:  §21 Audio Format Model & AudioChunkPair
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0030 --hops=2)
//   - NODE_ID=N0035:  §25 IN/OUT Pair Alignment Algorithm
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0035 --hops=2)
//   - NODE_ID=N0036:  §26 Resampler Design & Stereo Mapping
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0036 --hops=2)
//   - NODE_ID=N0040:  §29 Codec Policy & Fallback Rules
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0040 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
use crate::config::account_config_spec::OpusConfig;
use crate::config::codec_policy_fallback::{CodecSelectionPolicy, NegotiatedCodec};
use crate::config::m20_codec_auto_mode::{CodecAutoMode, CodecInfo};
use crate::model::audio_resampler::ResamplePipeline;
use crate::model::interleave_in_out;
use crate::model::{
    AudioChunk, AudioChunkPair, AudioFormat, AudioFormatError, BitDepth, ChannelLayout,
    PairAligner, SampleRate,
};
use std::time::{Duration, Instant};

/// Codec id of Opus at its native rate — the highest auto-mode priority (C042).
const OPUS_CODEC_ID: &str = "opus/48000/2";
/// Prefix identifying any Opus codec id during negotiation (C041).
const OPUS_CODEC_PREFIX: &str = "opus/";
/// Exact codec id of PCMU (G.711 μ-law) — the Opus-incapable fallback (C041).
const PCMU_CODEC_ID: &str = "PCMU/8000/1";

/// Errors surfaced by the higher-level audio orchestration pipeline.
///
/// Every failure is typed and never panics; invalid states are rejected at the
/// boundary rather than partially constructed.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AudioOrchestrationError {
    /// The frame duration is not in {10, 20, 40, 60} ms (from `AudioFormat::new`).
    #[error("invalid audio format: {0}")]
    InvalidFormat(AudioFormatError),
    /// The in/out format combination is not resample-able (from `ResamplePipeline::new`).
    #[error("resampling unsupported: {0}")]
    ResampleUnsupported(&'static str),
    /// No mutually supported codec exists under the configured policy.
    #[error("media negotiation failed: no mutually supported codec")]
    MediaNegotiationFailed,
    /// An `AudioChunk::F32` was fed to an i16-native pipeline.
    #[error("unsupported audio chunk kind: expected I16 PCM")]
    UnsupportedChunkKind,
}

/// The four dimensions of an audio format, before validation.
///
/// `AudioFormatSpec` is the input schema at the orchestration boundary: it is
/// converted into a validated `AudioFormat` via `TryFrom`, so an invalid
/// `frame_ms` is rejected before any pipeline state exists.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AudioFormatSpec {
    /// Sample rate of the format.
    pub sample_rate: SampleRate,
    /// Bit depth of the format.
    pub bit_depth: BitDepth,
    /// Channel layout of the format.
    pub channel_layout: ChannelLayout,
    /// Frame duration in milliseconds — must be in {10, 20, 40, 60}.
    pub frame_ms: u16,
}

// [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
impl AudioFormatSpec {
    /// Construct a format spec from its four dimensions.
    pub const fn new(
        sample_rate: SampleRate,
        bit_depth: BitDepth,
        channel_layout: ChannelLayout,
        frame_ms: u16,
    ) -> Self {
        Self {
            sample_rate,
            bit_depth,
            channel_layout,
            frame_ms,
        }
    }
}

// [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
impl TryFrom<AudioFormatSpec> for AudioFormat {
    // [::TICKET::] P11-12, P17-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-12|P17-8) --for-spec --no-implementation-order`.
    type Error = AudioFormatError;

    /// Validate the spec into a concrete `AudioFormat`.
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn try_from(spec: AudioFormatSpec) -> Result<Self, AudioFormatError> {
        AudioFormat::new(
            spec.sample_rate,
            spec.bit_depth,
            spec.channel_layout,
            spec.frame_ms,
        )
    }
}

/// Configuration for constructing an `AudioPipeline`.
///
/// Formats are validated at construction time (`AudioPipelineConfig::new`) so an
/// invalid `frame_ms` is rejected before any pipeline state exists.
#[derive(Debug, Clone, PartialEq)]
pub struct AudioPipelineConfig {
    /// Format of the inbound (network) audio.
    pub in_format: AudioFormat,
    /// Format of the outbound (mixer) audio.
    pub out_format: AudioFormat,
    /// PairAligner tolerance — maximum acceptable timestamp delta for pairing.
    pub tolerance: Duration,
    /// Codec selection strategy used to resolve `ProcessedFrame::negotiated_codec`.
    pub codec_policy: CodecSelectionPolicy,
    /// Codecs offered by the remote peer, used for negotiation.
    pub remote_codecs: Vec<CodecInfo>,
}

// [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
impl AudioPipelineConfig {
    /// Construct a config from format specs, validating at the boundary.
    ///
    /// Returns `Err(AudioOrchestrationError::InvalidFormat)` when either `frame_ms`
    /// is outside {10, 20, 40, 60}.
    pub fn new(
        in_spec: AudioFormatSpec,
        out_spec: AudioFormatSpec,
        tolerance: Duration,
        codec_policy: CodecSelectionPolicy,
        remote_codecs: Vec<CodecInfo>,
    ) -> Result<Self, AudioOrchestrationError> {
        let in_format =
            AudioFormat::try_from(in_spec).map_err(AudioOrchestrationError::InvalidFormat)?;
        let out_format =
            AudioFormat::try_from(out_spec).map_err(AudioOrchestrationError::InvalidFormat)?;
        Ok(Self {
            in_format,
            out_format,
            tolerance,
            codec_policy,
            remote_codecs,
        })
    }
}

/// One processed frame produced by the orchestration pipeline.
#[derive(Debug, Clone, PartialEq)]
pub struct ProcessedFrame {
    /// Stereo interleaved samples `[L0, R0, L1, R1, ...]` with `L = IN`, `R = OUT`.
    pub stereo_interleaved: Vec<i16>,
    /// Codec resolved for this frame under the configured policy and remote list.
    pub negotiated_codec: NegotiatedCodec,
    /// Alignment timestamp — the later of the paired IN/OUT frames.
    pub timestamp: Instant,
}

// [::TICKET::] P17-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-8 --for-spec --no-implementation-order`.
impl ProcessedFrame {
    /// Build a frame from raw i16 PCM samples for the RT tap-supply path.
    ///
    /// The conf-bridge port ops (`RustMediaPort` get_frame / put_frame) receive
    /// raw PCM without a negotiated codec — the codec is unknown at the RT
    /// boundary, so a deterministic default (`Pcmu`) is used. Tap consumers
    /// (`AudioChunkPair::from_processed_frame`) only read `stereo_interleaved`,
    /// so the codec value does not affect tap output.
    pub(crate) fn from_i16_stereo(samples: &[i16]) -> Self {
        Self {
            stereo_interleaved: samples.to_vec(),
            negotiated_codec: NegotiatedCodec::Pcmu,
            timestamp: Instant::now(),
        }
    }
}

/// Higher-level audio orchestration — aligns IN/OUT frames, maps the stereo
/// layout, and resolves the codec policy for every processed frame.
///
/// Composition: `PairAligner` (align) → `ResamplePipeline::new` + `interleave_in_out`
/// (validate + stereo map) → `negotiate_codec` (codec policy).
#[derive(Debug)]
pub struct AudioPipeline {
    in_format: AudioFormat,
    out_format: AudioFormat,
    aligner: PairAligner,
    codec_policy: CodecSelectionPolicy,
    remote_codecs: Vec<CodecInfo>,
}

// [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
impl AudioPipeline {
    /// Validate the format combination and construct a pipeline with an empty aligner.
    ///
    /// Returns `Err(AudioOrchestrationError::ResampleUnsupported)` when the in/out
    /// sample rates are identical or the formats differ in bit_depth/channel_layout.
    pub fn new(config: AudioPipelineConfig) -> Result<Self, AudioOrchestrationError> {
        ResamplePipeline::new(config.in_format, config.out_format)
            .map_err(AudioOrchestrationError::ResampleUnsupported)?;
        Ok(Self {
            in_format: config.in_format,
            out_format: config.out_format,
            aligner: PairAligner::new(config.tolerance),
            codec_policy: config.codec_policy,
            remote_codecs: config.remote_codecs,
        })
    }

    /// Feed one IN/OUT pair snapshot into the aligner.
    ///
    /// Both sides are pushed under a single `Instant::now()` snapshot so IN and OUT
    /// remain paired by one timestamp (C031). An `AudioChunk::F32` is rejected
    /// before any queue is touched.
    pub fn push_pair(&mut self, pair: AudioChunkPair) -> Result<(), AudioOrchestrationError> {
        let in_data = to_i16_samples(&pair.in_chunk)?;
        let out_data = to_i16_samples(&pair.out_chunk)?;
        let now = Instant::now();
        self.aligner.push_in(in_data, now);
        self.aligner.push_out(out_data, now);
        Ok(())
    }

    /// Feed only the IN (network) side, timestamped now.
    pub fn push_in_frame(&mut self, samples: Vec<i16>) {
        self.aligner.push_in(samples, Instant::now());
    }

    /// Feed only the OUT (mixer) side, timestamped now.
    pub fn push_out_frame(&mut self, samples: Vec<i16>) {
        self.aligner.push_out(samples, Instant::now());
    }

    /// Attempt to produce one aligned, interleaved, codec-resolved frame.
    ///
    /// Returns `None` when pairing is not yet possible; the aligner may have
    /// dropped an over-tolerance frame or zero-padded a missing side.
    pub fn poll_processed_frame(
        &mut self,
    ) -> Option<Result<ProcessedFrame, AudioOrchestrationError>> {
        let (in_data, out_data, timestamp) = self.aligner.try_pair()?;
        let stereo_interleaved = interleave_in_out(&in_data, &out_data);
        let negotiated_codec = match self.resolve_negotiated_codec() {
            Ok(codec) => codec,
            Err(err) => return Some(Err(err)),
        };
        Some(Ok(ProcessedFrame {
            stereo_interleaved,
            negotiated_codec,
            timestamp,
        }))
    }

    /// Resolve the negotiated codec for a given remote codec list.
    pub fn negotiate_codec(
        &self,
        remote_codecs: &[CodecInfo],
    ) -> Result<NegotiatedCodec, AudioOrchestrationError> {
        negotiate_codec(self.codec_policy, remote_codecs)
    }

    /// Number of zero-padding events observed by the aligner (drift metric).
    pub fn alignment_drift(&self) -> u64 {
        self.aligner.alignment_drift()
    }

    /// The validated inbound format (read-only).
    pub fn in_format(&self) -> AudioFormat {
        self.in_format
    }

    /// The validated outbound format (read-only).
    pub fn out_format(&self) -> AudioFormat {
        self.out_format
    }

    /// Resolve the negotiated codec using the pipeline's stored remote codecs.
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn resolve_negotiated_codec(&self) -> Result<NegotiatedCodec, AudioOrchestrationError> {
        self.negotiate_codec(&self.remote_codecs)
    }
}

/// Resolve the codec negotiated for a remote codec list under a policy.
///
/// `PreferOpusFallbackPcmu` tries Opus then PCMU. `Ordered` reuses the auto-mode
/// priority assignment (Opus=255, PCMU=254) to pick the highest-priority mutual
/// codec. No mutual codec → `MediaNegotiationFailed`.
pub fn negotiate_codec(
    policy: CodecSelectionPolicy,
    remote_codecs: &[CodecInfo],
) -> Result<NegotiatedCodec, AudioOrchestrationError> {
    match policy {
        CodecSelectionPolicy::PreferOpusFallbackPcmu => {
            if remote_codecs
                .iter()
                .any(|c| c.codec_id.starts_with(OPUS_CODEC_PREFIX))
            {
                Ok(NegotiatedCodec::Opus(OpusConfig::default()))
            } else if remote_codecs.iter().any(|c| c.codec_id == PCMU_CODEC_ID) {
                Ok(NegotiatedCodec::Pcmu)
            } else {
                Err(AudioOrchestrationError::MediaNegotiationFailed)
            }
        }
        CodecSelectionPolicy::Ordered => {
            let priorities = CodecAutoMode::apply(remote_codecs, &[])
                .map_err(|_| AudioOrchestrationError::MediaNegotiationFailed)?;
            let opus_priority = priorities.get(OPUS_CODEC_ID).copied().unwrap_or(0);
            let pcmu_priority = priorities.get(PCMU_CODEC_ID).copied().unwrap_or(0);
            if opus_priority >= pcmu_priority && opus_priority > 0 {
                Ok(NegotiatedCodec::Opus(OpusConfig::default()))
            } else if pcmu_priority > 0 {
                Ok(NegotiatedCodec::Pcmu)
            } else {
                Err(AudioOrchestrationError::MediaNegotiationFailed)
            }
        }
    }
}

/// Convert an `AudioChunk` to the native i16 sample representation.
///
/// The pipeline operates on i16 PCM (C036 uses `Vec<i16>`); an `F32` chunk is
/// rejected rather than silently down-converted.
// [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
fn to_i16_samples(chunk: &AudioChunk) -> Result<Vec<i16>, AudioOrchestrationError> {
    match chunk {
        AudioChunk::I16(samples) => Ok(samples.clone()),
        AudioChunk::F32(_) => Err(AudioOrchestrationError::UnsupportedChunkKind),
    }
}

/// Tests for the higher-level audio orchestration pipeline.
#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::account_config_spec::OpusConfig;
    use crate::config::codec_policy_fallback::{CodecSelectionPolicy, NegotiatedCodec};
    use crate::config::m20_codec_auto_mode::{CodecAutoMode, CodecInfo};
    use crate::model::id_design_newtype::IdError;
    use crate::model::interleave_in_out;
    use crate::model::{
        AccountId, AudioChunk, AudioChunkPair, AudioFormat, AudioFormatError, BitDepth, CallId,
        ChannelLayout, SampleRate,
    };
    use std::time::{Duration, SystemTime};

    /// Build a valid 48kHz → 16kHz StereoInOut I16 pipeline with 20ms tolerance.
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn valid_pipeline() -> Result<AudioPipeline, AudioOrchestrationError> {
        let config = AudioPipelineConfig::new(
            AudioFormatSpec::new(
                SampleRate::Hz48000,
                BitDepth::I16,
                ChannelLayout::StereoInOut,
                20,
            ),
            AudioFormatSpec::new(
                SampleRate::Hz16000,
                BitDepth::I16,
                ChannelLayout::StereoInOut,
                20,
            ),
            Duration::from_millis(20),
            CodecSelectionPolicy::default(),
            vec![
                CodecInfo::new("opus/48000/2"),
                CodecInfo::new("PCMU/8000/1"),
            ],
        )?;
        AudioPipeline::new(config)
    }

    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn sample_pair(in_data: Vec<i16>, out_data: Vec<i16>) -> Result<AudioChunkPair, IdError> {
        Ok(AudioChunkPair {
            call_id: CallId::from_u64(1)?,
            account_id: AccountId::from_u64(1)?,
            timestamp: SystemTime::now(),
            in_chunk: AudioChunk::I16(in_data),
            out_chunk: AudioChunk::I16(out_data),
        })
    }

    /// @verifies C031
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn pipeline_config_rejects_invalid_frame_ms() {
        // Precondition: frame_ms must be in {10,20,40,60}.
        let err = AudioPipelineConfig::new(
            AudioFormatSpec::new(
                SampleRate::Hz48000,
                BitDepth::I16,
                ChannelLayout::StereoInOut,
                5, // invalid frame_ms
            ),
            AudioFormatSpec::new(
                SampleRate::Hz16000,
                BitDepth::I16,
                ChannelLayout::StereoInOut,
                20,
            ),
            Duration::from_millis(30),
            CodecSelectionPolicy::default(),
            vec![],
        );
        assert!(matches!(
            err,
            Err(AudioOrchestrationError::InvalidFormat(
                AudioFormatError::InvalidFrameMs(5)
            ))
        ));
    }

    /// @verifies C031
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn audio_chunk_pair_pairs_in_out_by_single_timestamp() -> Result<(), Box<dyn std::error::Error>>
    {
        // Invariant: IN and OUT are paired by one shared SystemTime.
        let ts = SystemTime::now();
        let pair = AudioChunkPair {
            call_id: CallId::from_u64(1)?,
            account_id: AccountId::from_u64(1)?,
            timestamp: ts,
            in_chunk: AudioChunk::I16(vec![0i16; 160]),
            out_chunk: AudioChunk::I16(vec![1i16; 160]),
        };
        assert_eq!(pair.timestamp, ts);
        assert_eq!(pair.in_chunk.len(), 160);
        assert_eq!(pair.out_chunk.len(), 160);
        Ok(())
    }

    /// @verifies C031
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn audio_format_all_valid_combinations_construct() {
        // Boundary: all 64 valid combinations construct; 9ms/61ms rejected.
        for &rate in &[
            SampleRate::Hz8000,
            SampleRate::Hz16000,
            SampleRate::Hz24000,
            SampleRate::Hz48000,
        ] {
            for &depth in &[BitDepth::I16, BitDepth::F32] {
                for &layout in &[ChannelLayout::Mono, ChannelLayout::StereoInOut] {
                    for &ms in &[10u16, 20, 40, 60] {
                        assert!(
                            AudioFormat::new(rate, depth, layout, ms).is_ok(),
                            "failed for {ms}ms"
                        );
                    }
                }
            }
        }
        assert!(
            AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 9).is_err()
        );
        assert!(
            AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 61).is_err()
        );
    }

    /// @verifies C036
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn pipeline_produces_paired_stereo_frame() -> Result<(), Box<dyn std::error::Error>> {
        // Postcondition: pushed pair yields stereo L=IN, R=OUT under the policy.
        let mut pipeline = valid_pipeline()?;
        let in_data: Vec<i16> = (1..=160).collect();
        let out_data: Vec<i16> = (101..=260).collect();
        pipeline.push_pair(sample_pair(in_data.clone(), out_data.clone())?)?;

        let frame = pipeline
            .poll_processed_frame()
            .ok_or("expected a processed frame")??;
        assert_eq!(frame.stereo_interleaved.len(), 320);
        for (i, (&in_sample, &out_sample)) in in_data.iter().zip(out_data.iter()).enumerate() {
            assert_eq!(frame.stereo_interleaved[2 * i], in_sample, "L=IN at {i}");
            assert_eq!(
                frame.stereo_interleaved[2 * i + 1],
                out_sample,
                "R=OUT at {i}"
            );
        }
        assert_eq!(
            frame.negotiated_codec,
            NegotiatedCodec::Opus(OpusConfig::default())
        );
        Ok(())
    }

    /// @verifies C036
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn pipeline_zero_pads_missing_out_side() -> Result<(), Box<dyn std::error::Error>> {
        // Invariant: only IN fed past tolerance → OUT zero-filled, drift incremented.
        let mut pipeline = valid_pipeline()?;
        let in_data: Vec<i16> = (1..=160).collect();
        pipeline.push_in_frame(in_data.clone());
        std::thread::sleep(Duration::from_millis(50)); // 50ms > 20ms tolerance

        let frame = pipeline
            .poll_processed_frame()
            .ok_or("expected a zero-padded frame")??;
        assert_eq!(frame.stereo_interleaved.len(), 320);
        for (i, &in_sample) in in_data.iter().enumerate() {
            assert_eq!(
                frame.stereo_interleaved[2 * i],
                in_sample,
                "L=IN preserved at {i}"
            );
            assert_eq!(
                frame.stereo_interleaved[2 * i + 1],
                0,
                "R=zero-padded at {i}"
            );
        }
        assert!(pipeline.alignment_drift() > 0);
        Ok(())
    }

    /// @verifies C037
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn interleave_maps_l_in_r_out() {
        // Postcondition: interleave_in_out maps stereo L=IN, R=OUT deterministically.
        let in_mono = vec![1i16, 2, 3, 4];
        let out_mono = vec![5i16, 6, 7, 8];
        let stereo = interleave_in_out(&in_mono, &out_mono);
        assert_eq!(stereo, vec![1, 5, 2, 6, 3, 7, 4, 8]);
    }

    /// @verifies C037
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn interleave_truncates_to_shortest_input() {
        // Boundary: unequal lengths truncate to the shorter input.
        let stereo = interleave_in_out(&[1i16, 2, 3], &[4i16, 5]);
        assert_eq!(stereo, vec![1, 4, 2, 5]);
    }

    /// @verifies C037
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn pipeline_rejects_identical_rates() -> Result<(), Box<dyn std::error::Error>> {
        // Error: AudioPipeline requires distinct in/out sample rates.
        let config = AudioPipelineConfig::new(
            AudioFormatSpec::new(
                SampleRate::Hz48000,
                BitDepth::I16,
                ChannelLayout::StereoInOut,
                20,
            ),
            AudioFormatSpec::new(
                SampleRate::Hz48000,
                BitDepth::I16,
                ChannelLayout::StereoInOut,
                20,
            ),
            Duration::from_millis(30),
            CodecSelectionPolicy::default(),
            vec![],
        )?;
        let err = AudioPipeline::new(config);
        assert!(matches!(
            err,
            Err(AudioOrchestrationError::ResampleUnsupported(_))
        ));
        Ok(())
    }

    /// @verifies C041
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn negotiate_codec_prefers_opus_over_pcmu() -> Result<(), Box<dyn std::error::Error>> {
        // Postcondition: PreferOpusFallbackPcmu resolves Opus first.
        let remote = vec![
            CodecInfo::new("opus/48000/2"),
            CodecInfo::new("PCMU/8000/1"),
        ];
        let codec = negotiate_codec(CodecSelectionPolicy::PreferOpusFallbackPcmu, &remote)?;
        assert_eq!(codec, NegotiatedCodec::Opus(OpusConfig::default()));
        Ok(())
    }

    /// @verifies C041
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn negotiate_codec_falls_back_to_pcmu() -> Result<(), Box<dyn std::error::Error>> {
        // Postcondition: without Opus, PCMU is the fallback.
        let remote = vec![CodecInfo::new("PCMU/8000/1"), CodecInfo::new("G722/8000/1")];
        let codec = negotiate_codec(CodecSelectionPolicy::PreferOpusFallbackPcmu, &remote)?;
        assert_eq!(codec, NegotiatedCodec::Pcmu);
        Ok(())
    }

    /// @verifies C041
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn negotiate_codec_fails_with_no_mutual_codec() {
        // Error: no mutually supported codec → MediaNegotiationFailed, never panics.
        let remote = vec![CodecInfo::new("G722/8000/1"), CodecInfo::new("GSM/8000/1")];
        let err = negotiate_codec(CodecSelectionPolicy::PreferOpusFallbackPcmu, &remote);
        assert!(matches!(
            err,
            Err(AudioOrchestrationError::MediaNegotiationFailed)
        ));
    }

    /// @verifies C041
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn negotiate_codec_empty_remote_fails() {
        // Boundary: empty remote list fails under both policies.
        let err = negotiate_codec(CodecSelectionPolicy::Ordered, &[]);
        assert!(matches!(
            err,
            Err(AudioOrchestrationError::MediaNegotiationFailed)
        ));
    }

    /// @verifies C042
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn ordered_policy_uses_auto_mode_priorities() -> Result<(), Box<dyn std::error::Error>> {
        // Invariant: Ordered resolves via auto-mode priorities (Opus=255 > PCMU=254).
        let remote = vec![
            CodecInfo::new("PCMU/8000/1"),
            CodecInfo::new("opus/48000/2"),
        ];
        let codec = negotiate_codec(CodecSelectionPolicy::Ordered, &remote)?;
        assert_eq!(codec, NegotiatedCodec::Opus(OpusConfig::default()));
        Ok(())
    }

    /// @verifies C042
    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn codec_auto_mode_explicit_mode_returns_empty_map() -> Result<(), Box<dyn std::error::Error>> {
        // Postcondition: non-empty preferred_codecs bypasses auto mode.
        let codecs = vec![CodecInfo::new("PCMU/8000/1")];
        let map = CodecAutoMode::apply(&codecs, &["opus/48000/2".to_string()])?;
        assert!(map.is_empty());
        Ok(())
    }

    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn push_pair_rejects_f32_chunk_without_touching_queues(
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Error: F32 chunk rejected at the boundary; aligner queues untouched.
        let mut pipeline = valid_pipeline()?;
        let pair = AudioChunkPair {
            call_id: CallId::from_u64(1)?,
            account_id: AccountId::from_u64(1)?,
            timestamp: SystemTime::now(),
            in_chunk: AudioChunk::F32(vec![0.0f32; 160]),
            out_chunk: AudioChunk::I16(vec![0i16; 160]),
        };
        let err = pipeline.push_pair(pair);
        assert!(matches!(
            err,
            Err(AudioOrchestrationError::UnsupportedChunkKind)
        ));
        assert_eq!(pipeline.alignment_drift(), 0);
        Ok(())
    }

    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn empty_i16_chunk_flows_through_pipeline() -> Result<(), Box<dyn std::error::Error>> {
        // Boundary: empty I16 chunk flows through producing len-0 stereo output.
        let mut pipeline = valid_pipeline()?;
        pipeline.push_pair(sample_pair(vec![], vec![7i16; 160])?)?;
        let frame = pipeline
            .poll_processed_frame()
            .ok_or("expected a processed frame")??;
        assert!(frame.stereo_interleaved.is_empty());
        Ok(())
    }

    #[test]
    // [::TICKET::] P11-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-12 --for-spec --no-implementation-order`.
    fn pipeline_is_deterministic() -> Result<(), Box<dyn std::error::Error>> {
        // Invariant: identical inputs yield identical outputs across instances.
        let mut p1 = valid_pipeline()?;
        let mut p2 = valid_pipeline()?;
        p1.push_pair(sample_pair((1..=160).collect(), (101..=260).collect())?)?;
        p2.push_pair(sample_pair((1..=160).collect(), (101..=260).collect())?)?;
        let f1 = p1.poll_processed_frame().ok_or("p1: expected a frame")??;
        let f2 = p2.poll_processed_frame().ok_or("p2: expected a frame")??;
        assert_eq!(f1.stereo_interleaved, f2.stereo_interleaved);
        Ok(())
    }
}
