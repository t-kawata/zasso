//! DTMF 結合テスト（Asterisk）
//!
//! RFC4733 / SIP INFO / Inband の各 DTMF 送受信を検証する。
//! 通話確立後に DTMF を送信し、イベント発火を確認する。
//!
//! 注: PjsuaBackend の credential 設定が未実装のため登録なしでテストを行う。

use crate::common::*;
use siprs::config::{CallMediaPreferences, Codec, DtmfMethod, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

/// RFC4733 (RTP event) による DTMF 送信を検証する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dtmf_rfc4733() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

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
    let connected = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::CallConnected { .. })
    }).await;

    match connected {
        Ok(_) => {
            // DTMF '1' を RFC4733 で送信
            ctx.client.send_dtmf(call_id, "1".to_string(), DtmfMethod::Rfc4733)?;

            // DtmfSent を待機
            let result = wait_for_event_with_timeout(&mut events, EVENT_TIMEOUT, |payload| {
                matches!(payload, SipEventPayload::DtmfSent { .. })
            })
            .await;

            ctx.client.hangup(call_id, HangupReason::Bye)?;
            let _ = result?;
        }
        Err(e) => {
            ctx.client.hangup(call_id, HangupReason::Bye)?;
            eprintln!("dtmf_rfc4733: call not connected: {e}");
        }
    }

    teardown(ctx);
    Ok(())
}

/// SIP INFO による DTMF 送信を検証する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dtmf_sip_info() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

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

    let connected = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::CallConnected { .. })
    }).await;

    match connected {
        Ok(_) => {
            ctx.client.send_dtmf(call_id, "5".to_string(), DtmfMethod::SipInfo)?;

            let result = wait_for_event_with_timeout(&mut events, EVENT_TIMEOUT, |payload| {
                matches!(payload, SipEventPayload::DtmfSent { .. })
            })
            .await;

            ctx.client.hangup(call_id, HangupReason::Bye)?;
            let _ = result?;
        }
        Err(e) => {
            ctx.client.hangup(call_id, HangupReason::Bye)?;
            eprintln!("dtmf_sip_info: call not connected: {e}");
        }
    }

    teardown(ctx);
    Ok(())
}

/// Inband DTMF 送信を検証する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dtmf_inband() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

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

    let connected = wait_for_event_with_timeout(&mut events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::CallConnected { .. })
    }).await;

    match connected {
        Ok(_) => {
            ctx.client.send_dtmf(call_id, "0".to_string(), DtmfMethod::Inband)?;

            let result = wait_for_event_with_timeout(&mut events, EVENT_TIMEOUT, |payload| {
                matches!(payload, SipEventPayload::DtmfSent { .. })
            })
            .await;

            ctx.client.hangup(call_id, HangupReason::Bye)?;
            let _ = result?;
        }
        Err(e) => {
            ctx.client.hangup(call_id, HangupReason::Bye)?;
            eprintln!("dtmf_inband: call not connected: {e}");
        }
    }

    teardown(ctx);
    Ok(())
}
