// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.

// [::STUB::] P1-3: Example binaries document the API surface; full CLI/PJSIP runtime is deferred -- Implement full example binaries (account_register, audio_tap, client_init, make_call, tts_source) with PJSIP backend, CLI args, and integration tests
// [::TICKET::] P0-2, P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P8-2) --for-spec --no-implementation-order`.
use siprs::runtime::audio_worker::{AsyncAudioSource, MockAsyncAudioSource};

/// Audio tap (RFC §41.4): an `AsyncAudioSource` feeds the mixer; a mock source
/// stands in until a real device source is wired (cpal, P1-4).
#[tokio::main]
async fn main() {
    // A WAV-backed tap would wrap a file reader; the mock demonstrates the
    // `AsyncAudioSource::next_chunk` contract through the erased trait object.
    let mut source: Box<dyn AsyncAudioSource> =
        Box::new(MockAsyncAudioSource::new(vec![0i16; 160]));
    let mut buf = [0i16; 160];
    let written = source.next_chunk(&mut buf).await;
    let _ = written;
}
