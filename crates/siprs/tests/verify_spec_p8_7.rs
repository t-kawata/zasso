// [::TICKET::] P8-7: cpal-input device capture — feature-gated integration test.
//
// This integration test verifies the RFC §40 microphone-source contract (C051):
//
//   C051-Post: with a default input device present, open_default_microphone_source
//   returns Ok(Box<dyn AsyncAudioSource>) whose next_chunk fills an i16 buffer with
//   at least one captured PCM frame.
//
// The device test is #[ignore] by default because CI hosts rarely expose a real
// input device. Run it on a machine with a microphone:
//
//   cargo test --features cpal-input --test verify_spec_p8_7 -- --ignored
//
// and set SI_PRS_TEST_AUDIO=1 to actually exercise the device (the env gate keeps
// accidental --ignored runs on CI hosts from failing spuriously).
//
// The default build (feature off) compiles with no cpal crate — verified by
// `cargo tree -e normal` showing no cpal — and this file is an empty crate then.
//
// See specs/P8-7.md §Contracts C051 for the contract mapping.

#![cfg(feature = "cpal-input")]

use siprs::api::asyncaudiosrc_adapter::open_default_microphone_source;
use siprs::model::audio_format_chunkpair::{AudioFormat, BitDepth, ChannelLayout, SampleRate};
use siprs::runtime::audio_worker::AsyncAudioSource;

/// C051-Post — opens the platform default microphone and captures at least one
/// PCM frame into the i16 buffer the AsyncAudioSource contract requires.
///
/// A 48 kHz / 20 ms mono frame is 960 samples; we assert the device produced at
/// least one sample, not specific sample values (which depend on physical input).
#[tokio::test]
#[ignore = "requires audio hardware; set SI_PRS_TEST_AUDIO=1 and run with --ignored"]
async fn opens_default_microphone_and_captures_a_frame() -> Result<(), &'static str> {
    if std::env::var_os("SI_PRS_TEST_AUDIO").is_none() {
        // Skipped unless explicitly forced with the environment variable;
        // see the #[ignore] reason. Returning Ok keeps --ignored runs from
        // failing on CI hosts that lack audio hardware.
        return Ok(());
    }

    let format = AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 20)
        .map_err(|_| "48000/I16/Mono/20ms is a valid AudioFormat")?;
    let mut source = open_default_microphone_source(format)
        .await
        .map_err(|_| "open_default_microphone_source must succeed on a host with a default input device")?;

    let mut buf = [0i16; 960];
    // Fully-qualified on the deref: Box<dyn AsyncAudioSource> has no blanket
    // AsyncAudioSource impl, so we must call through `dyn AsyncAudioSource`.
    let written = AsyncAudioSource::next_chunk(&mut *source, &mut buf).await;
    assert!(written > 0, "captured at least one PCM frame");
    Ok(())
}
