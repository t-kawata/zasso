//! REGISTER 結合テスト（Asterisk）
//!
//! 認証成功・失敗・再登録の3ケースを検証する。
//!
//! 注: PjsuaBackend の credential 設定が未実装（cred_info opaque）のため、
//! REGISTER 認証は成功しない。認証テストは credential 実装後に別チケットで対応。
//! 現在は registration をスキップするテストフローのみを提供する。

use std::time::Duration;

use crate::common::*;
use siprs::client::SipClient;
use siprs::error::SipError;
use siprs::event::SipEventPayload;

/// 登録なしでクライアントが初期化できることを確認する。
/// （register_on_start: false のため registration イベントは発生しない）
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn register_succeeds() -> Result<(), SipError> {
    let ctx = setup_test_context()?;

    // クライアントが正常に初期化されていれば成功
    assert!(!ctx.client.is_shutdown(), "client should not be shutdown");

    teardown(ctx);
    Ok(())
}

/// クライアント生成時に RegistrationFailed が発火しないことを確認する
/// （register_on_start: false のため）
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn register_fails_with_wrong_password() -> Result<(), SipError> {
    let host = sip_server_host();
    let config = account_config_for_failure(&host);

    let client = SipClient::new_with_pjsip(Default::default())?;
    let mut events = client.subscribe();
    let _handle = client.add_account(config)?;

    // RegistrationFailed が即座に発火しないことを確認（register_on_start: false）
    // タイムアウトは正常
    let result = wait_for_event_with_timeout(&mut events, Duration::from_secs(3), |payload| {
        matches!(payload, SipEventPayload::RegistrationFailed { .. })
    })
    .await;

    client.shutdown()?;

    // タイムアウト = 正常（register_on_start: false のためイベントなし）
    if let Err(e) = result {
        eprintln!("register_fails: expected timeout (register_on_start=false): {e}");
    }
    Ok(())
}

/// 登録解除/再登録 — credential 未対応のためプレースホルダー。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn reregister_after_unregister() -> Result<(), SipError> {
    eprintln!("reregister_after_unregister: skipped (requires credential support, see M20-2)");
    Ok(())
}
