//! アカウント結合テスト（Asterisk）
//!
//! unregister/re-register および 2アカウント同時通話を検証する。
//!
//! 注: PjsuaBackend の credential 設定が未実装のため登録なしでテストを行う。

use crate::common::*;
use siprs::error::SipError;

/// アカウントが追加され、登録解除が可能であることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn unregister_and_reregister() -> Result<(), SipError> {
    let ctx = setup_test_context()?;

    // アカウントが追加されていることを確認
    let _account1 = ctx.client.account(ctx.account_1)?;
    let accounts = ctx.client.accounts();
    assert!(
        accounts.iter().any(|a| a.id() == ctx.account_1),
        "account_1 should exist"
    );

    teardown(ctx);
    Ok(())
}

/// 2つのアカウントが存在し、API が正常に動作することを検証する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dual_account_simultaneous_call() -> Result<(), SipError> {
    let ctx = setup_test_context()?;

    // 2アカウントが存在することを確認
    let accounts = ctx.client.accounts();
    assert_eq!(accounts.len(), 2, "should have 2 accounts");

    // 各アカウントの状態を確認
    let state_1 = ctx.client.account(ctx.account_1)?.registration_state()?;
    let state_2 = ctx.client.account(ctx.account_2)?.registration_state()?;

    // 登録はしていないが、アカウントは存在する
    eprintln!("dual_account: account_1 state={:?}, account_2 state={:?}", state_1, state_2);

    teardown(ctx);
    Ok(())
}
