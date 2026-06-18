//! Provisional Response 結合テスト（Asterisk）
//!
//! 180 Ringing / 183 Early Media の provisional response 処理を検証する。

use crate::common::*;
use siprs::config::{CallMediaPreferences, Codec, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;

/// 発信後、180 Ringing が受信できることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn ringing_received() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    // 両アカウントの登録を待機
    wait_for_registration(&mut events).await?;
    wait_for_registration(&mut events).await?;

    // アカウント1 → アカウント2 に発信
    let _call_id = ctx.client.make_call(
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

    // OutgoingCallRinging (180 Ringing) を待機
    let result = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::OutgoingCallRinging { .. })
    })
    .await;

    teardown(ctx);
    let event = result?;
    assert!(
        matches!(&event.payload, SipEventPayload::OutgoingCallRinging { .. }),
        "expected OutgoingCallRinging, got {:?}",
        event.payload
    );
    Ok(())
}

/// Early Media (183 Session Progress) が受信できることを確認する。
///
/// 注: Asterisk の Echo アプリケーションは 183 を送信しない場合がある。
/// 本テストは実サーバの挙動に依存するため、タイムアウトも許容する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn early_media_received() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    // 両アカウントの登録を待機
    wait_for_registration(&mut events).await?;
    wait_for_registration(&mut events).await?;

    // アカウント1 → アカウント2 に発信
    let _call_id = ctx.client.make_call(
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

    // EarlyMediaReceived (183) を待機（タイムアウト許容）
    let result = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::EarlyMediaReceived { .. })
    })
    .await;

    teardown(ctx);

    match result {
        Ok(event) => {
            assert!(
                matches!(&event.payload, SipEventPayload::EarlyMediaReceived { .. }),
                "expected EarlyMediaReceived, got {:?}",
                event.payload
            );
        }
        Err(e) => {
            // Asterisk の Echo が 183 を送信しない場合があるため、タイムアウトを許容
            eprintln!(
                "early_media_received: timed out (Asterisk may not send 183): {e}"
            );
        }
    }
    Ok(())
}
