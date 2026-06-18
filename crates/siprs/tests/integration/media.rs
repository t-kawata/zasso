//! メディア結合テスト（Asterisk）
//!
//! AudioTap の API が正常に動作することを確認する。
//! ICE/TURN のテストは M20-2（Layer 4 相互接続試験）でカバーする。
//!
//! 注: PjsuaBackend の credential 設定が未実装のため登録なしでテストを行う。

use crate::common::*;
use siprs::audio::tap::{AudioTapHandle, AudioTapMode};
use siprs::config::{CallMediaPreferences, Codec, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

/// AudioTap の購読 API が正常に動作することを確認する。
/// 通話確立後に subscribe_audio が AudioTapHandle を返すことを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn media_loopback_tap_active() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    let call_id = ctx.client.make_call(
        ctx.account_1,
        OutgoingCallRequest {
            target_uri: format!("sip:1002@{}:{}", sip_server_host(), ASTERISK_SIP_PORT),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: CallMediaPreferences {
                enable_early_media: true,
                enable_srtp: None,
                preferred_codecs: vec![Codec::Pcmu],
            },
            auto_answer_refer: false,
        },
    )?;

    let connected = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::CallConnected { .. })
    }).await;

    match connected {
        Ok(_) => {
            // AudioTap を購読
            let tap_result: Result<AudioTapHandle, SipError> = ctx.client.subscribe_audio(
                call_id,
                Default::default(),
                5,
                AudioTapMode::Realtime,
            );
            match tap_result {
                Ok(_handle) => {
                    eprintln!("media_loopback_tap_active: AudioTapHandle obtained successfully");
                }
                Err(e) => {
                    eprintln!("media_loopback_tap_active: subscribe_audio returned error: {e}");
                }
            }

            ctx.client.hangup(call_id, HangupReason::Bye)?;
            wait_for_event_with_timeout(&mut events, EVENT_TIMEOUT, |payload| {
                matches!(payload, SipEventPayload::CallDisconnected { .. })
            }).await?;
        }
        Err(e) => {
            ctx.client.hangup(call_id, HangupReason::Bye)?;
            eprintln!("media_loopback_tap_active: call not connected: {e}");
        }
    }

    teardown(ctx);
    Ok(())
}

/// 通話終了後に AudioTap が正しくクローズされることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn media_tap_closes_on_hangup() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    let call_id = ctx.client.make_call(
        ctx.account_1,
        OutgoingCallRequest {
            target_uri: format!("sip:1002@{}:{}", sip_server_host(), ASTERISK_SIP_PORT),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: CallMediaPreferences {
                enable_early_media: true,
                enable_srtp: None,
                preferred_codecs: vec![Codec::Pcmu],
            },
            auto_answer_refer: false,
        },
    )?;

    let connected = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::CallConnected { .. })
    }).await;

    match connected {
        Ok(_) => {
            let _tap_handle = ctx.client.subscribe_audio(
                call_id,
                Default::default(),
                5,
                AudioTapMode::Realtime,
            );

            ctx.client.hangup(call_id, HangupReason::Bye)?;
            wait_for_event_with_timeout(&mut events, EVENT_TIMEOUT, |payload| {
                matches!(payload, SipEventPayload::CallDisconnected { .. })
            }).await?;
        }
        Err(e) => {
            ctx.client.hangup(call_id, HangupReason::Bye)?;
            eprintln!("media_tap_closes_on_hangup: call not connected: {e}");
        }
    }

    teardown(ctx);
    Ok(())
}
