
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

impl std::fmt::Display for AudioFormatError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidFrameMs(ms) => write!(
                f,
                "invalid frame duration: {ms} ms (must be 10, 20, 40, or 60)"
            ),
        }
    }
}

impl std::error::Error for AudioFormatError {}

// ---------------------------------------------------------------------------
// AudioChunk
// ---------------------------------------------------------------------------

/// A single chunk of audio data in either I16 or F32 format.
#[derive(Debug, Clone, PartialEq)]
pub enum AudioChunk {
    /// Signed 16-bit PCM samples.
    I16(Vec<i16>),
    /// Float 32-bit PCM samples.
    F32(Vec<f32>),
}

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
#[derive(Debug, Clone, PartialEq)]
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

impl AudioChunkPair {
    /// Build a paired IN/OUT chunk from a processed stereo-interleaved frame.
    ///
    /// §62.6 media-path tap push: `ProcessedFrame.stereo_interleaved` is
    /// `[L0, R0, L1, R1, ...]` with `L = IN` (received) and `R = OUT` (sent).
    /// This splits it into the tap's mono `in_chunk` / `out_chunk` so
    /// `subscribe_audio` consumers observe the real media flow.
    pub fn from_processed_frame(
        call_id: CallId,
        account_id: AccountId,
        frame: &crate::audio::pipeline::ProcessedFrame,
    ) -> Self {
        let (in_samples, out_samples) =
            crate::audio::media_path_arch::split_stereo_interleaved(&frame.stereo_interleaved);
        Self {
            call_id,
            account_id,
            timestamp: SystemTime::now(),
            in_chunk: AudioChunk::I16(in_samples),
            out_chunk: AudioChunk::I16(out_samples),
        }
    }
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/// Validate that `frame_ms` is one of the allowed values.
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

    #[test]
    fn audio_format_constructs_with_valid_fields() {
        let fmt = AudioFormat::new(SampleRate::Hz16000, BitDepth::I16, ChannelLayout::Mono, 20);
        assert!(fmt.is_ok());
        let fmt = fmt.unwrap();
        assert_eq!(fmt.sample_rate, SampleRate::Hz16000);
        assert_eq!(fmt.bit_depth, BitDepth::I16);
        assert_eq!(fmt.channel_layout, ChannelLayout::Mono);
        assert_eq!(fmt.frame_ms, 20);
    }

    #[test]
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

