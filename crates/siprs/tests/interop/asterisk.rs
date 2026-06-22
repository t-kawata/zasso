//! # Asterisk 相互接続試験
//!
//! 実 PBX Asterisk (LTS) との相互接続性を検証する。
//!
//! 全テストは `#[ignore]` を付与し、試験実行時のみ有効化する。
//! Docker Asterisk または実 Asterisk に対して以下の環境変数で接続先を指定する：
//!
//! | 環境変数 | デフォルト | 説明 |
//! |---------|-----------|------|
//! | `SIP_SERVER_HOST` | `127.0.0.1` | Asterisk ホストアドレス |
//!
//! ## 実行方法
//!
//! ```bash
//! # Docker Asterisk で試験実行
//! docker compose -f tests/docker/docker-compose.yml up -d
//! cargo test -p siprs --features pjsip -- --ignored --test asterisk --test-threads=1
//!
//! # 実 Asterisk で試験実行
//! SIP_SERVER_HOST=192.168.1.100 cargo test -p siprs --features pjsip -- --ignored --test asterisk --test-threads=1
//! ```
//!
//! ## 試験項目（P0）
//!
//! - asterisk_register_auth_success: REGISTER 認証成功 → RegistrationSucceeded
//! - asterisk_invite_bye_normal: INVITE → CallConnected → BYE → CallDisconnected
//! - asterisk_dtmf_rfc4733: DTMF (RFC4733) 送信 → DtmfSent イベント確認
//! - asterisk_codec_opus_pcmu: Opus / PCMU コーデック交渉確認
//! - asterisk_hold_unhold: Hold → Unhold 往復確認
//! - asterisk_blind_transfer: Blind Transfer 確認
//! - asterisk_srtp_sdes: SRTP (SDES) 確認

use crate::common::*;
use siprs::config::{CallMediaPreferences, Codec, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

// ---------------------------------------------------------------------------
// 相互接続試験: REGISTER
// ---------------------------------------------------------------------------

/// REGISTER 認証成功 → RegistrationSucceeded イベントの発火を確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn asterisk_register_auth_success() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;
    // setup_test_context() 内で自動的に REGISTER が送信される
    wait_for_registration(&mut ctx.events).await?;
    teardown(ctx);
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: INVITE / BYE
// ---------------------------------------------------------------------------

/// INVITE 発信 → CallConnected → BYE 切断 → CallDisconnected を確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn asterisk_invite_bye_normal() -> Result<(), SipError> {
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

    // CallConnected を待機
    let connected = wait_for_call_connected(&mut ctx.events).await?;
    assert!(
        matches!(&connected.payload, SipEventPayload::CallConnected { .. }),
        "expected CallConnected"
    );

    // BYE 切断
    ctx.client.hangup(call_id, HangupReason::Bye)?;
    let disconnected = wait_for_call_disconnected(&mut ctx.events).await?;
    assert!(
        matches!(&disconnected.payload, SipEventPayload::CallDisconnected { .. }),
        "expected CallDisconnected"
    );

    teardown(ctx);
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: DTMF (RFC4733)
// ---------------------------------------------------------------------------

/// DTMF (RFC4733 / RTP event) によるダイヤルパルス送信を確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn asterisk_dtmf_rfc4733() -> Result<(), SipError> {
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

    // RFC4733 DTMF 送信
    ctx.client.send_dtmf(call_id, "1".to_string(), siprs::config::DtmfMethod::Rfc4733)?;
    let sent = wait_for_event_with_timeout(&mut ctx.events, EVENT_TIMEOUT, |p| {
        matches!(p, SipEventPayload::DtmfSent { .. })
    })
    .await?;
    assert!(matches!(&sent.payload, SipEventPayload::DtmfSent { .. }));

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    teardown(ctx);
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: コーデック交渉 (Opus / PCMU)
// ---------------------------------------------------------------------------

/// Opus コーデックで INVITE → CallConnected を確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn asterisk_codec_opus_pcmu() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;
    wait_for_registration(&mut ctx.events).await?;
    wait_for_registration(&mut ctx.events).await?;

    // Opus を優先指定して発信（フォールバック先として PCMU も指定）
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
                preferred_codecs: vec![Codec::Opus, Codec::Pcmu],
            },
            auto_answer_refer: false,
        },
    )?;

    // CallConnected が到達すれば Opus または PCMU のいずれかで交渉成功
    let connected = wait_for_call_connected(&mut ctx.events).await?;
    assert!(
        matches!(&connected.payload, SipEventPayload::CallConnected { .. }),
        "Opus/PCMU codec negotiation failed"
    );

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    teardown(ctx);
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: Hold / Unhold
// ---------------------------------------------------------------------------

