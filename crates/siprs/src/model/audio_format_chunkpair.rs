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
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Audio format model and AudioChunkPair definitions (N0030).
//!
//! Defines the foundational audio data types for the siprs audio pipeline:
//!
//! - `SampleRate` — 8/16/24/48 kHz sampling rates
//! - `BitDepth` — I16 or F32 sample representation
//! - `ChannelLayout` — Mono or StereoInOut
//! - `AudioFormat` — Combined audio format descriptor with frame duration validation
//! - `AudioChunk` — Typed PCM sample buffer (I16 or F32)
//! - `AudioChunkPair` — Timestamped IN/OUT pair sharing a single timestamp

use std::time::SystemTime;

use crate::error::error_design_siperror::{SipError, SipErrorKind};
use crate::model::id_design_newtype::{AccountId, CallId};

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/// Minimum allowed frame duration in milliseconds (PJSIP constraint).
pub(crate) const MIN_FRAME_MS: u16 = 10;

// ---------------------------------------------------------------------------
// SampleRate — audio sampling rates
// ---------------------------------------------------------------------------

/// Audio sampling rates supported by the siprs audio pipeline.
///
/// Four standard telephony rates are provided:
/// - `Hz8000` (narrowband, PCMU/PCMA)
/// - `Hz16000` (wideband)
/// - `Hz24000` (super-wideband)
/// - `Hz48000` (full-band, Opus default)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum SampleRate {
    /// 8 kHz — narrowband (PCMU/G.711).
    Hz8000,
    /// 16 kHz — wideband.
    Hz16000,
    /// 24 kHz — super-wideband.
    Hz24000,
    /// 48 kHz — full-band (Opus default).
    Hz48000,
}

// ---------------------------------------------------------------------------
// BitDepth — audio sample bit depth
// ---------------------------------------------------------------------------

/// Bit depth for audio samples.
///
/// - `I16`: Signed 16-bit integer PCM (PJSIP native format).
/// - `F32`: 32-bit float PCM (internal processing format).
#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum BitDepth {
    /// Signed 16-bit integer PCM samples.
    I16,
    /// 32-bit float PCM samples.
    F32,
}

// ---------------------------------------------------------------------------
// ChannelLayout — audio channel configuration
// ---------------------------------------------------------------------------

/// Channel layout for audio streams.
///
/// - `Mono`: Single channel (monaural).
/// - `StereoInOut`: Stereo with L=IN channel, R=OUT channel mapping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum ChannelLayout {
    /// Single monaural channel.
    Mono,
    /// Stereo with L=IN, R=OUT channel mapping.
    StereoInOut,
}

// ---------------------------------------------------------------------------
// AudioFormat — combined audio format descriptor
// ---------------------------------------------------------------------------

/// Combined audio format descriptor.
///
/// Carries the complete audio format specification: sample rate, bit depth,
/// channel layout, and frame duration in milliseconds.
///
/// Construction validates that `frame_ms >= MIN_FRAME_MS` (10 ms).
#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AudioFormat {
    /// Sampling rate in Hz.
    sample_rate: SampleRate,
    /// Bit depth of audio samples.
    bit_depth: BitDepth,
    /// Channel layout configuration.
    channel_layout: ChannelLayout,
    /// Frame duration in milliseconds.
    frame_ms: u16,
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl AudioFormat {
    /// Creates a new `AudioFormat` with validation.
    ///
    /// Returns `Err(SipErrorKind::AudioFormatUnsupported)` when `frame_ms`
    /// is less than `MIN_FRAME_MS` (10 ms).
    pub fn new(
        sample_rate: SampleRate,
        bit_depth: BitDepth,
        channel_layout: ChannelLayout,
        frame_ms: u16,
    ) -> Result<Self, SipError> {
        if frame_ms < MIN_FRAME_MS {
            return Err(SipError::new(
                SipErrorKind::AudioFormatUnsupported,
                format!("frame_ms must be >= {MIN_FRAME_MS}, got {frame_ms}"),
            ));
        }
        Ok(Self {
            sample_rate,
            bit_depth,
            channel_layout,
            frame_ms,
        })
    }

    /// Returns the sample rate.
    pub fn sample_rate(&self) -> SampleRate {
        self.sample_rate
    }

    /// Returns the bit depth.
    pub fn bit_depth(&self) -> BitDepth {
        self.bit_depth
    }

    /// Returns the channel layout.
    pub fn channel_layout(&self) -> ChannelLayout {
        self.channel_layout
    }

    /// Returns the frame duration in milliseconds.
    pub fn frame_ms(&self) -> u16 {
        self.frame_ms
    }
}