    #[test]
    fn audio_format_all_valid_frame_ms_values() {
        for ms in &[10, 20, 40, 60] {
            let fmt = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, *ms);
            assert!(fmt.is_ok(), "Failed for frame_ms={ms}");
            assert_eq!(fmt.unwrap().frame_ms, *ms);
        }
    }

    #[test]
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

    #[test]
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

    #[test]
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

    #[test]
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

    // ── P15-7: from_processed_frame (tap push conversion, §62.6) ─────────

    /// from_processed_frame splits stereo [L,R,L,R,...] into IN=left / OUT=right.
    #[test]
    fn from_processed_frame_splits_lr_into_in_out() {
        let frame = crate::audio::pipeline::ProcessedFrame {
            stereo_interleaved: vec![1i16, 2, 3, 4],
            negotiated_codec: crate::config::codec_policy_fallback::NegotiatedCodec::Pcmu,
            timestamp: std::time::Instant::now(),
        };
        let pair = AudioChunkPair::from_processed_frame(
            CallId::from_u64(1).unwrap(),
            AccountId::from_u64(1).unwrap(),
            &frame,
        );
        assert_eq!(pair.in_chunk, AudioChunk::I16(vec![1, 3]));
        assert_eq!(pair.out_chunk, AudioChunk::I16(vec![2, 4]));
    }

    /// from_processed_frame preserves the call/account context.
    #[test]
    fn from_processed_frame_preserves_call_and_account() {
        let frame = crate::audio::pipeline::ProcessedFrame {
            stereo_interleaved: vec![5i16, 6],
            negotiated_codec: crate::config::codec_policy_fallback::NegotiatedCodec::Pcmu,
            timestamp: std::time::Instant::now(),
        };
        let pair = AudioChunkPair::from_processed_frame(
            CallId::from_u64(9).unwrap(),
            AccountId::from_u64(4).unwrap(),
            &frame,
        );
        assert_eq!(pair.call_id, CallId::from_u64(9).unwrap());
        assert_eq!(pair.account_id, AccountId::from_u64(4).unwrap());
    }

    /// from_processed_frame handles an empty stereo frame.
    #[test]
    fn from_processed_frame_empty_stereo_yields_empty_chunks() {
        let frame = crate::audio::pipeline::ProcessedFrame {
            stereo_interleaved: vec![],
            negotiated_codec: crate::config::codec_policy_fallback::NegotiatedCodec::Pcmu,
            timestamp: std::time::Instant::now(),
        };
        let pair = AudioChunkPair::from_processed_frame(
            CallId::from_u64(1).unwrap(),
            AccountId::from_u64(1).unwrap(),
            &frame,
        );
        assert_eq!(pair.in_chunk, AudioChunk::I16(vec![]));
        assert_eq!(pair.out_chunk, AudioChunk::I16(vec![]));
    }

    // ── Normal: trait derives ───────────────────────────────────────────

    #[test]
    fn sample_rate_derives_required_traits() {
        fn assert_traits<T: Debug + Clone + Copy + PartialEq + Eq>() {}
        assert_traits::<SampleRate>();
    }

    #[test]
    fn bit_depth_derives_required_traits() {
        fn assert_traits<T: Debug + Clone + Copy + PartialEq>() {}
        assert_traits::<BitDepth>();
    }

    #[test]
    fn channel_layout_derives_required_traits() {
        fn assert_traits<T: Debug + Clone + Copy + PartialEq + Eq>() {}
        assert_traits::<ChannelLayout>();
    }

    #[test]
    fn audio_format_derives_required_traits() {
        fn assert_traits<T: Debug + Clone + Copy + PartialEq>() {}
        assert_traits::<AudioFormat>();
    }

    #[test]
    fn audio_chunk_pair_derives_clone_debug() {
        fn assert_cd<T: Clone + Debug>() {}
        assert_cd::<AudioChunkPair>();
    }

    #[test]
    fn audio_format_error_derives_required_traits() {
        fn assert_traits<T: Debug + Clone + Copy + PartialEq + Eq>() {}
        assert_traits::<AudioFormatError>();
    }

    // ── Error cases ─────────────────────────────────────────────────────

    #[test]
    fn audio_format_rejects_frame_ms_zero() {
        let result = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 0);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), AudioFormatError::InvalidFrameMs(0));
    }

    #[test]
    fn audio_format_rejects_frame_ms_above_max() {
        let result = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 70);
        assert!(result.is_err());
    }

    #[test]
    fn audio_format_rejects_frame_ms_not_divisible_by_10() {
        let result = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 17);
        assert!(result.is_err());
    }

    #[test]
    fn audio_format_rejects_frame_ms_30() {
        // 30 is a multiple of 10 but not in the allowed set
        let result = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 30);
        assert!(result.is_err());
    }

    #[test]
    fn audio_format_error_displays_invalid_value() {
        let err = AudioFormatError::InvalidFrameMs(99);
        assert!(format!("{err:?}").contains("99"));
    }

    // ── Boundary cases ─────────────────────────────────────────────────

    #[test]
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
    fn audio_chunk_empty_i16() {
        let chunk = AudioChunk::I16(vec![]);
        assert!(chunk.is_empty());
        assert_eq!(chunk.len(), 0);
    }

    #[test]
    fn audio_chunk_empty_f32() {
        let chunk = AudioChunk::F32(vec![]);
        assert!(chunk.is_empty());
        assert_eq!(chunk.len(), 0);
    }

    // ── SampleRate::as_hz ───────────────────────────────────────────────

    #[test]
    fn sample_rate_as_hz_returns_numerical_value() {
        assert_eq!(SampleRate::Hz8000.as_hz(), 8_000);
        assert_eq!(SampleRate::Hz16000.as_hz(), 16_000);
        assert_eq!(SampleRate::Hz24000.as_hz(), 24_000);
        assert_eq!(SampleRate::Hz48000.as_hz(), 48_000);
    }

    // ── AudioFormat::samples_per_frame ──────────────────────────────────

    #[test]
    fn audio_format_samples_per_frame_80_for_8khz_10ms() {
        let fmt =
            AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 10).unwrap();
        assert_eq!(fmt.samples_per_frame(), 80);
    }

    #[test]
    fn audio_format_samples_per_frame_960_for_48khz_20ms() {
        let fmt =
            AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 20).unwrap();
        assert_eq!(fmt.samples_per_frame(), 960);
    }

    // ── AudioChunkPair clone ────────────────────────────────────────────

    #[test]
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
        match (&cloned.in_chunk, &cloned.out_chunk) {
            (AudioChunk::I16(in_data), AudioChunk::F32(out_data)) => {
                assert_eq!(in_data.len(), 160);
                assert_eq!(out_data.len(), 160);
            }
            _ => panic!("variant mismatch on clone"),
        }
    }
}
