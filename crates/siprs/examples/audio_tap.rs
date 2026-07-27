//! Example: Audio tap with lossless WAV export.
//!
//! This example demonstrates how to subscribe to an active call's audio stream
//! using `AudioTapMode::Lossless` for recording-quality capture. The audio
//! chunks are written to a WAV file.
//!
//! ## Microphone source (optional, behind `cpal-input` feature)
//!
//! When the `cpal-input` feature is enabled, the example additionally shows
//! how to open the default microphone as an audio source. Without the feature,
//! the microphone code path is excluded at compile time.
//!
//! Prerequisites:
//! - PJSIP development library installed on the system
//! - An active call (see make_call example)
//!
//! Run: `cargo run --example audio_tap`
//!
//! [::STUB::] P1-3: This example references types from future tickets
//! (SipClient, AudioFormat, AudioTapHandle, AudioTapMode, BitDepth,
//! ChannelLayout, SampleRate, AudioChunkPair, AsyncAudioSource, SipError).
//! It is gated behind the `spec-examples` feature in Cargo.toml — remove the
//! feature gate once all dependency types are implemented (P0-7/P0-8+).

// [::TICKET::] P1-3: Usage Examples & Code Samples
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec`

use siprs::{
    AudioFormat, AudioTapHandle, AudioTapMode, BitDepth, ChannelLayout, SampleRate, SipClient,
};

// ── Audio configuration constants ────────────────────────────────────────────

/// Sample rate for audio capture (16 kHz).
const SAMPLE_RATE: SampleRate = SampleRate::Hz16000;

/// Bit depth for audio samples.
const BIT_DEPTH: BitDepth = BitDepth::I16;

/// Channel layout: stereo input + stereo output.
const CHANNEL_LAYOUT: ChannelLayout = ChannelLayout::StereoInOut;

/// Audio frame duration in milliseconds.
const FRAME_MS: u32 = 20;

/// Tap buffer capacity in audio chunks.
const TAP_BUF_CAPACITY: usize = 512;

/// WAV output file path.
const WAV_OUTPUT_PATH: &str = "captured_audio.wav";

// ── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SipClient::new(Default::default()).await?;

    // This example assumes an active call with ID 1 (in production, obtain
    // the call_id from make_call or an incoming call event).
    let call_id = 1u32;

    // Subscribe to the call's audio stream with Lossless mode for recording
    let mut audio_tap: AudioTapHandle = client
        .subscribe_audio(
            call_id,
            AudioFormat {
                sample_rate: SAMPLE_RATE,
                bit_depth: BIT_DEPTH,
                channel_layout: CHANNEL_LAYOUT,
                frame_ms: FRAME_MS,
            },
            TAP_BUF_CAPACITY,
            AudioTapMode::Lossless,
        )
        .await?;

    println!("Audio tap active. Writing to {} ...", WAV_OUTPUT_PATH);

    // WAV writer setup (basic — real implementation uses hound or similar)
    let mut wav_data: Vec<i16> = Vec::new();

    // Collect audio chunks for a short duration
    let capture_duration = std::time::Duration::from_secs(5);
    let deadline = tokio::time::Instant::now() + capture_duration;

    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout_at(deadline, audio_tap.recv()).await {
            Ok(Some(pair)) => {
                // Convert stereo AudioChunkPair to interleaved i16 samples
                let stereo = pair_to_stereo_i16(pair);
                wav_data.extend_from_slice(&stereo);
            }
            Ok(None) => {
                println!("Audio stream ended.");
                break;
            }
            Err(_) => {
                // Timeout: capture duration expired
                break;
            }
        }
    }

    // Write captured audio to WAV (placeholder — real WAV header + hound crate)
    println!(
        "Captured {} i16 samples. WAV export requires the `hound` crate.",
        wav_data.len()
    );

    // If the cpal-input feature is enabled, demonstrate microphone source
    #[cfg(feature = "cpal-input")]
    {
        let _microphone_source = open_default_microphone_source(AudioFormat {
            sample_rate: SAMPLE_RATE,
            bit_depth: BIT_DEPTH,
            channel_layout: ChannelLayout::Mono,
            frame_ms: FRAME_MS,
        })
        .await?;
        println!("Microphone source opened successfully.");
    }

    Ok(())
}

// ── Helper: convert AudioChunkPair to interleaved i16 ────────────────────────

/// Converts a stereo `AudioChunkPair` into an interleaved `Vec<i16>`.
///
/// Returns an empty vec if the pair cannot be converted (e.g., mismatched
/// lengths or non-I16 format).
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
fn pair_to_stereo_i16(pair: siprs::AudioChunkPair) -> Vec<i16> {
    // [::STUB::] P0-8: Replace with actual AudioChunkPair conversion once N0030
    // (audio format model) is implemented.
    let _ = pair;
    Vec::new()
}

// ── Optional: microphone source (gated behind cpal-input) ────────────────────

/// Opens the default microphone as an `AsyncAudioSource`.
///
/// This function is only available when the `cpal-input` feature is enabled.
#[cfg(feature = "cpal-input")]
async fn open_default_microphone_source(
    format: AudioFormat,
) -> Result<Box<dyn siprs::AsyncAudioSource>, siprs::SipError> {
    // [::STUB::] N0050/P1-4: Replace with real cpal-based microphone implementation
    // once §40 Audio Device Policy is implemented.
    let _ = format;
    Err(siprs::SipError::not_implemented("cpal-input"))
}
