// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::STUB::] P1-3: Example binaries document the API surface; full CLI/PJSIP runtime is deferred -- Implement full example binaries (account_register, audio_tap, client_init, make_call, tts_source) with PJSIP backend, CLI args, and integration tests
// [::TICKET::] P0-2, P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P8-2) --for-spec --no-implementation-order`.
use siprs::model::audio_format_chunkpair::{AudioFormat, BitDepth, ChannelLayout, SampleRate};
use siprs::runtime::audio_worker::{AsyncAudioSource, MockAsyncAudioSource};

/// A TTS engine implements `AsyncAudioSource` at the requested `AudioFormat`;
/// the format describes the expected PCM delivery (RFC §41.5).
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
fn _assert_tts_source<S: AsyncAudioSource>() {}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let format = AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 20)?;
    // A real TTS source would stream synthesized speech into `next_chunk`; the
    // mock satisfies the `AsyncAudioSource` contract for demonstration.
    _assert_tts_source::<MockAsyncAudioSource>();
    let _ = format;
    Ok(())
}