// ---------------------------------------------------------------------------
// AudioChunk — typed PCM sample buffer
// ---------------------------------------------------------------------------

/// A typed PCM sample buffer.
///
/// Wraps a `Vec<i16>` or `Vec<f32>` representing audio samples. The type
/// system distinguishes I16 from F32 at the enum level, avoiding runtime
/// format checks.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum AudioChunk {
    /// Signed 16-bit integer PCM samples.
    I16(Vec<i16>),
    /// 32-bit float PCM samples.
    F32(Vec<f32>),
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl AudioChunk {
    /// Returns the number of audio samples (frames) in this chunk.
    pub fn frame_len(&self) -> usize {
        match self {
            AudioChunk::I16(v) => v.len(),
            AudioChunk::F32(v) => v.len(),
        }
    }
}

// ---------------------------------------------------------------------------
// AudioChunkPair — timestamped IN/OUT audio pair
// ---------------------------------------------------------------------------

/// A timestamped pair of IN (received) and OUT (to-send) audio chunks.
///
/// Both chunks share a single `SystemTime` timestamp, ensuring they are
/// treated as a single aligned audio event. The `call_id` and `account_id`
/// identify the call and account this pair belongs to.
#[derive(Debug, Clone)]
pub struct AudioChunkPair {
    /// The call this audio pair belongs to.
    call_id: CallId,
    /// The account this audio pair belongs to.
    account_id: AccountId,
    /// Shared timestamp for both IN and OUT chunks.
    timestamp: SystemTime,
    /// Received audio from the remote peer.
    in_chunk: AudioChunk,
    /// Audio to send to the remote peer.
    out_chunk: AudioChunk,
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl AudioChunkPair {
    /// Creates a new `AudioChunkPair`.
    pub fn new(
        call_id: CallId,
        account_id: AccountId,
        timestamp: SystemTime,
        in_chunk: AudioChunk,
        out_chunk: AudioChunk,
    ) -> Self {
        Self {
            call_id,
            account_id,
            timestamp,
            in_chunk,
            out_chunk,
        }
    }

    /// Returns the call ID.
    pub fn call_id(&self) -> CallId {
        self.call_id
    }

    /// Returns the account ID.
    pub fn account_id(&self) -> AccountId {
        self.account_id
    }

    /// Returns the shared timestamp.
    pub fn timestamp(&self) -> SystemTime {
        self.timestamp
    }

    /// Returns a reference to the IN (received) audio chunk.
    pub fn in_chunk(&self) -> &AudioChunk {
        &self.in_chunk
    }

    /// Returns a reference to the OUT (to-send) audio chunk.
    pub fn out_chunk(&self) -> &AudioChunk {
        &self.out_chunk
    }
}

// ---------------------------------------------------------------------------
// PairAligner — IN/OUT timestamped ring buffer alignment (N0035)
// ---------------------------------------------------------------------------

// [::STUB::] P5-2: Full PairAligner implementation with VecDeque rings,
// tolerance matching, and drift metrics. This ticket (P4-3) defines the
// type scaffolding only. The rubato-based ResamplePipeline will be
// integrated in P5-2 when the AudioWorkerTask context exists.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// A timestamped audio frame carrying monotonic time and PCM data.
#[derive(Debug, Clone)]
// [::STUB::] P5-2: dead_code resolved once PairAligner is consumed by AudioWorkerTask
#[allow(dead_code)]
pub(crate) struct TimedFrame {
    /// Monotonic timestamp for alignment comparison.
    pub(crate) ts_mono: Instant,
    /// Audio sample data.
    pub(crate) data: Vec<i16>,
}

/// Aligns IN and OUT audio streams by timestamp tolerance.
///
/// Maintains two internal `VecDeque` rings for IN and OUT frames. The
/// `try_pair()` method returns a matched pair when timestamps are within
/// the configured tolerance, or drops the older frame from the leading
/// queue when drift exceeds tolerance.
///
/// **Note**: Full implementation with drift metrics and zero-padding is
/// in P5-2. This scaffold provides type completeness for the audio
/// pipeline definition.
#[derive(Debug, Clone)]
// [::STUB::] P5-2: dead_code resolved once AudioWorkerTask consumes PairAligner
#[allow(dead_code)]
pub(crate) struct PairAligner {
    /// IN (received) frame queue.
    in_q: VecDeque<TimedFrame>,
    /// OUT (to-send) frame queue.
    out_q: VecDeque<TimedFrame>,
    /// Maximum timestamp delta for a successful pair.
    tolerance: Duration,
    /// Number of consecutive drift-induced drops.
    drift_metric: u64,
}

// [::STUB::] P5-2: dead_code resolved once AudioWorkerTask consumes PairAligner
#[allow(dead_code)]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl PairAligner {
    /// Creates a new `PairAligner` with the given timestamp tolerance.
    pub(crate) fn new(tolerance: Duration) -> Self {
        Self {
            in_q: VecDeque::new(),
            out_q: VecDeque::new(),
            tolerance,
            drift_metric: 0,
        }
    }

