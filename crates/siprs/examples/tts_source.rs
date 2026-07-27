//! Example: AI TTS source insertion via AsyncAudioSource trait.
//!
//! This example demonstrates how to implement the `AsyncAudioSource` trait
//! for an external audio stream, such as a Text-To-Speech engine, and
//! inject it into an active call's audio mix.
//!
//! Prerequisites:
//! - PJSIP development library installed on the system
//! - An active call (see make_call example)
//! - An external TTS service producing `Vec<i16>` audio chunks
//!
//! Run: `cargo run --example tts_source`

// [::TICKET::] P1-3: Usage Examples & Code Samples
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec`

use siprs::{AsyncAudioSource, SipClient};

// ── Audio constants ──────────────────────────────────────────────────────────

/// Default audio source gain (60%).
const DEFAULT_GAIN: f32 = 0.6;

/// TTS audio chunk size in samples.
const CHUNK_SIZE: usize = 320;

// ── TTS source implementation ────────────────────────────────────────────────

/// An `AsyncAudioSource` that yields audio chunks from a TTS stream receiver.
///
/// In a real application, `rx` would receive audio data from an external TTS
/// engine via an MPSC channel or similar mechanism. This example uses a mock
/// channel to demonstrate the pattern.
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
struct TtsStreamSource {
    /// Receiver for TTS audio chunks (Vec<i16> samples).
    rx: tokio::sync::mpsc::Receiver<Vec<i16>>,
}

// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
impl AsyncAudioSource for TtsStreamSource {
    /// Fills `buf` with the next chunk of audio samples.
    ///
    /// Returns the number of samples written, or `0` to signal end of stream.
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
        match self.rx.recv().await {
            Some(chunk) => {
                let count = chunk.len().min(buf.len());
                buf[..count].copy_from_slice(&chunk[..count]);
                count
            }
            // Stream ended — return 0 to signal EOF
            None => 0,
        }
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SipClient::new(Default::default()).await?;

    // Create a channel for TTS audio data (in production, feed from TTS engine)
    let (tts_tx, tts_rx) = tokio::sync::mpsc::channel::<Vec<i16>>(CHUNK_SIZE);

    // Create the async audio source and register it with the call
    let tts_source = TtsStreamSource { rx: tts_rx };
    let call_id = 1u32; // Replace with real call ID in production

    let source_id = client
        .add_audio_source(call_id, Box::new(tts_source))
        .await?;

    println!("TTS source added with ID: {:?}", source_id);

    // Set the audio source gain (volume level)
    client
        .set_audio_source_gain(call_id, source_id, DEFAULT_GAIN)
        .await?;

    println!(
        "TTS source gain set to {}. Feed audio via the channel.",
        DEFAULT_GAIN
    );

    // Example: push a short silence chunk (in production, push TTS audio data)
    let silence_chunk = vec![0i16; CHUNK_SIZE];
    if tts_tx.send(silence_chunk).await.is_ok() {
        println!("Sent one audio chunk to TTS source.");
    }

    // Allow audio to play briefly
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    println!("TTS example complete.");
    Ok(())
}
