

// Audio tap (RFC §41.4): subscribe to a call's audio and stream AudioChunkPair
// frames. The subscribe_audio -> AudioTapHandle::recv segment is deferred to
// P9-2 (Audio Subscribe API); until then this example demonstrates the
// AsyncAudioSource contract with an injected source so it runs headless.
//
// Run: cargo run --example audio_tap -- --host sip.example.com [--call-id 1]

#[path = "common/cli.rs"]
mod cli;
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.

use std::io::Write;
// [::TICKET::] P9-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-1 --for-spec --no-implementation-order`.

use siprs::runtime::audio_worker::{AsyncAudioSource, MockAsyncAudioSource};
use siprs::SipClient;

use cli::build_client_config;

/// Number of PCM samples in one 20ms frame at 8kHz mono.
const FRAME_SAMPLES: usize = 160;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = cli::parse(std::env::args().skip(1))?;
    let config = build_client_config(&args);
    let (client, _events) = SipClient::new(config).await?;

// [::STUB::] P9-2: P9-2 blocked: SipClient::subscribe_audio and AudioTapHandle do not exist in the public API (src/api/audio_subscribe_bp.rs carries the [::STUB::] P9-2 marker, RFC 22 N0031) -- Implement SipClient::subscribe_audio(call_id, AudioFormat, capacity, AudioTapMode) -> AudioTapHandle with recv() -> Option<AudioChunkPair>, then replace the injected-source demo with a real tap and remove the spec-examples gate
    // subscribe_audio -> AudioTapHandle::recv -> AudioChunkPair is deferred to
    // P9-2 (Audio Subscribe API, RFC §22 N0031). This demo reads an injected
    // source so the example runs headless until subscribe_audio lands.
    let mut source: Box<dyn AsyncAudioSource> =
        Box::new(MockAsyncAudioSource::new(vec![0i16; FRAME_SAMPLES]));
    let mut frame = [0i16; FRAME_SAMPLES];
    let written = source.next_chunk(&mut frame).await;
    writeln!(
        std::io::stdout(),
        "audio tap: read {written} samples from injected source (subscribe_audio pending P9-2)"
    )?;

    client.shutdown().await?;
    Ok(())
}