    /// Enqueues an IN frame with the given timestamp and data.
    pub(crate) fn push_in(&mut self, ts: Instant, data: Vec<i16>) {
        self.in_q.push_back(TimedFrame {
            ts_mono: ts,
            data,
        });
    }

    /// Enqueues an OUT frame with the given timestamp and data.
    pub(crate) fn push_out(&mut self, ts: Instant, data: Vec<i16>) {
        self.out_q.push_back(TimedFrame {
            ts_mono: ts,
            data,
        });
    }

    /// Attempts to pair the oldest IN and OUT frames.
    ///
    /// Returns `Some((in_data, out_data, timestamp))` when the oldest frames
    /// from both queues are within `tolerance`. Returns `None` when:
    /// - Either queue is empty
    /// - The timestamp delta exceeds tolerance (the older frame is dropped)
    ///
    /// The returned timestamp is the later of the two frame timestamps.
    pub(crate) fn try_pair(&mut self) -> Option<(Vec<i16>, Vec<i16>, Instant)> {
        let in_front = self.in_q.front()?;
        let out_front = self.out_q.front()?;
        let delta = if in_front.ts_mono >= out_front.ts_mono {
            in_front.ts_mono - out_front.ts_mono
        } else {
            out_front.ts_mono - in_front.ts_mono
        };
        if delta <= self.tolerance {
            let in_frame = self.in_q.pop_front().expect("front confirmed above");
            let out_frame = self.out_q.pop_front().expect("front confirmed above");
            let ts = in_frame.ts_mono.max(out_frame.ts_mono);
            self.drift_metric = 0;
            Some((in_frame.data, out_frame.data, ts))
        } else {
            self.drift_metric += 1;
            // Pop the older frame from the leading queue
            if in_front.ts_mono < out_front.ts_mono {
                let _ = self.in_q.pop_front();
            } else {
                let _ = self.out_q.pop_front();
            }
            None
        }
    }

    /// Returns the current drift metric (consecutive tolerance misses).
    pub(crate) fn drift_metric(&self) -> u64 {
        self.drift_metric
    }
}

// ---------------------------------------------------------------------------
// ResamplePipeline — sample rate conversion scaffolding (N0036)
// ---------------------------------------------------------------------------

// [::STUB::] P5-2: Full ResamplePipeline with rubato-based resampling,
// stereo L=IN/R=OUT interleaving, and SampleRate conversion. This ticket
// (P4-3) defines the type-scaffolding and interleave_in_out function only.
// The actual rate conversion logic will be implemented when rubato crate
// is added as a dependency in P5-2.

/// Sample rate conversion pipeline (scaffolding).
///
/// Currently provides the interleave_in_out function for stereo channel
/// mapping (L=IN, R=OUT). Full rubato-based resampling is deferred to P5-2.
#[derive(Debug, Clone, Copy, PartialEq)]
// [::STUB::] P5-2: dead_code resolved once AudioWorkerTask consumes ResamplePipeline
#[allow(dead_code)]
pub(crate) struct ResamplePipeline {
    /// Input sample rate.
    in_rate: SampleRate,
    /// Output sample rate.
    out_rate: SampleRate,
}

