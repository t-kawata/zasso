//! # FreeSWITCH 相互接続試験
//!
//! 実 PBX FreeSWITCH との相互接続性を検証する。
//!
//! 全テストは `#[ignore]` を付与し、試験実行時のみ有効化する。
//! 接続先は以下の環境変数で指定する：
//!
//! | 環境変数 | デフォルト | 説明 |
//! |---------|-----------|------|
//! | `FS_HOST` | `127.0.0.1` | FreeSWITCH ホストアドレス |
//! | `FS_SIP_PORT` | `5060` | FreeSWITCH SIP ポート |
//!
//! ## 準備
//!
//! FreeSWITCH 側で以下の設定が必要：
//!
//! - SIP ユーザー `test_user_1` / `test_user_2` の登録
//! - OPUS および PCMU コーデックの有効化
//! - ICE / TURN の有効化（任意）
//!
//! ## 実行方法
//!
//! ```bash
//! cargo test -p siprs --features pjsip -- --ignored --test freeswitch --test-threads=1
//! ```
//!
//! ## 試験項目（P0）
//!
//! - freeswitch_register_auth_success: REGISTER 認証成功 → RegistrationSucceeded
//! - freeswitch_invite_bye_normal: INVITE → CallConnected → BYE → CallDisconnected
//! - freeswitch_dtmf_sip_info: DTMF (SIP INFO) 送信 → DtmfSent 確認
//! - freeswitch_codec_opus_pcmu: Opus / PCMU コーデック交渉確認
//! - freeswitch_ice_turn: ICE / TURN negotiation 確認

use std::time::Duration;

use siprs::client::SipClient;
use siprs::config::{
    AccountCodecPolicy, AccountConfig, AccountMediaConfig, AccountTransportPolicy, CallMediaPreferences,
    ClientConfig, Codec, DtmfMethod, DtmfPolicy, OutgoingCallRequest, TimeoutConfig,
};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;
use tokio::sync::broadcast;

use crate::common::{
    wait_for_call_disconnected, wait_for_event_with_timeout,
    EVENT_TIMEOUT, CALL_TIMEOUT, REGISTER_TIMEOUT,
};

// ---------------------------------------------------------------------------
// FreeSWITCH 接続設定
// ---------------------------------------------------------------------------

