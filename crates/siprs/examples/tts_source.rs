// AI TTS source injection (RFC §41.5): implement a TtsStreamSource that yields
// PCM frames from an mpsc channel, add it to the client's audio mixer, and set
// its gain.
//
// Run: cargo run --example tts_source -- --host sip.example.com [--gain 0.6]

#[path = "common/cli.rs"]
mod cli;

use std::io::Write;

use siprs::runtime::audio_worker::AsyncAudioSource;
use siprs::SipClient;

use cli::build_client_config;

/// Default gain applied to the injected source (RFC §41.5 uses 0.6).
const DEFAULT_GAIN: f32 = 0.6;

/// Channel capacity for queued TTS PCM frames (holds a small burst of 20ms
/// frames without blocking the feeding side).
const FRAME_QUEUE_CAPACITY: usize = 8;

/// One 20ms frame of PCM at 8kHz mono (matches MIXER_FRAME_SAMPLES).
const DEMO_FRAME_SAMPLES: usize = 160;

/// An `AsyncAudioSource` that streams PCM frames received on an mpsc channel.
///
/// A TTS engine feeds synthesized speech into `tx`; the audio mixer pulls it
/// out via `next_chunk`. Returns `0` (end-of-stream) when the channel closes.
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
struct TtsStreamSource {
    rx: tokio::sync::mpsc::Receiver<Vec<i16>>,
}

#[async_trait::async_trait]
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.
impl AsyncAudioSource for TtsStreamSource {
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
        match self.rx.recv().await {
            Some(chunk) => {
                let written = chunk.len().min(buf.len());
                buf[..written].copy_from_slice(&chunk[..written]);
                written
            }
            None => 0,
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = cli::parse(std::env::args().skip(1))?;
    let config = build_client_config(&args);
    let (client, _events) = SipClient::new(config).await?;

    let (tx, rx) = tokio::sync::mpsc::channel::<Vec<i16>>(FRAME_QUEUE_CAPACITY);
    let source_id = client
        .handle()
        .submit_add_audio_source(Box::new(TtsStreamSource { rx }))
        .await?;
    let gain = args.gain.unwrap_or(DEFAULT_GAIN);
    client
        .handle()
        .submit_set_audio_source_gain(source_id, gain)
        .await?;

    // Feed one demo frame so the source has data to deliver to the mixer, then
    // close the channel to mark end-of-stream.
    tx.send(vec![0i16; DEMO_FRAME_SAMPLES]).await?;
    drop(tx);

    writeln!(
        std::io::stdout(),
        "tts source added: source_id={source_id} gain={gain}"
    )?;
    client.shutdown().await?;
    Ok(())
}
