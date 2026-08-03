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

use std::time::SystemTime;

use crate::model::AccountId;
use crate::model::CallId;

// ---------------------------------------------------------------------------
// Constants — valid frame durations in milliseconds
// ---------------------------------------------------------------------------

/// Minimum valid frame duration (10ms = 80 samples at 8kHz, 480 samples at 48kHz).
pub const MIN_FRAME_MS: u16 = 10;

/// Maximum valid frame duration (60ms = 480 samples at 8kHz, 2880 samples at 48kHz).
pub const MAX_FRAME_MS: u16 = 60;

// ---------------------------------------------------------------------------
// SampleRate
// ---------------------------------------------------------------------------

/// Supported audio sample rates.
///
/// Only rates required by the SIP audio pipeline are included.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SampleRate {
    /// 8 000 Hz — narrowband telephony
    Hz8000,
    /// 16 000 Hz — wideband
    Hz16000,
    /// 24 000 Hz — super-wideband
    Hz24000,
    /// 48 000 Hz — fullband (Opus native)
    Hz48000,
}

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
impl SampleRate {
    /// Return the numerical value in Hz.
    #[must_use]
    pub fn as_hz(&self) -> u32 {
        match self {
            Self::Hz8000 => 8_000,
            Self::Hz16000 => 16_000,
            Self::Hz24000 => 24_000,
            Self::Hz48000 => 48_000,
        }
    }
}

// ---------------------------------------------------------------------------
// BitDepth
// ---------------------------------------------------------------------------

/// Supported audio bit depths.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BitDepth {
    /// Signed 16-bit integer PCM.
    I16,
    /// 32-bit floating-point PCM.
    F32,
}

// ---------------------------------------------------------------------------
// ChannelLayout
// ---------------------------------------------------------------------------

/// Channel configuration for audio streams.
///
/// `StereoInOut` maps L = input (IN) and R = output (OUT) for duplex
/// communication use cases.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelLayout {
    /// Single-channel mono.
    Mono,
    /// Two-channel stereo where L = IN, R = OUT.
    StereoInOut,
}

// ---------------------------------------------------------------------------
// AudioFormat
// ---------------------------------------------------------------------------

/// Describes the format of an audio stream.
///
/// Combines sample rate, bit depth, channel layout, and frame duration.
/// Construction validates that `frame_ms` is one of {10, 20, 40, 60}.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AudioFormat {
    pub sample_rate: SampleRate,
    pub bit_depth: BitDepth,
    pub channel_layout: ChannelLayout,
    pub frame_ms: u16,
}

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
impl AudioFormat {
    /// Create a new `AudioFormat` with validation.
    ///
    /// Returns `Err` if `frame_ms` is not in {10, 20, 40, 60}.
    pub fn new(
        sample_rate: SampleRate,
        bit_depth: BitDepth,
        channel_layout: ChannelLayout,
        frame_ms: u16,
    ) -> Result<Self, AudioFormatError> {
        validate_frame_ms(frame_ms)?;
        Ok(Self {
            sample_rate,
            bit_depth,
            channel_layout,
            frame_ms,
        })
    }

    /// Return the sample rate in Hz.
    #[must_use]
    pub fn sample_rate_hz(&self) -> u32 {
        self.sample_rate.as_hz()
    }

    /// Return the number of samples per frame for this format.
    ///
    /// Calculated as `sample_rate * frame_ms / 1000`.
    #[must_use]
    pub fn samples_per_frame(&self) -> usize {
        (self.sample_rate_hz() as usize * self.frame_ms as usize) / 1000
    }
}

// ---------------------------------------------------------------------------
// AudioFormatError
// ---------------------------------------------------------------------------

/// Errors that can occur when constructing an `AudioFormat`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioFormatError {
    /// The frame duration is not in {10, 20, 40, 60} ms.
    InvalidFrameMs(u16),
}

// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
impl std::fmt::Display for AudioFormatError {
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidFrameMs(ms) => write!(
                f,
                "invalid frame duration: {ms} ms (must be 10, 20, 40, or 60)"
            ),
        }
    }
}

// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
impl std::error::Error for AudioFormatError {}

// ---------------------------------------------------------------------------
// AudioChunk
// ---------------------------------------------------------------------------

/// A single chunk of audio data in either I16 or F32 format.
#[derive(Debug, Clone)]
pub enum AudioChunk {
    /// Signed 16-bit PCM samples.
    I16(Vec<i16>),
    /// Float 32-bit PCM samples.
    F32(Vec<f32>),
}

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
impl AudioChunk {
    /// Return the number of samples in this chunk.
    #[must_use]
    pub fn len(&self) -> usize {
        match self {
            Self::I16(data) => data.len(),
            Self::F32(data) => data.len(),
        }
    }