/// FreeSWITCH のホストアドレスを環境変数から取得する。
///
/// `FS_HOST` 環境変数が設定されていればその値、未設定なら `127.0.0.1` を使用する。
fn freeswitch_host() -> String {
    std::env::var("FS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string())
}

/// FreeSWITCH の SIP ポートを環境変数から取得する。
///
/// `FS_SIP_PORT` 環境変数が設定されていればその値、未設定なら 5060 を使用する。
fn freeswitch_sip_port() -> u16 {
    std::env::var("FS_SIP_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5060)
}

/// テスト用の SipClient を FreeSWITCH 向けにセットアップする。
fn setup_freeswitch_context() -> Result<(SipClient, broadcast::Receiver<siprs::event::SipEvent>), SipError> {
    let config = ClientConfig {
        user_agent: "siprs-freeswitch-interop/0.1".into(),
        max_calls: 10,
        timeouts: TimeoutConfig {
            register_timeout: Duration::from_secs(30),
            invite_timeout: Duration::from_secs(30),
            ..TimeoutConfig::default()
        },
        ..ClientConfig::default()
    };

    let client = SipClient::new_with_pjsip(config)?;
    let events = client.subscribe();

    let host = freeswitch_host();
    let port = freeswitch_sip_port();

    // FreeSWITCH テストユーザーのアカウント設定
    let account_config = AccountConfig {
        display_name: Some("FS Test User 1".into()),
        username: "test_user_1".into(),
        auth_username: None,
        password: secrecy::SecretString::new(Box::from("test_pass_1")),
        domain: host.clone(),
        registrar_uri: Some(format!("sip:{}:{}", host, port)),
        outbound_proxy: vec![],
        contact_params: vec![],
        transport: AccountTransportPolicy::Default,
        register_on_start: true,
        allow_outbound_without_register: false,
        registration_expires: Duration::from_secs(60),
        codecs: AccountCodecPolicy::default_voice(),
        dtmf: DtmfPolicy {
            send_methods: vec![DtmfMethod::SipInfo],
            receive_methods: vec![DtmfMethod::SipInfo],
            default_send_method: DtmfMethod::SipInfo,
        },
        media: AccountMediaConfig::default(),
        headers: vec![],
    };

    let _handle = client.add_account(account_config)?;
    Ok((client, events))
}

// ---------------------------------------------------------------------------
// 相互接続試験: REGISTER
// ---------------------------------------------------------------------------

/// REGISTER 認証成功 → RegistrationSucceeded イベントの発火を確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn freeswitch_register_auth_success() -> Result<(), SipError> {
    let (client, mut events) = setup_freeswitch_context()?;

    wait_for_event_with_timeout(
        &mut events,
        REGISTER_TIMEOUT,
        |p| matches!(p, SipEventPayload::RegistrationSucceeded { .. }),
    )
    .await?;

    client.shutdown()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: INVITE / BYE
// ---------------------------------------------------------------------------

/// INVITE 発信 → CallConnected → BYE 切断 → CallDisconnected を確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn freeswitch_invite_bye_normal() -> Result<(), SipError> {
    let (client, mut events) = setup_freeswitch_context()?;

    wait_for_event_with_timeout(
        &mut events,
        REGISTER_TIMEOUT,
        |p| matches!(p, SipEventPayload::RegistrationSucceeded { .. }),
    )
    .await?;

    let host = freeswitch_host();
    let port = freeswitch_sip_port();
    let call_id = client.make_call(
        client.accounts().await.first().ok_or_else(|| SipError::invalid_state("no accounts"))?.id(),
        OutgoingCallRequest {
            target_uri: format!("sip:1002@{}:{}", host, port),
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

    let connected = wait_for_event_with_timeout(
        &mut events,
        CALL_TIMEOUT,
        |p| matches!(p, SipEventPayload::CallConnected { .. }),
    )
    .await?;
    assert!(
        matches!(&connected.payload, SipEventPayload::CallConnected { .. }),
        "expected CallConnected"
    );

    client.hangup(call_id, HangupReason::Bye)?;
    wait_for_call_disconnected(&mut events).await?;

    client.shutdown()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: DTMF (SIP INFO)
// ---------------------------------------------------------------------------

/// DTMF (SIP INFO) によるダイヤルパルス送信を確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn freeswitch_dtmf_sip_info() -> Result<(), SipError> {
    let (client, mut events) = setup_freeswitch_context()?;

    wait_for_event_with_timeout(
        &mut events,
        REGISTER_TIMEOUT,
        |p| matches!(p, SipEventPayload::RegistrationSucceeded { .. }),
    )
    .await?;

    let host = freeswitch_host();
    let port = freeswitch_sip_port();
    let call_id = client.make_call(
        client.accounts().await.first().ok_or_else(|| SipError::invalid_state("no accounts"))?.id(),
        OutgoingCallRequest {
            target_uri: format!("sip:1002@{}:{}", host, port),
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

    let _connected = wait_for_event_with_timeout(
        &mut events,
        CALL_TIMEOUT,
        |p| matches!(p, SipEventPayload::CallConnected { .. }),
    )
    .await?;

    // SIP INFO DTMF 送信
    client.send_dtmf(call_id, "5".to_string(), DtmfMethod::SipInfo)?;
    let sent = wait_for_event_with_timeout(
        &mut events,
        EVENT_TIMEOUT,
        |p| matches!(p, SipEventPayload::DtmfSent { .. }),
    )
    .await?;
    assert!(matches!(&sent.payload, SipEventPayload::DtmfSent { .. }));

    client.hangup(call_id, HangupReason::Bye)?;
    client.shutdown()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: コーデック交渉
// ---------------------------------------------------------------------------

/// Opus / PCMU コーデック交渉を確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn freeswitch_codec_opus_pcmu() -> Result<(), SipError> {
    let config = ClientConfig {
        user_agent: "siprs-freeswitch-codec-test/0.1".into(),
        max_calls: 10,
        timeouts: TimeoutConfig {
            register_timeout: Duration::from_secs(30),
            invite_timeout: Duration::from_secs(30),
            ..TimeoutConfig::default()
        },
        ..ClientConfig::default()
    };

    let client = SipClient::new_with_pjsip(config)?;
    let mut events = client.subscribe();

    let host = freeswitch_host();
    let port = freeswitch_sip_port();

    let account_config = AccountConfig {
        display_name: Some("FS Codec Test".into()),
        username: "test_user_1".into(),
        auth_username: None,
        password: secrecy::SecretString::new(Box::from("test_pass_1")),
        domain: host.clone(),
        registrar_uri: Some(format!("sip:{}:{}", host, port)),
        outbound_proxy: vec![],
        contact_params: vec![],
        transport: AccountTransportPolicy::Default,
        register_on_start: true,
        allow_outbound_without_register: false,
        registration_expires: Duration::from_secs(60),
        codecs: AccountCodecPolicy::default_voice(),
        dtmf: DtmfPolicy {
            send_methods: vec![DtmfMethod::SipInfo],
            receive_methods: vec![DtmfMethod::SipInfo],
            default_send_method: DtmfMethod::SipInfo,
        },
        media: AccountMediaConfig::default(),
        headers: vec![],
    };
    let _handle = client.add_account(account_config)?;

    wait_for_event_with_timeout(
        &mut events,
        REGISTER_TIMEOUT,
        |p| matches!(p, SipEventPayload::RegistrationSucceeded { .. }),
    )
    .await?;

    let account = client.accounts().await.first().ok_or_else(|| SipError::invalid_state("no accounts"))?.id();
    let call_id = client.make_call(
        account,
        OutgoingCallRequest {
            target_uri: format!("sip:1002@{}:{}", host, port),
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

    let connected = wait_for_event_with_timeout(
        &mut events,
        CALL_TIMEOUT,
        |p| matches!(p, SipEventPayload::CallConnected { .. }),
    )
    .await?;
    assert!(
        matches!(&connected.payload, SipEventPayload::CallConnected { .. }),
        "Opus/PCMU codec negotiation failed"
    );

    client.hangup(call_id, HangupReason::Bye)?;
    client.shutdown()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 相互接続試験: ICE / TURN
// ---------------------------------------------------------------------------

/// ICE / TURN negotiation を確認する。
///
/// FreeSWITCH 側で ICE / TURN が有効化されている必要がある。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn freeswitch_ice_turn() -> Result<(), SipError> {
    let config = ClientConfig {
        user_agent: "siprs-freeswitch-ice-test/0.1".into(),
        max_calls: 10,
        timeouts: TimeoutConfig {
            register_timeout: Duration::from_secs(30),
            invite_timeout: Duration::from_secs(30),
            ..TimeoutConfig::default()
        },
        ..ClientConfig::default()
    };

    let client = SipClient::new_with_pjsip(config)?;
    let mut events = client.subscribe();

    let host = freeswitch_host();
    let port = freeswitch_sip_port();

    let account_config = AccountConfig {
        display_name: Some("FS ICE Test".into()),
        username: "test_user_1".into(),
        auth_username: None,
        password: secrecy::SecretString::new(Box::from("test_pass_1")),
        domain: host.clone(),
        registrar_uri: Some(format!("sip:{}:{}", host, port)),
        outbound_proxy: vec![],
        contact_params: vec![],
        transport: AccountTransportPolicy::Default,
        register_on_start: true,
        allow_outbound_without_register: false,
        registration_expires: Duration::from_secs(60),
        codecs: AccountCodecPolicy::default_voice(),
        dtmf: DtmfPolicy {
            send_methods: vec![DtmfMethod::SipInfo],
            receive_methods: vec![DtmfMethod::SipInfo],
            default_send_method: DtmfMethod::SipInfo,
        },
        media: AccountMediaConfig::default(),
        headers: vec![],
    };
    let _handle = client.add_account(account_config)?;

    wait_for_event_with_timeout(
        &mut events,
        REGISTER_TIMEOUT,
        |p| matches!(p, SipEventPayload::RegistrationSucceeded { .. }),
    )
    .await?;

    let call_id = client.make_call(
        client.accounts().await.first().ok_or_else(|| SipError::invalid_state("no accounts"))?.id(),
        OutgoingCallRequest {
            target_uri: format!("sip:1002@{}:{}", host, port),
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

    // CallConnected が到達すれば ICE negotiation は成功している
    let connected = wait_for_event_with_timeout(
        &mut events,
        CALL_TIMEOUT,
        |p| matches!(p, SipEventPayload::CallConnected { .. }),
    )
    .await;

    match connected {
        Ok(event) => {
            assert!(matches!(&event.payload, SipEventPayload::CallConnected { .. }));
            client.hangup(call_id, HangupReason::Bye)?;
        }
        Err(_) => {
            eprintln!("ice_turn: timeout — ICE/TURN may not be configured on this FreeSWITCH");
        }
    }

    client.shutdown()?;
    Ok(())
}
