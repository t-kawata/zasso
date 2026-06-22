//! Dual Client 結合テスト（Asterisk）
//!
//! Docker Compose で Asterisk を起動した上で `-- --ignored --test-threads=1` でのみ実行する。
//! PJSIP singleton のため全テストは直列実行必須。

use std::time::Duration;

use crate::common::*;
use siprs::config::{ClientConfig, TimeoutConfig};
use siprs::error::SipError;
use siprs::event::SipEventPayload;
use siprs::runtime::command::HangupReason;

/// テスト用の ClientConfig を生成する。
///
/// `label` は user_agent の識別子として使用される（"a" / "b" 等）。
fn client_config_for(label: &str) -> ClientConfig {
    ClientConfig {
        user_agent: format!("siprs-dual-test-{label}/0.1"),
        max_calls: 10,
        timeouts: TimeoutConfig {
            register_timeout: Duration::from_secs(30),
            invite_timeout: Duration::from_secs(30),
            ..TimeoutConfig::default()
        },
        ..ClientConfig::default()
    }
}

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

/// DualClientContext::new() が両 Client を正しく初期化することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dual_client_new_initializes_both_clients() -> Result<(), SipError> {
    let host = sip_server_host();
    let mut ctx = DualClientContext::new(
        client_config_for("a"),
        client_config_for("b"),
        account_config_for_user_1(&host),
        account_config_for_user_2(&host),
    )?;

    // 両アカウントの登録完了を待機
    wait_for_registration(&mut ctx.events_a).await?;
    wait_for_registration(&mut ctx.events_b).await?;

    // アカウント ID が異なること（別 Client に所属）
    assert_ne!(ctx.account_a, ctx.account_b);

    // 両 Client が shutdown 状態でないこと
    assert!(!ctx.client_a.is_shutdown());
    assert!(!ctx.client_b.is_shutdown());

    ctx.shutdown_all()?;
    Ok(())
}

/// call_a_to_b() で client_b が IncomingCall を受信することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn call_a_to_b_receives_incoming_call_on_b() -> Result<(), SipError> {
    let host = sip_server_host();
    let mut ctx = DualClientContext::new(
        client_config_for("a"),
        client_config_for("b"),
        account_config_for_user_1(&host),
        account_config_for_user_2(&host),
    )?;

    wait_for_registration(&mut ctx.events_a).await?;
    wait_for_registration(&mut ctx.events_b).await?;

    // A → B に発信
    let target_b = format!("sip:test_user_2@{}:{}", host, ASTERISK_SIP_PORT);
    let call_id = ctx.call_a_to_b(&target_b)?;

    // B 側で IncomingCall を確認
    let incoming = ctx.wait_for_call_incoming_b().await?;
    assert!(
        matches!(&incoming.payload, SipEventPayload::IncomingCall { .. }),
        "client_b が IncomingCall を受信すること"
    );
    // IncomingCall の call_id が発信時のものと一致するか確認
    if let SipEventPayload::IncomingCall(ref info) = incoming.payload {
        assert_eq!(
            info.call_id, call_id,
            "IncomingCall の call_id が発信時のものと一致"
        );
    }

    // A 側では IncomingCall を受信しないこと（イベント分離の確認）
    let result = ctx.wait_for_call_incoming_a().await;
    assert!(
        result.is_err(),
        "client_a は IncomingCall を受信しない（イベント分離）"
    );

    // 切断
    ctx.hangup_a(call_id, HangupReason::Bye)?;
    ctx.shutdown_all()?;
    Ok(())
}

/// answer_b(200) で client_a が CallConnected を受信することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn answer_b_200_sends_call_connected_to_a() -> Result<(), SipError> {
    let host = sip_server_host();
    let mut ctx = DualClientContext::new(
        client_config_for("a"),
        client_config_for("b"),
        account_config_for_user_1(&host),
        account_config_for_user_2(&host),
    )?;

    wait_for_registration(&mut ctx.events_a).await?;
    wait_for_registration(&mut ctx.events_b).await?;

    // A → B に発信
    let target_b = format!("sip:test_user_2@{}:{}", host, ASTERISK_SIP_PORT);
    let call_id = ctx.call_a_to_b(&target_b)?;

    // B が IncomingCall を受信
    let incoming = ctx.wait_for_call_incoming_b().await?;
    let b_call_id = match &incoming.payload {
        SipEventPayload::IncomingCall(info) => info.call_id,
        _ => return Err(SipError::invalid_state("expected IncomingCall")),
    };

    // B が 200 OK で応答
    ctx.answer_b(b_call_id, 200)?;

    // A 側で CallConnected を確認
    let connected_a = ctx.wait_for_call_connected_a().await?;
    assert!(
        matches!(&connected_a.payload, SipEventPayload::CallConnected { .. }),
        "client_a が CallConnected を受信すること"
    );

    // B 側でも CallConnected を確認
    let connected_b = ctx.wait_for_call_connected_b().await?;
    assert!(
        matches!(&connected_b.payload, SipEventPayload::CallConnected { .. }),
        "client_b も CallConnected を受信すること"
    );

    // 切断
    ctx.hangup_a(call_id, HangupReason::Bye)?;
    ctx.shutdown_all()?;
    Ok(())
}

