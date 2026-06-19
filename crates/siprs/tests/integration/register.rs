//! REGISTER 結合テスト（Asterisk）
//!
//! 認証成功・失敗・再登録の3ケースを検証する。

use crate::common::*;
use siprs::client::SipClient;
use siprs::error::SipError;
use siprs::event::SipEventPayload;

/// 正しい認証情報で REGISTER を実行し、`RegistrationSucceeded` が発火することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn register_succeeds() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;
    wait_for_registration(&mut ctx.events).await?;
    teardown(ctx);
    Ok(())
}

/// 誤ったパスワードで REGISTER を実行し、`RegistrationFailed` が発火することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn register_fails_with_wrong_password() -> Result<(), SipError> {
    let host = sip_server_host();
    let config = account_config_for_failure(&host);

    let client = SipClient::new_with_pjsip(Default::default())?;
    let mut events = client.subscribe();
    let _handle = client.add_account(config)?;

    let event = wait_for_event_with_timeout(&mut events, REGISTER_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::RegistrationFailed { .. })
    })
    .await?;

    assert!(
        matches!(&event.payload, SipEventPayload::RegistrationFailed { .. }),
        "expected RegistrationFailed"
    );

    client.shutdown()?;
    Ok(())
}

/// 登録解除後に再登録できることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn reregister_after_unregister() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;

    wait_for_registration(&mut ctx.events).await?;
    wait_for_registration(&mut ctx.events).await?;

    ctx.handle_1.unregister()?;
    wait_for_event_with_timeout(&mut ctx.events, REGISTER_TIMEOUT, |p| {
        matches!(p, SipEventPayload::UnregistrationSucceeded { .. })
    })
    .await?;

    ctx.handle_1.register()?;
    wait_for_registration(&mut ctx.events).await?;

    teardown(ctx);
    Ok(())
}
