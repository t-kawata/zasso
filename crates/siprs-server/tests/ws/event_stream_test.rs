// [::TICKET::] P12-10: Layer 5 WebSocket integration test — event stream.
// Control+audio (/api/v1/ws) delivers a JSON text frame {type,seq,payload}
// followed by a binary audio frame whose header.sequence_number correlates
// with the event seq (C063 invariant). The audio-only endpoint
// (/api/v1/ws/audio) delivers binary audio frames only.

#[path = "../common/harness.rs"]
mod common;

use common::TestApp;
use futures::StreamExt;
use siprs::api::http_ws_protocol::{WsBinaryFrame, WsTextFrame, PATH_WS, PATH_WS_AUDIO};

#[tokio::test]
async fn test_control_audio_delivers_event_then_correlated_audio(
) -> Result<(), Box<dyn std::error::Error>> {
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    let app = TestApp::new();
    let addr = app.spawn().await;

    let url = format!("ws://{}{}", addr, PATH_WS);
    let (mut ws_stream, _response) = tokio_tungstenite::connect_async(url).await?;

    // First frame: a JSON text event with a global sequence number (C063).
    let first = ws_stream.next().await.ok_or("expected a text frame")??;
    let text = first.into_text()?;
    let event_frame: WsTextFrame = serde_json::from_str(&text)?;
    assert_eq!(event_frame.msg_type, "event");
    assert_eq!(event_frame.payload["kind"], "ClientInitialized");
    assert!(event_frame.seq > 0, "event seq must be positive");

    // Second frame: a binary audio frame whose header seq is the next value
    // from the same SequenceGenerator domain (C063 invariant).
    let second = ws_stream.next().await.ok_or("expected a binary frame")??;
    let bytes = second.into_data();
    let audio_frame = WsBinaryFrame::decode(&bytes).ok_or("invalid binary frame")?;
    // Copy out of the packed header to avoid unaligned field references.
    let audio_seq = audio_frame.header.sequence_number;
    assert_eq!(audio_seq, event_frame.seq + 1);

    Ok(())
}

#[tokio::test]
async fn test_audio_only_delivers_binary_frames() -> Result<(), Box<dyn std::error::Error>> {
    // [::TICKET::] P12-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-10 --for-spec --no-implementation-order`.
    let app = TestApp::new();
    let addr = app.spawn().await;

    let url = format!("ws://{}{}", addr, PATH_WS_AUDIO);
    let (mut ws_stream, _response) = tokio_tungstenite::connect_async(url).await?;

    let first = ws_stream.next().await.ok_or("expected a binary frame")??;
    let bytes = first.into_data();
    let audio_frame = WsBinaryFrame::decode(&bytes).ok_or("invalid binary frame")?;
    // Copy out of the packed header to avoid unaligned field references.
    let audio_seq = audio_frame.header.sequence_number;
    let frame_ms = audio_frame.header.frame_ms;
    assert!(audio_seq > 0);
    assert_eq!(frame_ms, 20);
    assert!(
        !audio_frame.data.is_empty(),
        "PCM payload must be non-empty"
    );

    Ok(())
}