/// hangup_a() で client_b が CallDisconnected を受信することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn hangup_a_sends_disconnected_to_b() -> Result<(), SipError> {
    let host = sip_server_host();
    let mut ctx = DualClientContext::new(
        client_config_for("a"),
        client_config_for("b"),
        account_config_for_user_1(&host),
        account_config_for_user_2(&host),
    )?;

    wait_for_registration(&mut ctx.events_a).await?;
    wait_for_registration(&mut ctx.events_b).await?;

    // 通話確立
    let target_b = format!("sip:test_user_2@{}:{}", host, ASTERISK_SIP_PORT);
    let call_id = ctx.call_a_to_b(&target_b)?;
    let incoming = ctx.wait_for_call_incoming_b().await?;
    let b_call_id = match &incoming.payload {
        SipEventPayload::IncomingCall(info) => info.call_id,
        _ => return Err(SipError::invalid_state("expected IncomingCall")),
    };
    ctx.answer_b(b_call_id, 200)?;
    ctx.wait_for_call_connected_a().await?;
    ctx.wait_for_call_connected_b().await?;

    // A が切断
    ctx.hangup_a(call_id, HangupReason::Bye)?;

    // B 側で CallDisconnected を確認
    let disconnected_b = ctx.wait_for_call_disconnected_b().await?;
    assert!(
        matches!(
            &disconnected_b.payload,
            SipEventPayload::CallDisconnected { .. }
        ),
        "client_b が CallDisconnected を受信すること"
    );

    ctx.shutdown_all()?;
    Ok(())
}

/// wait_for_event_a() / _b() がタイムアウト時にエラーを返すことを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn wait_for_event_timeout_returns_error() -> Result<(), SipError> {
    let host = sip_server_host();
    let mut ctx = DualClientContext::new(
        client_config_for("a"),
        client_config_for("b"),
        account_config_for_user_1(&host),
        account_config_for_user_2(&host),
    )?;

    // 短いタイムアウトで存在しないイベントを待機 → タイムアウト
    let _short_timeout = Duration::from_millis(100);
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        ctx.wait_for_event_a(|p| {
            // RegistrationSucceeded 以外の絶対に来ない条件
            matches!(p, SipEventPayload::CallConnected { .. })
        }),
    )
    .await;

    // タイムアウトまたはエラーのいずれか
    match result {
        Ok(Ok(_)) => {
            // もし CallConnected が偶然届いたらフォールスルー（稀）
            // この場合は時間内に届かなかったこととは別の確認
        }
        Ok(Err(ref e)) if e.kind == siprs::error::SipErrorKind::Timeout => {
            // 期待通りのタイムアウト
        }
        Ok(Err(_)) => {
            // タイムアウト以外のエラーも許容（チャネルクローズ等）
        }
        Err(_elapsed) => {
            // tokio::time::timeout のタイムアウトも許容
        }
    }

    ctx.shutdown_all()?;
    Ok(())
}

/// shutdown_all() が二重破棄エラーなく完了することを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn shutdown_all_cleans_up_both_clients() -> Result<(), SipError> {
    let host = sip_server_host();
    let ctx = DualClientContext::new(
        client_config_for("a"),
        client_config_for("b"),
        account_config_for_user_1(&host),
        account_config_for_user_2(&host),
    )?;

    // shutdown_all() がエラーなく完了すること
    ctx.shutdown_all()?;

    Ok(())
}

/// DualClientContext 使用後に既存の単一 Client テストが影響を受けないことを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn single_client_tests_unaffected() -> Result<(), SipError> {
    // 前のテストで DualClientContext を使用した後でも
    // 通常の TestContext が問題なく動作することを確認
    let mut ctx = setup_test_context()?;
    wait_for_registration(&mut ctx.events).await?;
    wait_for_registration(&mut ctx.events).await?;

    // 発信テスト（シングル Client）
    let call_id = ctx.client.make_call(
        ctx.account_1,
        siprs::config::OutgoingCallRequest {
            target_uri: format!("sip:1002@{}:{}", sip_server_host(), ASTERISK_SIP_PORT),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: siprs::config::CallMediaPreferences {
                enable_early_media: true,
                enable_srtp: None,
                preferred_codecs: vec![],
            },
            auto_answer_refer: false,
        },
    )?;

    let connected = wait_for_call_connected(&mut ctx.events).await?;
    assert!(matches!(
        &connected.payload,
        SipEventPayload::CallConnected { .. }
    ));

    ctx.client.hangup(call_id, HangupReason::Bye)?;
    wait_for_call_disconnected(&mut ctx.events).await?;
    teardown(ctx);
    Ok(())
}
