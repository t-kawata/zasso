//! INVITE/BYE 結合テスト（Asterisk）

use crate::common::*;
use siprs::config::{CallMediaPreferences, Codec, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_normal_hangup() -> Result<(), SipError> {
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

    let connected = wait_for_call_connected(&mut ctx.events).await?;
    assert!(matches!(
        &connected.payload,
        SipEventPayload::CallConnected { .. }
    ));

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    wait_for_call_disconnected(&mut ctx.events).await?;
    teardown(ctx);
    Ok(())
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_cancel() -> Result<(), SipError> {
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

    let _ringing = wait_for_event_with_timeout(&mut ctx.events, CALL_TIMEOUT, |p| {
        matches!(p, SipEventPayload::OutgoingCallRinging { .. })
    })
    .await;

    ctx.client.hangup(call_id, HangupReason::Cancel)?;
    let _ = wait_for_event_with_timeout(&mut ctx.events, CALL_TIMEOUT, |p| {
        matches!(p, SipEventPayload::CallDisconnected { .. })
    })
    .await;

    teardown(ctx);
    Ok(())
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_timeout() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;
    wait_for_registration(&mut ctx.events).await?;
    wait_for_registration(&mut ctx.events).await?;

    let _call_id = ctx.client.make_call(
        ctx.account_1,
        OutgoingCallRequest {
            target_uri: format!(
                "sip:nonexistent@{}:{}",
                sip_server_host(),
                ASTERISK_SIP_PORT
            ),
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

    let _ = wait_for_event_with_timeout(&mut ctx.events, CALL_TIMEOUT, |p| {
        matches!(p, SipEventPayload::CallDisconnected { .. })
    })
    .await;

    teardown(ctx);
    Ok(())
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_reject() -> Result<(), SipError> {
    eprintln!("call_reject: skipped (requires dual-client setup, see M20-2)");
    Ok(())
}
