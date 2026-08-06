// [::TICKET::] P9-2: Layer 5 integration tests for the Audio Subscribe API.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
//
// These tests verify the RFC §22 (N0031) Audio Subscribe API and the §22.1
// Realtime/Lossless backpressure policy against the public API surface and a
// synthetic producer (contracts C032, C033).

use std::time::SystemTime;

use siprs::api::asyncaudiosrc_adapter::ErasedAudioSource;
use siprs::api::audio_subscribe_bp::{tap_channel, AudioTapHandle, AudioTapMode};
use siprs::model::id_design_newtype::IdError;
use siprs::model::{
    AccountId, AudioChunk, AudioChunkPair, AudioFormat, AudioFormatError, BitDepth, CallId,
    ChannelLayout, SampleRate,
};
use siprs::runtime::audio_worker::{AsyncAudioSource, MockAsyncAudioSource};
use siprs::{ClientConfig, SipClient, SipErrorKind};

/// Build a valid client config for the headless reactor.
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
fn client_config() -> ClientConfig {
    ClientConfig::builder()
        .sip_proxy_host("sip.example.com")
        .sip_proxy_port(5060)
        .build()
}

/// 20 ms mono 8 kHz I16 audio format used across the tests.
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
fn format_8k() -> Result<AudioFormat, AudioFormatError> {
    AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 20)
}

/// A synthetic `AudioChunkPair` whose in/out samples encode `seed`.
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
fn synthetic_pair(seed: u16) -> Result<AudioChunkPair, IdError> {
    Ok(AudioChunkPair {
        call_id: CallId::from_u64(1)?,
        account_id: AccountId::from_u64(1)?,
        timestamp: SystemTime::now(),
        in_chunk: AudioChunk::I16(vec![seed as i16; 160]),
        out_chunk: AudioChunk::I16(vec![(seed + 1) as i16; 160]),
    })
}

// ── C032: Audio Subscribe API & backpressure policy (RFC §22.1) ─────────

#[tokio::test]
// @verifies C032
async fn subscribe_audio_rejects_zero_capacity() -> Result<(), Box<dyn std::error::Error>> {
    let (client, _events) = SipClient::new(client_config()).await?;
    let call_id = CallId::from_u64(1)?;
    let err = client
        .subscribe_audio(call_id, format_8k()?, 0, AudioTapMode::Realtime)
        .await
        .expect_err("capacity == 0 must be rejected");
    assert_eq!(err.kind, SipErrorKind::InvalidConfig);
    Ok(())
}

#[tokio::test]
// @verifies C032
async fn subscribe_audio_rejects_unknown_call() -> Result<(), Box<dyn std::error::Error>> {
    let (client, _events) = SipClient::new(client_config()).await?;
    let call_id = CallId::from_u64(99)?;
    let err = client
        .subscribe_audio(call_id, format_8k()?, 1, AudioTapMode::Realtime)
        .await
        .expect_err("unknown call_id must be rejected");
    assert_eq!(err.kind, SipErrorKind::CallNotFound);
    Ok(())
}

#[tokio::test]
// @verifies C032
async fn realtime_overflow_keeps_newest_pair() -> Result<(), Box<dyn std::error::Error>> {
    let (sender, mut handle) = tap_channel(1, AudioTapMode::Realtime);
    let pair_a = synthetic_pair(1)?;
    let pair_b = synthetic_pair(2)?;
    assert_eq!(sender.push(pair_a.clone()).await, None, "first push fits");
    assert_eq!(
        sender.push(pair_b.clone()).await,
        Some(pair_a),
        "oldest pair_a is evicted and reported as overflow"
    );
    assert_eq!(handle.recv().await, Some(pair_b), "newest pair_b survives");
    Ok(())
}

