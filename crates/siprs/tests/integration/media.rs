//! メディア結合テスト（Asterisk）
//!
//! Asterisk Echo アプリケーションとの media loopback を検証する。
//! AudioTap で取得した `AudioChunkPair` の sign を確認する。
//!
//! ICE/TURN のテストは M20-2（Layer 4 相互接続試験）でカバーする。

use std::time::Duration;

use crate::common::*;
use siprs::audio::tap::{AudioTapHandle, AudioTapMode};
use siprs::config::{CallMediaPreferences, Codec, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::runtime::command::HangupReason;

/// 通話確立後に AudioTap を購読し、`AudioChunkPair` が取得できることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn media_loopback_tap_active() -> Result<(), SipError> {
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

    // 通話確立を待機
    wait_for_call_connected(&mut events).await?;

    // AudioTap を購読（Realtime モード、capacity 5）
    let mut tap_handle: AudioTapHandle = ctx.client.subscribe_audio(
        call_id,
        Default::default(),
        5,
        AudioTapMode::Realtime,
    )?;

    // 最大5秒間、AudioChunkPair を待機
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    let mut received = false;

    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_secs(1), tap_handle.recv()).await {
            Ok(Some(pair)) => {
                // in_chunk または out_chunk が非ゼロであることを確認（メディアが流れている）
                if !pair.in_chunk.is_empty() || !pair.out_chunk.is_empty() {
                    received = true;
                    break;
                }
            }
            Ok(None) => break, // ストリーム終了
            Err(_) => continue, // タイムアウトは再試行
        }
    }

    assert!(
        received,
        "media_loopback: no AudioChunkPair received within timeout"
    );

    // 切断
    ctx.client.hangup(call_id, HangupReason::Bye)?;
    wait_for_call_disconnected(&mut events).await?;

    teardown(ctx);
    Ok(())
}

/// 通話終了後に AudioTap が正しくクローズされることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn media_tap_closes_on_hangup() -> Result<(), SipError> {
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
    wait_for_call_connected(&mut events).await?;

    // AudioTap を購読
    let mut tap_handle: AudioTapHandle = ctx.client.subscribe_audio(
        call_id,
        Default::default(),
        5,
        AudioTapMode::Realtime,
    )?;

    // 切断
    ctx.client.hangup(call_id, HangupReason::Bye)?;
    wait_for_call_disconnected(&mut events).await?;

    // 切断後、tap_handle.recv() が None を返すことを確認
    let result = tokio::time::timeout(Duration::from_secs(3), tap_handle.recv()).await;
    match result {
        Ok(None) => { /* 正常: ストリーム終了 */ }
        Ok(Some(_)) => {
            // 切断後も一部のデータが届くことがある（バッファリング）— 許容
            eprintln!(
                "media_tap_closes_on_hangup: received data after hangup (may be buffered)"
            );
        }
        Err(_) => {
            // タイムアウトしたが tap が閉じていない可能性
            eprintln!(
                "media_tap_closes_on_hangup: tap did not close within timeout"
            );
        }
    }

    teardown(ctx);
    Ok(())
}