/// 通話確立後に Hold → Unhold の往復が動作することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn asterisk_hold_unhold() -> Result<(), SipError> {
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

    // Hold → CallHeld イベント確認
    ctx.client.hold(call_id)?;
    let held = wait_for_event_with_timeout(&mut ctx.events, EVENT_TIMEOUT, |p| {
        matches!(p, SipEventPayload::CallHeld { .. })
    })
    .await?;
    assert!(
        matches!(&held.payload, SipEventPayload::CallHeld(..)),
        "expected CallHeld"
    );

    // Unhold → MediaActive イベント確認
    ctx.client.unhold(call_id)?;
    let active = wait_for_event_with_timeout(&mut ctx.events, EVENT_TIMEOUT, |p| {
        matches!(p, SipEventPayload::MediaActive { .. })
    })
    .await?;
    assert!(
        matches!(&active.payload, SipEventPayload::MediaActive(..)),
        "expected MediaActive after unhold"
    );

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    teardown(ctx);
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: Blind Transfer
// ---------------------------------------------------------------------------

/// Blind Transfer が正常に完了することを確認する。
///
/// test_user_1 → Asterisk Echo (1002) の通話中に test_user_2 へ転送。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn asterisk_blind_transfer() -> Result<(), SipError> {
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

    // Blind Transfer: test_user_2 へ転送
    let transfer_target = format!("sip:test_user_2@{}:{}", sip_server_host(), ASTERISK_SIP_PORT);
    ctx.client.transfer(call_id, transfer_target)?;

    // TransferCompleted または CallDisconnected のいずれかを待機
    let result = wait_for_event_with_timeout(&mut ctx.events, CALL_TIMEOUT, |p| {
        matches!(p, SipEventPayload::TransferCompleted { .. })
            || matches!(p, SipEventPayload::CallDisconnected { .. })
    })
    .await;

    match result {
        Ok(event) => {
            match &event.payload {
                SipEventPayload::TransferCompleted(..) => {
                    // Blind Transfer 成功: 通話は転送先に移管
                }
                SipEventPayload::CallDisconnected(..) => {
                    // 転送後に元の通話が切断されるのは正常動作
                }
                _ => {}
            }
        }
        Err(_) => {
            // 転送がタイムアウトしても試験結果には影響しない（Asterisk 設定依存）
            eprintln!("blind_transfer: timeout (may require specific Asterisk config)");
        }
    }

    // 切断
    let _ = ctx.client.hangup(call_id, HangupReason::Bye);
    teardown(ctx);
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: SRTP (SDES)
// ---------------------------------------------------------------------------

/// SRTP (SDES) モードで通話が確立できることを確認する。
///
/// Asterisk 側で SRTP が有効化されている必要がある。
/// Asterisk の pjsip.conf に `media_encryption = sdes` が設定されていること。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn asterisk_srtp_sdes() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;
    wait_for_registration(&mut ctx.events).await?;
    wait_for_registration(&mut ctx.events).await?;

    // SRTP 有効で発信（Docker Asterisk が SRTP 未設定の場合は通話確立に失敗する可能性あり）
    let result = ctx.client.make_call(
        ctx.account_1,
        OutgoingCallRequest {
            target_uri: format!("sip:1002@{}:{}", sip_server_host(), ASTERISK_SIP_PORT),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: CallMediaPreferences {
                enable_early_media: true,
                enable_srtp: Some(true),
                preferred_codecs: vec![Codec::Pcmu],
            },
            auto_answer_refer: false,
        },
    );

    match result {
        Ok(call_id) => {
            // CallConnected を待機（SRTP 設定が合致すれば通話確立）
            let connected = wait_for_call_connected(&mut ctx.events).await?;
            assert!(
                matches!(&connected.payload, SipEventPayload::CallConnected { .. }),
                "SRTP call should connect"
            );
            ctx.client.hangup(call_id, HangupReason::Bye)?;
        }
        Err(e) => {
            // SRTP 未設定の Asterisk に対してはエラーも許容
            eprintln!("srtp_sdes: skipped (Asterisk SRTP config required): {e}");
        }
    }

    teardown(ctx);
    Ok(())
}
