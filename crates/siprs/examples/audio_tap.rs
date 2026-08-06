

// [::TICKET::] P9-1, P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-1|P9-2) --for-spec --no-implementation-order`.

// Audio tap (RFC §41.4 / §22): subscribe to a call's audio and stream
// AudioChunkPair frames. With a live call and the backend media path attached,
// `recv()` yields each paired IN/OUT frame; without a call the reactor reports
// the unknown call, which the example prints and exits cleanly.
//
// Run: cargo run --example audio_tap -- --host sip.example.com [--call-id 1]

#[path = "common/cli.rs"]
mod cli;
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.

use std::io::Write;
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.

use siprs::model::{AudioFormat, BitDepth, CallId, ChannelLayout, SampleRate};
use siprs::{AudioTapMode, SipClient};

use cli::build_client_config;

/// Tap channel capacity in frames (16 × 20 ms ≈ 320 ms of buffered audio).
const TAP_CAPACITY: usize = 16;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    let args = cli::parse(std::env::args().skip(1))?;
    let config = build_client_config(&args);
    let (client, _events) = SipClient::new(config).await?;

    // Subscribe to the call's paired IN/OUT audio and stream AudioChunkPair
    // frames. The tap handle stays open while the call is active.
    let call_id = CallId::from_u64(args.call_id.unwrap_or(1))?;
    let format = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 20)?;
    match client
        .subscribe_audio(call_id, format, TAP_CAPACITY, AudioTapMode::Realtime)
        .await
    {
        Ok(mut tap) => {
            while let Some(pair) = tap.recv().await {
                writeln!(
                    std::io::stdout(),
                    "audio tap: call {} in_samples={} out_samples={}",
                    pair.call_id,
                    pair.in_chunk.len(),
                    pair.out_chunk.len()
                )?;
            }
            writeln!(std::io::stdout(), "audio tap: producer closed")?;
        }
        Err(e) => {
            writeln!(std::io::stdout(), "audio tap: subscribe_audio failed: {e}")?;
        }
    }

    client.shutdown().await?;
    Ok(())
}
