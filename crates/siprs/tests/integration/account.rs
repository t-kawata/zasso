//! アカウント結合テスト（Asterisk）
//!
//! unregister/re-register および 2アカウント同時通話を検証する。

use crate::common::*;
use siprs::config::{CallMediaPreferences, Codec, OutgoingCallRequest};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

/// 登録解除と再登録のライフサイクルを検証する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn unregister_and_reregister() -> Result<(), SipError> {
    let ctx = setup_test_context()?;
    let mut events = ctx.events.resubscribe();

    // 初回登録成功を待機
    wait_for_registration(&mut events).await?;
    // アカウント2の登録を消費
    wait_for_registration(&mut events).await?;

    // アカウント1を登録解除
    let account1 = ctx.client.account(ctx.account_1)?;
    account1.unregister()?;

    // UnregistrationSucceeded を待機
    wait_for_event_with_timeout(&mut events, REGISTER_TIMEOUT, |payload| {
        matches!(payload, SipEventPayload::UnregistrationSucceeded { .. })
    })
    .await?;

    // 再登録
    account1.register()?;

    // RegistrationSucceeded を待機
    wait_for_registration(&mut events).await?;

    teardown(ctx);
    Ok(())
}

/// 2つのアカウントが独立して動作することを検証する。
///
/// アカウント1 → アカウント2 に発信し、通話確立後に両方の登録状態を確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dual_account_simultaneous_call() -> Result<(), SipError> {
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

    // CallConnected を待機
    wait_for_call_connected(&mut events).await?;

    // アカウントの状態を確認
    let state_1 = ctx.client.account(ctx.account_1)?.registration_state()?;
    assert!(
        state_1.is_registered(),
        "account_1 should be registered, got {:?}",
        state_1
    );

    let state_2 = ctx.client.account(ctx.account_2)?.registration_state()?;
    assert!(
        state_2.is_registered(),
        "account_2 should be registered, got {:?}",
        state_2
    );

    // 切断
    ctx.client.hangup(call_id, HangupReason::Bye)?;
    wait_for_call_disconnected(&mut events).await?;

    teardown(ctx);
    Ok(())
}
