//! INVITE/BYE 結合テスト（Asterisk）

use std::time::Duration;

use crate::common::*;
use siprs::config::{CallMediaPreferences, ClientConfig, Codec, OutgoingCallRequest, TimeoutConfig};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

/// テスト用の ClientConfig を生成する（dual-client テスト用）。
///
/// `label` は user_agent の識別子として使用される（"reject-a" / "reject-b" 等）。
fn client_config_for(label: &str) -> ClientConfig {
    ClientConfig {
        user_agent: format!("siprs-call-test-{label}/0.1"),
        max_calls: 10,
        timeouts: TimeoutConfig {
            register_timeout: Duration::from_secs(30),
            invite_timeout: Duration::from_secs(30),
            ..TimeoutConfig::default()
        },
        ..ClientConfig::default()
    }
}

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

/// client_b が 486 Busy Here で応答し、client_a で CallRejected イベントを受信することを確認する。
///
/// テスト手順:
/// 1. DualClientContext で client_a / client_b を初期化し両アカウントを登録
/// 2. client_a → client_b に発信
/// 3. client_b が 486 Busy Here で応答
/// 4. client_a で CallRejected イベントを確認
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_reject() -> Result<(), SipError> {
    let host = sip_server_host();
    let mut ctx = DualClientContext::new(
        client_config_for("reject-a"),
        client_config_for("reject-b"),
        account_config_for_user_1(&host),
        account_config_for_user_2(&host),
    )?;

    // 両アカウントの登録完了を待機
    wait_for_registration(&mut ctx.events_a).await?;
    wait_for_registration(&mut ctx.events_b).await?;

    // client_a → client_b に発信
    let target_b = format!("sip:test_user_2@{}:{}", host, ASTERISK_SIP_PORT);
    let _call_id = ctx.call_a_to_b(&target_b)?;

    // client_b が着信を受信
    let incoming = ctx.wait_for_call_incoming_b().await?;
    let b_call_id = match &incoming.payload {
        SipEventPayload::IncomingCall(info) => info.call_id,
        _ => return Err(SipError::invalid_state("expected IncomingCall on client_b")),
    };

    // client_b が 486 Busy Here で応答
    ctx.answer_b(b_call_id, 486)?;

    // client_a で CallRejected イベントを確認
    let rejected = ctx.wait_for_event_a(|p| matches!(p, SipEventPayload::CallRejected { .. })).await?;
    assert!(
        matches!(&rejected.payload, SipEventPayload::CallRejected(..)),
        "client_a が CallRejected を受信すること"
    );

    ctx.shutdown_all()?;
    Ok(())
}
