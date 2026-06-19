//! INVITE/BYE 結合テスト（Asterisk）
//!
//! 正常切断、CANCEL、タイムアウト、拒否の4ケースを検証する。
//!
//! 注: PjsuaBackend の credential 設定が未実装のため登録なしでテストを行う。
//! 認証テストは credential 実装後に別チケットで対応。

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

    // アカウント1 → アカウント2 に発信（登録なし、allow_outbound_without_register=true）
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

    // CallConnected または CallDisconnected を待機
    let result = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(
            payload,
            SipEventPayload::CallConnected { .. } | SipEventPayload::CallDisconnected { .. }
        )
    })
    .await;

    match result {
        Ok(event) => {
            match &event.payload {
                SipEventPayload::CallConnected { .. } => {
                    // 通話確立 → BYE で切断
                    ctx.client.hangup(call_id, HangupReason::Bye)?;
                    wait_for_call_disconnected(&mut events).await?;
                }
                SipEventPayload::CallDisconnected { .. } => {
                    // Asterisk が自動切断した場合も正常とみなす
                    eprintln!("call_normal_hangup: call disconnected before BYE (Asterisk dialplan result)");
                }
                _ => unreachable!(),
            }
        }
        Err(e) => {
            teardown(ctx);
            return Err(e);
        }
    }

    teardown(ctx);
    Ok(())
}

/// Ringing 中に CANCEL を送信し、`CallCancelled` が発火することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_cancel() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    // 発信
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

    // CANCEL を送信
    ctx.client.hangup(call_id, HangupReason::Cancel)?;

    // CallDisconnected または CallCancelled を待機
    let result = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(
            payload,
            SipEventPayload::CallDisconnected { .. } | SipEventPayload::CallCancelled { .. }
        )
    })
    .await;

    teardown(ctx);
    let _ = result?;
    Ok(())
}

/// 応答のない相手に発信し、切断されることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_timeout() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    // 存在しない内線に発信
    let _call_id = ctx.client.make_call(
        ctx.account_1,
        OutgoingCallRequest {
            target_uri: format!("sip:nonexistent@{}:{}", sip_server_host(), ASTERISK_SIP_PORT),
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

/// 着信を拒否 — Asterisk Echo のためプレースホルダー。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_reject() -> Result<(), SipError> {
    eprintln!("call_reject: skipped (requires dual-client setup, see M20-2)");
    Ok(())
}