    /// Return `true` if the chunk contains no samples.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

// ---------------------------------------------------------------------------
// AudioChunkPair
// ---------------------------------------------------------------------------

/// A paired IN (received from network) and OUT (sent to network) audio chunk.
///
/// Both IN and OUT share a single `timestamp` field, guaranteeing that they
/// are always paired at the same time offset (C031 invariant).
#[derive(Debug, Clone)]
pub struct AudioChunkPair {
    /// The call this pair belongs to.
    pub call_id: CallId,
    /// The account this pair belongs to.
    pub account_id: AccountId,
    /// Wall-clock timestamp of the paired data — shared by IN and OUT.
    pub timestamp: SystemTime,
    /// Audio data received from the remote party (network → local).
    pub in_chunk: AudioChunk,
    /// Audio data to be sent to the remote party (local → network).
    pub out_chunk: AudioChunk,
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/// Validate that `frame_ms` is one of the allowed values.
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
fn validate_frame_ms(frame_ms: u16) -> Result<(), AudioFormatError> {
    match frame_ms {
        10 | 20 | 40 | 60 => Ok(()),
        _ => Err(AudioFormatError::InvalidFrameMs(frame_ms)),
    }
}

// ===========================================================================
// Tests — TDD Red: failing → Green: passing
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fmt::Debug;

    // ── C031-Pre: AudioFormat construction ───────────────────────────────

    /// @verifies C031
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_constructs_with_valid_fields() {
        let fmt = AudioFormat::new(SampleRate::Hz16000, BitDepth::I16, ChannelLayout::Mono, 20);
        assert!(fmt.is_ok());
        let fmt = fmt.unwrap();
        assert_eq!(fmt.sample_rate, SampleRate::Hz16000);
        assert_eq!(fmt.bit_depth, BitDepth::I16);
        assert_eq!(fmt.channel_layout, ChannelLayout::Mono);
        assert_eq!(fmt.frame_ms, 20);
    }

    /// @verifies C031
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_all_sample_rates_construct() {
        for rate in &[
            SampleRate::Hz8000,
            SampleRate::Hz16000,
            SampleRate::Hz24000,
            SampleRate::Hz48000,
        ] {
            let fmt = AudioFormat::new(*rate, BitDepth::F32, ChannelLayout::StereoInOut, 20);
            assert!(fmt.is_ok(), "Failed for rate {rate:?}");
            assert_eq!(fmt.unwrap().sample_rate_hz(), rate.as_hz());
        }
    }

    /// @verifies C031
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_all_valid_frame_ms_values() {
        for ms in &[10, 20, 40, 60] {
            let fmt = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, *ms);
            assert!(fmt.is_ok(), "Failed for frame_ms={ms}");
            assert_eq!(fmt.unwrap().frame_ms, *ms);
        }
    }

    /// @verifies C031
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_single_combination_is_copy() {
        let fmt = AudioFormat::new(
            SampleRate::Hz48000,
            BitDepth::F32,
            ChannelLayout::StereoInOut,
            10,
        )
        .unwrap();
        let copied = fmt; // Copy, not move
        assert_eq!(fmt, copied);
    }

    // ── C031-Post: AudioChunk data access ────────────────────────────────

    /// @verifies C031
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_chunk_i16_wraps_data() {
        let data = vec![0i16; 160];
        let chunk = AudioChunk::I16(data.clone());
        match &chunk {
            AudioChunk::I16(d) => {
                assert_eq!(d.len(), 160);
                assert!(!d.is_empty());
            }
            _ => panic!("expected I16 variant"),
        }
    }

    /// @verifies C031
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_chunk_f32_wraps_data() {
        let data = vec![0.0f32; 160];
        let chunk = AudioChunk::F32(data.clone());
        match &chunk {
            AudioChunk::F32(d) => {
                assert_eq!(d.len(), 160);
                assert!(!d.is_empty());
            }
            _ => panic!("expected F32 variant"),
        }
    }

    // ── C031-Inv: AudioChunkPair single timestamp ────────────────────────

    /// @verifies C031
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_chunk_pair_shares_single_timestamp() {
        let ts = SystemTime::now();
        let pair = AudioChunkPair {
            call_id: CallId::from_u64(1).unwrap(),
            account_id: AccountId::from_u64(1).unwrap(),
            timestamp: ts,
            in_chunk: AudioChunk::I16(vec![0; 160]),
            out_chunk: AudioChunk::I16(vec![1; 160]),
        };
        assert_eq!(pair.timestamp, ts);
        assert_eq!(pair.call_id, CallId::from_u64(1).unwrap());
        assert_eq!(pair.account_id, AccountId::from_u64(1).unwrap());
        assert!(!pair.in_chunk.is_empty());
        assert!(!pair.out_chunk.is_empty());
    }

