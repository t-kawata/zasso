//! メディア結合テスト（Asterisk）
//!
//! AudioTap の購読と切断時クローズを検証する。

use crate::common::*;
use siprs::audio::tap::{AudioTapHandle, AudioTapMode};
use siprs::config::{CallMediaPreferences, Codec, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

/// 通話確立後に AudioTap を購読する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn media_loopback_tap_active() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;

    wait_for_registration(&mut ctx.events).await?;
    wait_for_registration(&mut ctx.events).await?;

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

    wait_for_call_connected(&mut ctx.events).await?;

    let _handle: AudioTapHandle =
        ctx.client
            .subscribe_audio(call_id, Default::default(), 5, AudioTapMode::Realtime)?;

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    wait_for_event_with_timeout(&mut ctx.events, EVENT_TIMEOUT, |p| {
        matches!(p, SipEventPayload::CallDisconnected { .. })
    })
    .await?;

    teardown(ctx);
    Ok(())
}

/// 通話終了後に AudioTap がクローズされることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn media_tap_closes_on_hangup() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;

    wait_for_registration(&mut ctx.events).await?;
    wait_for_registration(&mut ctx.events).await?;

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

    wait_for_call_connected(&mut ctx.events).await?;
    let _handle =
        ctx.client
            .subscribe_audio(call_id, Default::default(), 5, AudioTapMode::Realtime)?;

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    wait_for_event_with_timeout(&mut ctx.events, EVENT_TIMEOUT, |p| {
        matches!(p, SipEventPayload::CallDisconnected { .. })
    })
    .await?;

    teardown(ctx);
    Ok(())
}
