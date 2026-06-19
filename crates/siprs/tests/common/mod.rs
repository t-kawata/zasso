//! # 結合テスト共通モジュール
//!
//! SIP サーバ（Asterisk）との結合テストに必要な TestContext と
//! ヘルパー関数を提供する。
//!
//! 全テスト関数は `#[ignore]` を付与し、Docker Compose で Asterisk を
//! 起動した上で `-- --ignored --test-threads=1` でのみ実行する。

use std::time::Duration;

use secrecy::SecretString;
use siprs::client::{SipAccountHandle, SipClient};
use siprs::config::{
    AccountCodecPolicy, AccountConfig, AccountMediaConfig, AccountTransportPolicy, ClientConfig,
    DtmfMethod, DtmfPolicy, TimeoutConfig,
};
use siprs::error::SipError;
use siprs::event::{SipEvent, SipEventPayload};
use siprs::util::id::AccountId;
use tokio::sync::broadcast;

/// テストコンテキスト。
///
/// `setup_test_context()` で生成し、テスト終了時に `teardown()` で解放する。
pub struct TestContext {
    /// SipClient インスタンス（PjsuaBackend 駆動）。
    pub client: SipClient,
    /// 制御系イベントの購読レシーバー。
    pub events: broadcast::Receiver<SipEvent>,
    /// テスト用アカウント1のハンドル。
    pub account_1: AccountId,
    /// テスト用アカウント2のハンドル（dual account テスト用）。
    pub account_2: AccountId,
    /// テスト用アカウント1の SipAccountHandle（blocking_read 回避のため）。
    pub handle_1: SipAccountHandle,
    /// テスト用アカウント2の SipAccountHandle（同上）。
    pub handle_2: SipAccountHandle,
}

// ---------------------------------------------------------------------------
// 設定定数
// ---------------------------------------------------------------------------

/// イベント待機の最大タイムアウト。
pub const EVENT_TIMEOUT: Duration = Duration::from_secs(10);

/// アカウント登録完了待機の最大タイムアウト。
pub const REGISTER_TIMEOUT: Duration = Duration::from_secs(15);

/// 通話確立待機の最大タイムアウト。
pub const CALL_TIMEOUT: Duration = Duration::from_secs(20);

// ---------------------------------------------------------------------------
// 公開ヘルパー関数
// ---------------------------------------------------------------------------

/// SIP サーバのホストアドレスを環境変数から取得する。
///
/// `SIP_SERVER_HOST` 環境変数が設定されていればその値、未設定なら `127.0.0.1` を使用する。
pub fn sip_server_host() -> String {
    std::env::var("SIP_SERVER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string())
}

/// Asterisk の SIP ポート（pjsip.conf で設定した値）。
pub const ASTERISK_SIP_PORT: u16 = 5060;

/// 結合テスト用の SipClient をセットアップする。
///
/// 手順:
/// 1. `SIP_SERVER_HOST` 環境変数からサーバアドレスを取得
/// 2. `ClientConfig::default()` をベースに UDP トランスポートを設定
/// 3. `PjsuaBackend` を注入して `SipClient` を生成
/// 4. テスト用アカウントを2つ登録
pub fn setup_test_context() -> Result<TestContext, SipError> {
    let host = sip_server_host();

    let config = ClientConfig {
        user_agent: "siprs-integration-test/0.1".into(),
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

    // アカウント1: test_user_1（認証成功 / 単一アカウント通話 / DTMF）
    let account_config_1 = account_config_for_user_1(&host);
    let handle_1 = client.add_account(account_config_1)?;
    let account_1 = handle_1.id();

    // アカウント2: test_user_2（dual account テスト用）
    let account_config_2 = account_config_for_user_2(&host);
    let handle_2 = client.add_account(account_config_2)?;
    let account_2 = handle_2.id();

    Ok(TestContext {
        client,
        events,
        account_1,
        account_2,
        handle_1,
        handle_2,
    })
}

/// SipClient をシャットダウンしリソースを解放する。
pub fn teardown(ctx: TestContext) {
    let _ = ctx.client.shutdown();
}

/// 指定したアカウントの `AccountConfig` を生成する（Asterisk 1001 用）。
pub fn account_config_for_user_1(host: &str) -> AccountConfig {
    AccountConfig {
        display_name: Some("Test User 1".into()),
        username: "test_user_1".into(),
        auth_username: None,
        password: SecretString::new(Box::from("test_pass_1")),
        domain: host.to_string(),
        registrar_uri: Some(format!("sip:{}:{}", host, ASTERISK_SIP_PORT)),
        outbound_proxy: vec![],
        contact_params: vec![],
        transport: AccountTransportPolicy::Default,
        register_on_start: true,
        allow_outbound_without_register: false,
        registration_expires: Duration::from_secs(60),
        codecs: AccountCodecPolicy::default_voice(),
        dtmf: DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        },
        media: AccountMediaConfig::default(),
        headers: vec![],
    }
}

/// 指定したアカウントの `AccountConfig` を生成する（Asterisk test_user_2 用）。
pub fn account_config_for_user_2(host: &str) -> AccountConfig {
    AccountConfig {
        display_name: Some("Test User 2".into()),
        username: "test_user_2".into(),
        auth_username: None,
        password: SecretString::new(Box::from("test_pass_2")),
        domain: host.to_string(),
        registrar_uri: Some(format!("sip:{}:{}", host, ASTERISK_SIP_PORT)),
        outbound_proxy: vec![],
        contact_params: vec![],
        transport: AccountTransportPolicy::Default,
        register_on_start: true,
        allow_outbound_without_register: false,
        registration_expires: Duration::from_secs(60),
        codecs: AccountCodecPolicy::default_voice(),
        dtmf: DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        },
        media: AccountMediaConfig::default(),
        headers: vec![],
    }
}

