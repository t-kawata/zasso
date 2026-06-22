//! Provisional Response 結合テスト（Asterisk）
//!
//! 180 Ringing の受信を検証する。183 Early Media は Asterisk Echo が送信しないためスキップ。

use crate::common::*;
use siprs::config::{CallMediaPreferences, Codec, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;

/// 発信後、180 Ringing が受信できることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn ringing_received() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;

    wait_for_registration(&mut ctx.events).await?;
    wait_for_registration(&mut ctx.events).await?;

    let _call_id = ctx.client.make_call(
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

    let event = wait_for_event_with_timeout(&mut ctx.events, CALL_TIMEOUT, |p| {
        matches!(p, SipEventPayload::OutgoingCallRinging { .. })
    })
    .await?;

    assert!(
        matches!(&event.payload, SipEventPayload::OutgoingCallRinging { .. }),
        "expected OutgoingCallRinging"
    );

    teardown(ctx);
    Ok(())
}

/// 183 Early Media — スキップ（Asterisk Echo が 183 を送信しないため）。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn early_media_received() -> Result<(), SipError> {
    eprintln!("early_media_received: skipped (Asterisk Echo does not send 183)");
    Ok(())
}