// [::STUB::] P5-2: dead_code resolved once AudioWorkerTask consumes ResamplePipeline
#[allow(dead_code)]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl ResamplePipeline {
    /// Creates a new `ResamplePipeline`.
    ///
    /// Accepts all rate combinations. Full validation of rate ratios
    /// against rubato capabilities is deferred to P5-2.
    pub(crate) fn new(in_rate: SampleRate, out_rate: SampleRate) -> Result<Self, SipError> {
        Ok(Self { in_rate, out_rate })
    }

    /// Returns the input sample rate.
    pub(crate) fn in_rate(&self) -> SampleRate {
        self.in_rate
    }

    /// Returns the output sample rate.
    pub(crate) fn out_rate(&self) -> SampleRate {
        self.out_rate
    }

    /// Resamples a monaural frame (scaffolding — identity passthrough).
    ///
    /// [::STUB::] P5-2: Replace with rubato::FftFixedIn<f32> resampling.
    /// Currently returns the input unchanged (identity).
    pub(crate) fn resample_mono(&self, input: &[i16]) -> Vec<i16> {
        // [::STUB::] P5-2: Implement rubato-based rate conversion.
        // Current stub: identity passthrough with length adjustment for testing.
        let ratio = self.rate_ratio();
        let out_len = (input.len() as f64 / ratio).round() as usize;
        input.iter().copied().take(out_len).collect()
    }

    /// Interleaves IN (L) and OUT (R) mono frames into stereo.
    ///
    /// The output vector has `min(in_len, out_len) * 2` elements, with
    /// even indices carrying IN samples (L channel) and odd indices
    /// carrying OUT samples (R channel).
    pub(crate) fn interleave_in_out(in_mono: &[i16], out_mono: &[i16]) -> Vec<i16> {
        let n = in_mono.len().min(out_mono.len());
        let mut stereo = Vec::with_capacity(n * 2);
        for i in 0..n {
            stereo.push(in_mono[i]);
            stereo.push(out_mono[i]);
        }
        stereo
    }

    /// Calculates the input-to-output rate ratio.
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn rate_ratio(&self) -> f64 {
        let in_val = sample_rate_hz(self.in_rate) as f64;
        let out_val = sample_rate_hz(self.out_rate) as f64;
        in_val / out_val
    }
}

/// Converts a `SampleRate` enum to its Hz value.
// [::STUB::] P5-2: dead_code resolved once ResamplePipeline rate ratio is consumed
#[allow(dead_code)]
pub(crate) fn sample_rate_hz(rate: SampleRate) -> u32 {
    match rate {
        SampleRate::Hz8000 => 8000,
        SampleRate::Hz16000 => 16000,
        SampleRate::Hz24000 => 24000,
        SampleRate::Hz48000 => 48000,
    }
}

// ---------------------------------------------------------------------------
// PortDirection — media port direction enum (N0049)
// ---------------------------------------------------------------------------

/// Direction of a custom media port.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
// [::STUB::] P5-2: dead_code resolved once AudioMixer/AudioBridge consumes PortDirection
#[allow(dead_code)]
pub(crate) enum PortDirection {
    /// Capture port: receives remote audio (IN direction).
    Capture,
    /// Playback port: injects local audio (OUT direction).
    Playback,
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── SampleRate ─────────────────────────────────────────────────────────
    // -----------------------------------------------------------------------

    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn sample_rate_all_variants_constructable() {
        let rates = [
            SampleRate::Hz8000,
            SampleRate::Hz16000,
            SampleRate::Hz24000,
            SampleRate::Hz48000,
        ];
        assert_eq!(rates.len(), 4);
        // Verify Debug formatting
        assert_eq!(format!("{:?}", SampleRate::Hz8000), "Hz8000");
        assert_eq!(format!("{:?}", SampleRate::Hz48000), "Hz48000");
    }

    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn sample_rate_derives_clone_copy_partial_eq_eq_hash() {
        let a = SampleRate::Hz16000;
        let b = a; // Copy
        assert_eq!(a, b);
        assert!(a.eq(&b));
        let mut set = std::collections::HashSet::new();
        set.insert(a);
        assert!(set.contains(&SampleRate::Hz16000));
    }

