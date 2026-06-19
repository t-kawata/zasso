//! DTMF 結合テスト（Asterisk）
//!
//! RFC4733 / SIP INFO / Inband の各 DTMF 送信を検証する。

use crate::common::*;
use siprs::config::{CallMediaPreferences, Codec, DtmfMethod, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

/// RFC4733 (RTP event) による DTMF 送信を検証する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dtmf_rfc4733() -> Result<(), SipError> {
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
    ctx.client.send_dtmf(call_id, "1".to_string(), DtmfMethod::Rfc4733)?;

    let sent = wait_for_event_with_timeout(&mut ctx.events, EVENT_TIMEOUT, |p| {
        matches!(p, SipEventPayload::DtmfSent { .. })
    }).await?;
    assert!(matches!(&sent.payload, SipEventPayload::DtmfSent { .. }));

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    teardown(ctx);
    Ok(())
}

/// SIP INFO による DTMF 送信を検証する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dtmf_sip_info() -> Result<(), SipError> {
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
    ctx.client.send_dtmf(call_id, "5".to_string(), DtmfMethod::SipInfo)?;

    let sent = wait_for_event_with_timeout(&mut ctx.events, EVENT_TIMEOUT, |p| {
        matches!(p, SipEventPayload::DtmfSent { .. })
    }).await?;
    assert!(matches!(&sent.payload, SipEventPayload::DtmfSent { .. }));

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    teardown(ctx);
    Ok(())
}

/// Inband DTMF 送信を検証する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dtmf_inband() -> Result<(), SipError> {
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
    ctx.client.send_dtmf(call_id, "0".to_string(), DtmfMethod::Inband)?;

    let sent = wait_for_event_with_timeout(&mut ctx.events, EVENT_TIMEOUT, |p| {
        matches!(p, SipEventPayload::DtmfSent { .. })
    }).await?;
    assert!(matches!(&sent.payload, SipEventPayload::DtmfSent { .. }));

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    teardown(ctx);
    Ok(())
}