/// 認証失敗テスト用の誤った `AccountConfig` を生成する。
pub fn account_config_for_failure(host: &str) -> AccountConfig {
    AccountConfig {
        display_name: Some("Fail User".into()),
        username: "test_user_1".into(),
        auth_username: None,
        password: SecretString::new(Box::from("wrong_password")),
        domain: host.to_string(),
        registrar_uri: Some(format!("sip:{}:{}", host, ASTERISK_SIP_PORT)),
        outbound_proxy: vec![],
        contact_params: vec![],
        transport: AccountTransportPolicy::Default,
        register_on_start: true,
        allow_outbound_without_register: false,
        registration_expires: Duration::from_secs(60),
        codecs: AccountCodecPolicy::default_voice(),
        dtmf: DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        },
        media: AccountMediaConfig::default(),
        headers: vec![],
    }
}

/// イベントレシーバーから条件に合致するイベントを待機する。
///
/// `predicate` が `true` を返した最初のイベントを返す。
/// タイムアウト時は `SipError::Timeout` を返す。
#[allow(dead_code)]
pub async fn wait_for_event<F>(
    events: &mut broadcast::Receiver<SipEvent>,
    predicate: F,
) -> Result<SipEvent, SipError>
where
    F: Fn(&SipEventPayload) -> bool,
{
    wait_for_event_with_timeout(events, EVENT_TIMEOUT, predicate).await
}

/// 指定タイムアウト付きでイベントを待機する。
pub async fn wait_for_event_with_timeout<F>(
    events: &mut broadcast::Receiver<SipEvent>,
    timeout: Duration,
    predicate: F,
) -> Result<SipEvent, SipError>
where
    F: Fn(&SipEventPayload) -> bool,
{
    let deadline = tokio::time::Instant::now() + timeout;

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err(SipError::timeout("event wait timeout"));
        }

        match tokio::time::timeout(remaining, events.recv()).await {
            Ok(Ok(event)) if predicate(&event.payload) => return Ok(event),
            Ok(Ok(_)) => continue,
            Ok(Err(broadcast::error::RecvError::Closed)) => {
                return Err(SipError::channel_closed("event stream closed"));
            }
            Ok(Err(broadcast::error::RecvError::Lagged(count))) => {
                // 購読開始前に送信されたイベントをスキップ — 問題なし
                tracing::warn!(count, "event receiver lagged");
                continue;
            }
            Err(_elapsed) => {
                return Err(SipError::timeout("event wait timeout"));
            }
        }
    }
}

/// アカウントが `RegistrationSucceeded` を発火するまで待機する。
///
/// Docker NAT 環境では IP アドレス書き換えにより先に 404 が返されることがある。
/// その後の再 REGISTER 成功（200 OK）でも発火する。
pub async fn wait_for_registration(
    events: &mut broadcast::Receiver<SipEvent>,
) -> Result<SipEvent, SipError> {
    let deadline = tokio::time::Instant::now() + REGISTER_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err(SipError::timeout("registration wait timeout"));
        }

        match tokio::time::timeout(remaining, events.recv()).await {
            Ok(Ok(event)) => {
                if matches!(&event.payload, SipEventPayload::RegistrationSucceeded { .. }) {
                    return Ok(event);
                }
                // RegistrationFailed は IP 書き換え起因の可能性があるためスキップして継続待機
                if matches!(&event.payload, SipEventPayload::RegistrationFailed { .. }) {
                    continue;
                }
            }
            Ok(Err(broadcast::error::RecvError::Closed)) => {
                return Err(SipError::channel_closed("event stream closed"));
            }
            Ok(Err(broadcast::error::RecvError::Lagged(_))) => continue,
            Err(_) => return Err(SipError::timeout("registration wait timeout")),
        }
    }
}

/// 通話が確立されるまで待機する。
pub async fn wait_for_call_connected(
    events: &mut broadcast::Receiver<SipEvent>,
) -> Result<SipEvent, SipError> {
    wait_for_event_with_timeout(events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::CallConnected { .. })
    })
    .await
}

/// 通話切断イベントを待機する。
pub async fn wait_for_call_disconnected(
    events: &mut broadcast::Receiver<SipEvent>,
) -> Result<SipEvent, SipError> {
    wait_for_event_with_timeout(events, CALL_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::CallDisconnected { .. })
    })
    .await
}