    // -----------------------------------------------------------------------
    // ── BitDepth ──────────────────────────────────────────────────────────
    // -----------------------------------------------------------------------

    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn bit_depth_all_variants_constructable() {
        let depths = [BitDepth::I16, BitDepth::F32];
        assert_eq!(depths.len(), 2);
        assert_eq!(format!("{:?}", BitDepth::I16), "I16");
        assert_eq!(format!("{:?}", BitDepth::F32), "F32");
    }

    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn bit_depth_derives_clone_copy_partial_eq() {
        let a = BitDepth::I16;
        let b = a; // Copy
        assert_eq!(a, b);
    }

    // -----------------------------------------------------------------------
    // ── ChannelLayout ─────────────────────────────────────────────────────
    // -----------------------------------------------------------------------

    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn channel_layout_all_variants_constructable() {
        let layouts = [ChannelLayout::Mono, ChannelLayout::StereoInOut];
        assert_eq!(layouts.len(), 2);
        assert_eq!(format!("{:?}", ChannelLayout::Mono), "Mono");
        assert_eq!(
            format!("{:?}", ChannelLayout::StereoInOut),
            "StereoInOut"
        );
    }

    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn channel_layout_derives_clone_copy_partial_eq_eq_hash() {
        let a = ChannelLayout::Mono;
        let b = a; // Copy
        assert_eq!(a, b);
        let mut set = std::collections::HashSet::new();
        set.insert(a);
        assert!(set.contains(&ChannelLayout::Mono));
    }