#[tokio::test]
// @verifies C032
async fn realtime_capacity_two_evicts_strictly_oldest() -> Result<(), Box<dyn std::error::Error>> {
    let (sender, mut handle) = tap_channel(2, AudioTapMode::Realtime);
    let pair_a = synthetic_pair(1)?;
    let pair_b = synthetic_pair(2)?;
    let pair_c = synthetic_pair(3)?;
    assert_eq!(sender.push(pair_a.clone()).await, None);
    assert_eq!(sender.push(pair_b.clone()).await, None);
    assert_eq!(
        sender.push(pair_c.clone()).await,
        Some(pair_a),
        "oldest pair_a evicted first"
    );
    assert_eq!(handle.recv().await, Some(pair_b));
    assert_eq!(handle.recv().await, Some(pair_c));
    Ok(())
}

#[tokio::test]
// @verifies C032
async fn lossless_backpressures_without_dropping() -> Result<(), Box<dyn std::error::Error>> {
    let (sender, mut handle) = tap_channel(1, AudioTapMode::Lossless);
    let pair_a = synthetic_pair(1)?;
    let pair_b = synthetic_pair(2)?;
    assert_eq!(sender.push(pair_a.clone()).await, None, "first push fits");
    let pair_b_for_push = pair_b.clone();
    let push_b = tokio::spawn(async move { sender.push(pair_b_for_push).await });
    // Give the spawned producer a chance to run: it must block on channel space.
    tokio::task::yield_now().await;
    assert!(
        !push_b.is_finished(),
        "second push must await channel space (backpressure)"
    );
    assert_eq!(handle.recv().await, Some(pair_a), "drain the first frame");
    assert_eq!(push_b.await?, None, "no drop is reported in Lossless mode");
    assert_eq!(
        handle.recv().await,
        Some(pair_b),
        "pair_b is delivered intact"
    );
    Ok(())
}

#[tokio::test]
// @verifies C032
async fn recv_returns_none_after_producer_closes() -> Result<(), Box<dyn std::error::Error>> {
    let (sender, mut handle) = tap_channel(1, AudioTapMode::Realtime);
    sender.push(synthetic_pair(1)?).await;
    drop(sender);
    assert!(handle.recv().await.is_some(), "buffered frame is delivered");
    assert_eq!(handle.recv().await, None, "producer closed -> None");
    Ok(())
}

#[test]
// @verifies C032
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
fn audio_tap_mode_traits_and_default() {
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn assert_traits<T: Clone + Copy + std::fmt::Debug + PartialEq + Eq>() {}
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn assert_send<T: Send>() {}
    assert_traits::<AudioTapMode>();
    assert_send::<AudioTapHandle>();
    assert_eq!(AudioTapMode::default(), AudioTapMode::Realtime);
    assert_ne!(AudioTapMode::Realtime, AudioTapMode::Lossless);
}

// ── C033: AsyncAudioSource-driven frames flow into the tap (N0032 → N0031) ─

#[tokio::test]
// @verifies C033
async fn erased_audio_source_frames_flow_into_tap() -> Result<(), Box<dyn std::error::Error>> {
    // C033 Invariant: ErasedAudioSource is auto-derived for AsyncAudioSource + Send.
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn assert_erased<T: ErasedAudioSource>() {}
    assert_erased::<MockAsyncAudioSource>();

    // C033 Pre/Post: a Box<dyn AsyncAudioSource> (RPITIT erased) produces frames
    // that are wrapped into AudioChunkPair and consumed by the tap.
    let mut source: Box<dyn AsyncAudioSource> =
        Box::new(MockAsyncAudioSource::new(vec![0i16; 160]));
    let mut buf = [0i16; 160];
    let written = source.next_chunk(&mut buf).await;
    let pair = AudioChunkPair {
        call_id: CallId::from_u64(1)?,
        account_id: AccountId::from_u64(1)?,
        timestamp: SystemTime::now(),
        in_chunk: AudioChunk::I16(buf[..written].to_vec()),
        out_chunk: AudioChunk::I16(vec![0i16; written]),
    };

    let (sender, mut handle) = tap_channel(1, AudioTapMode::Lossless);
    sender.push(pair.clone()).await;
    assert_eq!(handle.recv().await, Some(pair));
    Ok(())
}
