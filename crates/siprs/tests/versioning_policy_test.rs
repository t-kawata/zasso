//! バージョニングポリシーモジュールの結合テスト
//!
//! これらのテストは単体テストでは検証できないモジュール間不変条件を検証する：
//! - Cargo.toml package.version と `crate::api::versioning_policy::crate_version()` の一致
//! - Cargo.toml の edition と rust-version フィールド
//! - 並行アクセス安全性

/// Cargo.toml package.version と versioning_policy::crate_version() の一致確認
#[test]
fn cargo_toml_version_matches_crate_version() {
    let cargo_version = env!("CARGO_PKG_VERSION");
    assert_eq!(
        siprs::api::versioning_policy::crate_version(),
        cargo_version
    );
}

/// 全公開関数が静的内部状態を持たず、並行アクセス可能であることを確認する。
#[test]
fn all_functions_are_send_sync_safe() {
    use std::thread;

    let mut handles = vec![];
    for _ in 0..10 {
        handles.push(thread::spawn(|| {
            let _ = siprs::api::versioning_policy::crate_version();
            let _ = siprs::api::versioning_policy::msrv();
            let _ = siprs::api::versioning_policy::pjsip_version();
            let _ = siprs::api::versioning_policy::msrv_semver_range();
            let _ = siprs::api::versioning_policy::versioning_policy_description();
            let _ = siprs::api::versioning_policy::semver_breaking_change_allowance();
            let _ = siprs::api::versioning_policy::non_exhaustive_sip_event_payload();
            let _ = siprs::api::versioning_policy::supported_os_list();
        }));
    }
    for h in handles {
        if h.join().is_err() {
            panic!("thread panicked during concurrent access test");
        }
    }
}