    // ── Normal: trait derives ───────────────────────────────────────────

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn sample_rate_derives_required_traits() {
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Debug + Clone + Copy + PartialEq + Eq>() {}
        assert_traits::<SampleRate>();
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn bit_depth_derives_required_traits() {
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Debug + Clone + Copy + PartialEq>() {}
        assert_traits::<BitDepth>();
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn channel_layout_derives_required_traits() {
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Debug + Clone + Copy + PartialEq + Eq>() {}
        assert_traits::<ChannelLayout>();
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_derives_required_traits() {
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Debug + Clone + Copy + PartialEq>() {}
        assert_traits::<AudioFormat>();
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_chunk_pair_derives_clone_debug() {
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_cd<T: Clone + Debug>() {}
        assert_cd::<AudioChunkPair>();
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_error_derives_required_traits() {
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Debug + Clone + Copy + PartialEq + Eq>() {}
        assert_traits::<AudioFormatError>();
    }

    // ── Error cases ─────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_rejects_frame_ms_zero() {
        let result = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 0);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), AudioFormatError::InvalidFrameMs(0));
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_rejects_frame_ms_above_max() {
        let result = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 70);
        assert!(result.is_err());
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_rejects_frame_ms_not_divisible_by_10() {
        let result = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 17);
        assert!(result.is_err());
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_rejects_frame_ms_30() {
        // 30 is a multiple of 10 but not in the allowed set
        let result = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 30);
        assert!(result.is_err());
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_error_displays_invalid_value() {
        let err = AudioFormatError::InvalidFrameMs(99);
        assert!(format!("{err:?}").contains("99"));
    }

    // ── Boundary cases ─────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_frame_ms_min_boundary() {
        let fmt = AudioFormat::new(
            SampleRate::Hz48000,
            BitDepth::I16,
            ChannelLayout::Mono,
            MIN_FRAME_MS,
        );
        assert!(fmt.is_ok());
        assert_eq!(fmt.unwrap().frame_ms, 10);
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_frame_ms_max_boundary() {
        let fmt = AudioFormat::new(
            SampleRate::Hz8000,
            BitDepth::F32,
            ChannelLayout::StereoInOut,
            MAX_FRAME_MS,
        );
        assert!(fmt.is_ok());
        assert_eq!(fmt.unwrap().frame_ms, 60);
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_chunk_empty_i16() {
        let chunk = AudioChunk::I16(vec![]);
        assert!(chunk.is_empty());
        assert_eq!(chunk.len(), 0);
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_chunk_empty_f32() {
        let chunk = AudioChunk::F32(vec![]);
        assert!(chunk.is_empty());
        assert_eq!(chunk.len(), 0);
    }

    // ── SampleRate::as_hz ───────────────────────────────────────────────

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn sample_rate_as_hz_returns_numerical_value() {
        assert_eq!(SampleRate::Hz8000.as_hz(), 8_000);
        assert_eq!(SampleRate::Hz16000.as_hz(), 16_000);
        assert_eq!(SampleRate::Hz24000.as_hz(), 24_000);
        assert_eq!(SampleRate::Hz48000.as_hz(), 48_000);
    }

    // ── AudioFormat::samples_per_frame ──────────────────────────────────

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_samples_per_frame_80_for_8khz_10ms() {
        let fmt =
            AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 10).unwrap();
        assert_eq!(fmt.samples_per_frame(), 80);
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_format_samples_per_frame_960_for_48khz_20ms() {
        let fmt =
            AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 20).unwrap();
        assert_eq!(fmt.samples_per_frame(), 960);
    }

    // ── AudioChunkPair clone ────────────────────────────────────────────

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn audio_chunk_pair_clone_preserves_all_fields() {
        let pair = AudioChunkPair {
            call_id: CallId::from_u64(1).unwrap(),
            account_id: AccountId::from_u64(1).unwrap(),
            timestamp: SystemTime::now(),
            in_chunk: AudioChunk::I16(vec![10; 160]),
            out_chunk: AudioChunk::F32(vec![0.5; 160]),
        };
        let cloned = pair.clone();
        assert_eq!(cloned.call_id, pair.call_id);
        assert_eq!(cloned.account_id, pair.account_id);
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        match (&cloned.in_chunk, &cloned.out_chunk) {
            (AudioChunk::I16(in_data), AudioChunk::F32(out_data)) => {
                assert_eq!(in_data.len(), 160);
                assert_eq!(out_data.len(), 160);
            }
            _ => panic!("variant mismatch on clone"),
        }
    }
}