    // -----------------------------------------------------------------------
    // ── C031-normal: AudioFormat construction ──────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C031-precondition
    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_format_new_valid_parameters() {
        let fmt = AudioFormat::new(
            SampleRate::Hz48000,
            BitDepth::I16,
            ChannelLayout::Mono,
            20,
        )
        .expect("valid parameters should succeed");
        assert_eq!(fmt.sample_rate(), SampleRate::Hz48000);
        assert_eq!(fmt.bit_depth(), BitDepth::I16);
        assert_eq!(fmt.channel_layout(), ChannelLayout::Mono);
        assert_eq!(fmt.frame_ms(), 20);
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_format_all_sample_rates_constructable() {
        for rate in &[
            SampleRate::Hz8000,
            SampleRate::Hz16000,
            SampleRate::Hz24000,
            SampleRate::Hz48000,
        ] {
            let fmt = AudioFormat::new(*rate, BitDepth::F32, ChannelLayout::StereoInOut, 20);
            assert!(fmt.is_ok(), "rate {rate:?} should be valid");
        }
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_format_derives_clone_copy_partial_eq() {
        let a = AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 20)
            .unwrap();
        let b = a; // Copy
        assert_eq!(a, b);
    }

    // -----------------------------------------------------------------------
    // ── C031-error: AudioFormat validation ─────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C031-error
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_format_frame_ms_zero_rejected() {
        let result =
            AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 0);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind, SipErrorKind::AudioFormatUnsupported);
    }

    // -----------------------------------------------------------------------
    // ── C031-boundary: AudioFormat frame_ms boundary ───────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C031-boundary
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_format_frame_ms_minimum_accepted() {
        let fmt = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 10);
        assert!(fmt.is_ok(), "minimum frame_ms = 10 should be accepted");
        assert_eq!(fmt.unwrap().frame_ms(), 10);
    }

    /// @verifies C031-boundary
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_format_frame_ms_extended_accepted() {
        let fmt =
            AudioFormat::new(SampleRate::Hz48000, BitDepth::F32, ChannelLayout::StereoInOut, 60);
        assert!(fmt.is_ok(), "extended frame_ms = 60 should be accepted");
        assert_eq!(fmt.unwrap().frame_ms(), 60);
    }

    // -----------------------------------------------------------------------
    // ── C031-normal: AudioChunk ────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_chunk_i16_constructed() {
        let samples = vec![0i16; 160];
        let chunk = AudioChunk::I16(samples);
        assert_eq!(chunk.frame_len(), 160);
        assert!(matches!(chunk, AudioChunk::I16(_)));
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_chunk_f32_constructed() {
        let samples = vec![0.0f32; 160];
        let chunk = AudioChunk::F32(samples);
        assert_eq!(chunk.frame_len(), 160);
        assert!(matches!(chunk, AudioChunk::F32(_)));
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_chunk_derives_debug_clone() {
        let chunk = AudioChunk::I16(vec![1, 2, 3]);
        let cloned = chunk.clone();
        assert_eq!(chunk.frame_len(), cloned.frame_len());
    }

    // -----------------------------------------------------------------------
    // ── C031-normal: AudioChunkPair ────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C031-precondition
    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_chunk_pair_constructed_with_i16() {
        let call_id = CallId::from_u64(1).unwrap();
        let account_id = AccountId::from_u64(1).unwrap();
        let now = SystemTime::now();
        let pair = AudioChunkPair::new(
            call_id,
            account_id,
            now,
            AudioChunk::I16(vec![0i16; 160]),
            AudioChunk::I16(vec![1i16; 160]),
        );
        assert_eq!(pair.call_id(), call_id);
        assert_eq!(pair.account_id(), account_id);
        assert_eq!(pair.timestamp(), now);
        assert!(matches!(pair.in_chunk(), AudioChunk::I16(_)));
        assert!(matches!(pair.out_chunk(), AudioChunk::I16(_)));
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_chunk_pair_heterogeneous_chunks() {
        let call_id = CallId::from_u64(2).unwrap();
        let account_id = AccountId::from_u64(2).unwrap();
        let pair = AudioChunkPair::new(
            call_id,
            account_id,
            SystemTime::now(),
            AudioChunk::I16(vec![0i16; 160]),
            AudioChunk::F32(vec![0.0f32; 160]),
        );
        assert!(matches!(pair.in_chunk(), AudioChunk::I16(_)));
        assert!(matches!(pair.out_chunk(), AudioChunk::F32(_)));
    }

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_chunk_pair_derives_debug_clone() {
        let pair = AudioChunkPair::new(
            CallId::from_u64(3).unwrap(),
            AccountId::from_u64(3).unwrap(),
            SystemTime::now(),
            AudioChunk::I16(vec![]),
            AudioChunk::I16(vec![]),
        );
        let cloned = pair.clone();
        assert_eq!(pair.call_id(), cloned.call_id());
        assert_eq!(pair.account_id(), cloned.account_id());
    }

    // -----------------------------------------------------------------------
    // ── C031-invariant: IN/OUT paired by timestamp ─────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C031-invariant
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_chunk_pair_single_timestamp_invariant() {
        let ts = SystemTime::now();
        let pair = AudioChunkPair::new(
            CallId::from_u64(4).unwrap(),
            AccountId::from_u64(4).unwrap(),
            ts,
            AudioChunk::I16(vec![]),
            AudioChunk::I16(vec![]),
        );
        // Single timestamp — both IN and OUT share the same value
        assert_eq!(pair.timestamp(), ts);
    }

    // -----------------------------------------------------------------------
    // ── C031-error: AudioChunkPair empty chunks ────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C031-error
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_chunk_pair_empty_chunks_produce_zero_length() {
        let pair = AudioChunkPair::new(
            CallId::from_u64(5).unwrap(),
            AccountId::from_u64(5).unwrap(),
            SystemTime::now(),
            AudioChunk::I16(vec![]),
            AudioChunk::I16(vec![]),
        );
        assert_eq!(pair.in_chunk().frame_len(), 0);
        assert_eq!(pair.out_chunk().frame_len(), 0);
    }

    // -----------------------------------------------------------------------
    // ── C036-normal: PairAligner ───────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C036-precondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_new_empty_queues() {
        let mut aligner = PairAligner::new(Duration::from_millis(20));
        assert_eq!(aligner.drift_metric(), 0);
        assert!(aligner.try_pair().is_none());
    }

    /// @verifies C036-precondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_missing_in_returns_none() {
        let mut aligner = PairAligner::new(Duration::from_millis(20));
        let ts = Instant::now();
        // Only push OUT, no IN
        aligner.push_out(ts, vec![1i16; 160]);
        assert!(aligner.try_pair().is_none());
    }

    /// @verifies C036-precondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_missing_out_returns_none() {
        let mut aligner = PairAligner::new(Duration::from_millis(20));
        let ts = Instant::now();
        // Only push IN, no OUT
        aligner.push_in(ts, vec![1i16; 160]);
        assert!(aligner.try_pair().is_none());
    }

    /// @verifies C036-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_try_pair_within_tolerance() {
        let mut aligner = PairAligner::new(Duration::from_millis(20));
        let ts = Instant::now();
        aligner.push_in(ts, vec![1i16; 160]);
        aligner.push_out(ts, vec![2i16; 160]);

        let result = aligner.try_pair();
        assert!(result.is_some());
        let (in_data, out_data, paired_ts) = result.unwrap();
        assert_eq!(in_data[0], 1);
        assert_eq!(out_data[0], 2);
        // Paired timestamp is max of the two (equal here)
        assert_eq!(paired_ts, ts);
    }

    /// @verifies C036-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_multiple_pairs_in_order() {
        let mut aligner = PairAligner::new(Duration::from_millis(50));
        let base = Instant::now();
        for i in 0..3 {
            let ts = base + Duration::from_millis(i * 10);
            aligner.push_in(ts, vec![(i * 2) as i16; 10]);
            aligner.push_out(ts, vec![(i * 2 + 1) as i16; 10]);
        }

        for i in 0..3 {
            let result = aligner.try_pair();
            assert!(result.is_some(), "pair {i} should succeed");
            let (in_data, out_data, _ts) = result.unwrap();
            assert_eq!(in_data[0], (i * 2) as i16, "IN pair {i}");
            assert_eq!(out_data[0], (i * 2 + 1) as i16, "OUT pair {i}");
        }
        // All pairs consumed
        assert!(aligner.try_pair().is_none());
    }

    // -----------------------------------------------------------------------
    // ── C036-error: PairAligner drift ──────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C036-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_drift_exceeds_tolerance_drops_older() {
        let mut aligner = PairAligner::new(Duration::from_millis(5));
        let early = Instant::now();
        let late = early + Duration::from_millis(100);

        aligner.push_in(early, vec![1i16; 160]);
        aligner.push_out(late, vec![2i16; 160]);

        // Drift > tolerance: older frame (IN) dropped
        let result = aligner.try_pair();
        assert!(result.is_none());
        // Drift metric should have increased
        // Note: drift_metric resets to 0 only on successful pair
    }

    /// @verifies C036-error
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_drift_metric_increments_on_mismatch() {
        let mut aligner = PairAligner::new(Duration::from_millis(1));
        let early = Instant::now();
        let late = early + Duration::from_millis(100);

        aligner.push_in(early, vec![1i16; 160]);
        aligner.push_out(late, vec![2i16; 160]);

        let _ = aligner.try_pair();
        assert!(
            aligner.drift_metric() > 0,
            "drift metric should be positive after mismatch"
        );
    }

    /// @verifies C036-error
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_both_queues_empty_returns_none() {
        let mut aligner = PairAligner::new(Duration::from_millis(20));
        assert!(aligner.try_pair().is_none());
    }

    // -----------------------------------------------------------------------
    // ── C036-boundary: PairAligner boundary conditions ─────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C036-boundary
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_exact_tolerance_boundary_inclusive() {
        let mut aligner = PairAligner::new(Duration::from_millis(10));
        let ts = Instant::now();
        aligner.push_in(ts, vec![1i16; 10]);
        aligner.push_out(ts + Duration::from_millis(10), vec![2i16; 10]);

        // dt == tolerance → inclusive boundary, should succeed
        let result = aligner.try_pair();
        assert!(result.is_some(), "delta == tolerance should produce a pair");
    }

    /// @verifies C036-boundary
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_zero_tolerance_exact_match_only() {
        let mut aligner = PairAligner::new(Duration::ZERO);
        let ts = Instant::now();

        aligner.push_in(ts, vec![1i16; 10]);
        aligner.push_out(ts, vec![2i16; 10]); // Same timestamp

        let result = aligner.try_pair();
        assert!(
            result.is_some(),
            "zero tolerance with exact match should succeed"
        );

        // Now with slight offset
        aligner.push_in(ts, vec![3i16; 10]);
        aligner.push_out(ts + Duration::from_nanos(1), vec![4i16; 10]);

        let result = aligner.try_pair();
        assert!(
            result.is_none(),
            "zero tolerance with 1ns offset should fail"
        );
    }

    // -----------------------------------------------------------------------
    // ── C036-invariant: PairAligner invariants ─────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C036-invariant
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn pair_aligner_does_not_panic_on_empty_queues() {
        let mut aligner = PairAligner::new(Duration::from_millis(20));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            // try_pair on empty queues should return None without panicking
            let _ = aligner.try_pair();
        }));
        assert!(result.is_ok(), "try_pair should not panic on empty queues");
    }

    // -----------------------------------------------------------------------
    // ── C037-normal: ResamplePipeline ──────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C037-precondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn resample_pipeline_new_accepts_compatible_rates() {
        let rp = ResamplePipeline::new(SampleRate::Hz48000, SampleRate::Hz16000);
        assert!(rp.is_ok());
    }

    /// @verifies C037-precondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn resample_pipeline_stores_rates() {
        let rp =
            ResamplePipeline::new(SampleRate::Hz48000, SampleRate::Hz16000).unwrap();
        assert_eq!(rp.in_rate(), SampleRate::Hz48000);
        assert_eq!(rp.out_rate(), SampleRate::Hz16000);
    }

    /// @verifies C037-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn resample_pipeline_interleave_l_in_r_out() {
        let in_mono = vec![1i16; 4];
        let out_mono = vec![2i16; 4];
        let stereo = ResamplePipeline::interleave_in_out(&in_mono, &out_mono);

        assert_eq!(stereo.len(), 8);
        for i in 0..4 {
            assert_eq!(stereo[2 * i], 1, "even index {}=IN input", 2 * i);
            assert_eq!(stereo[2 * i + 1], 2, "odd index {}=OUT input", 2 * i + 1);
        }
    }

    /// @verifies C037-invariant
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn resample_pipeline_interleave_identity_preserved() {
        let in_mono: Vec<i16> = (0..10).collect();
        let out_mono: Vec<i16> = (10..20).collect();
        let stereo = ResamplePipeline::interleave_in_out(&in_mono, &out_mono);

        assert_eq!(stereo.len(), 20);
        for i in 0..10 {
            assert_eq!(stereo[2 * i], i as i16, "even {}=IN", 2 * i);
            assert_eq!(stereo[2 * i + 1], (i + 10) as i16, "odd {}=OUT", 2 * i + 1);
        }
    }

    // -----------------------------------------------------------------------
    // ── C037-error: ResamplePipeline error cases ──────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C037-error
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn resample_pipeline_interleave_empty_inputs() {
        let stereo = ResamplePipeline::interleave_in_out(&[], &[]);
        assert!(stereo.is_empty());
    }

    /// @verifies C037-error
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn resample_pipeline_interleave_mismatched_lengths_truncates() {
        let in_mono = vec![1i16; 10];
        let out_mono = vec![2i16; 5]; // OUT is shorter
        let stereo = ResamplePipeline::interleave_in_out(&in_mono, &out_mono);

        // Should truncate to shorter length
        assert_eq!(stereo.len(), 10); // 5 * 2
        for i in 0..5 {
            assert_eq!(stereo[2 * i], 1);
            assert_eq!(stereo[2 * i + 1], 2);
        }
    }

    // -----------------------------------------------------------------------
    // ── C037-boundary: ResamplePipeline identity path ──────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C037-boundary
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn resample_pipeline_identity_rate_preserves_length() {
        let rp = ResamplePipeline::new(SampleRate::Hz48000, SampleRate::Hz48000).unwrap();
        let input = vec![0i16; 480];
        let output = rp.resample_mono(&input);
        // Identity: rate ratio is 1.0, output len = input len
        assert_eq!(output.len(), 480);
    }

    // -----------------------------------------------------------------------
    // ── C041-normal: NegotiatedCodec & CodecSelectionPolicy ───────────────
    // -----------------------------------------------------------------------

    // Note: NegotiatedCodec and CodecSelectionPolicy are defined in
    // codec_policy_fallback.rs. Tests for those types are colocated there.

    // -----------------------------------------------------------------------
    // ── C050-normal: PortDirection ────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C050-precondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn port_direction_variants_constructable() {
        let cap = PortDirection::Capture;
        let play = PortDirection::Playback;
        assert_ne!(cap, play);
        assert_eq!(format!("{:?}", PortDirection::Capture), "Capture");
        assert_eq!(format!("{:?}", PortDirection::Playback), "Playback");
    }

    /// @verifies C050-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn port_direction_derives_clone_copy_partial_eq_eq_hash() {
        let a = PortDirection::Capture;
        let b = a; // Copy
        assert_eq!(a, b);
        let mut set = std::collections::HashSet::new();
        set.insert(a);
        assert!(set.contains(&PortDirection::Capture));
    }
}
