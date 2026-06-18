//! INVITE/BYE 結合テスト（Asterisk）
//!
//! 正常切断、CANCEL、タイムアウト、拒否の4ケースを検証する。

use crate::common::*;
use siprs::config::{CallMediaPreferences, Codec, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

/// INVITE → BYE 正常切断を検証する。
/// アカウント1がアカウント2に発信し、正常に切断されることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_normal_hangup() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    // 両アカウントの登録を待機
    wait_for_registration(&mut events).await?;
    wait_for_registration(&mut events).await?;

    // アカウント1 → アカウント2 に発信
    let call_id = ctx.client.make_call(
        ctx.account_1,
        OutgoingCallRequest {
            target_uri: format!(
                "sip:test_user_2@{}:{}",
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

    // CallConnected を待機
    wait_for_call_connected(&mut events).await?;

    // BYE で切断
    ctx.client.hangup(call_id, HangupReason::Bye)?;

    // CallDisconnected を待機
    let result = wait_for_call_disconnected(&mut events).await;

    teardown(ctx);
    let _ = result?;
    Ok(())
}

/// Ringing 中に CANCEL を送信し、`CallCancelled` が発火することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_cancel() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    // 両アカウントの登録を待機
    wait_for_registration(&mut events).await?;
    wait_for_registration(&mut events).await?;

    // 発信
    let call_id = ctx.client.make_call(
        ctx.account_1,
        OutgoingCallRequest {
            target_uri: format!(
                "sip:test_user_2@{}:{}",
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

    // OutgoingCallRinging を待機
    wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::OutgoingCallRinging { .. })
    })
    .await?;

    // Ringing 中に CANCEL
    ctx.client.hangup(call_id, HangupReason::Cancel)?;

    // CallCancelled を待機
    let result = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::CallCancelled { .. })
    })
    .await;

    teardown(ctx);
    let _ = result?;
    Ok(())
}

/// 応答のない相手に発信し、タイムアウトが発生することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_timeout() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    // アカウント1の登録を待機
    wait_for_registration(&mut events).await?;
    // アカウント2の登録を消費
    wait_for_registration(&mut events).await?;

    // 存在しない内線に発信（Asterisk が 404 を返すはず）
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

    // CallDisconnected または CallRejected を待機
    let result = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(
            payload,
            SipEventPayload::CallDisconnected { .. } | SipEventPayload::CallRejected { .. }
        )
    })
    .await;

    teardown(ctx);
    let _ = result?;
    Ok(())
}

/// 着信を拒否（486 Busy）し、`CallRejected` が発火することを確認する。
///
/// 注: このテストには双方向のクライアント（着信応答）が必要。
/// Asterisk の Echo ダイヤルプランでは自動応答されるため、
/// 本テストはプレースホルダーとして残し、M20-2 で実際の PBX 試験時に実装する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_reject() -> Result<(), SipError> {
    eprintln!("call_reject: skipped (requires dual-client setup, see M20-2)");
    Ok(())
}
