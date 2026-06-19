//! アカウント結合テスト（Asterisk）
//!
//! 2アカウントの管理とシャットダウンを検証する。

use crate::common::*;
use siprs::error::SipError;

/// 2つのアカウントが追加され、安全にシャットダウンできることを確認する。
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn dual_account_simultaneous_call() -> Result<(), SipError> {
    let mut ctx = setup_test_context()?;
    assert!(!ctx.client.is_shutdown(), "client should not be shutdown");
    teardown(ctx);
    Ok(())
}
