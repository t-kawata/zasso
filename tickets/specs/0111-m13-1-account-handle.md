---
ticket_id: 111
title: "M13-1: SipAccountHandle — アカウント単位操作（register/unregister/registration_state/update_config）"
slug: m13-1-account-handle
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0111-m13-1-account-handle/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0111-m13-1-account-handle/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0111-m13-1-account-handle/review.md
---

# M13-1: `SipAccountHandle` — アカウント単位操作

## Summary

アカウント単位の操作を提供する `SipAccountHandle` にメソッドを追加する。`register`, `unregister`, `set_registration_enabled`, `registration_state`, `update_config` を実装し、各操作は reactor 経由で実行される。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§8.4)

## Background

### RFC 準拠

RFC §8.4「利用者は SipAccountHandle を通じてアカウント単位操作を行う」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M12-1 (#104) | `SipClient` 構造体 / `ClientInner` |
| M12-4 (#108) | `add_account()` / `remove_account()` / `account()` / `accounts()` |
| M12-5 (#109) | `shutdown()` / `is_shutdown()` |
| M12-6 (#110) | `#[tracing::instrument]` 計装 |
| M11-1 (#100) | `RuntimeCommand::SetRegistration` / `RuntimeCommand::UpdateAccountConfig` |
| M9-1 (#85) | `RegistrationState` 遷移ロジック |
| M8-1 (#82) | `AccountEntry` 構造体 |

### 設計判断

- **`SipAccountHandle` の配置**: 現在 `client.rs` に定義。M13-1 でメソッド追加するにあたり、構造体定義を `client.rs` に残し `impl` ブロックも同ファイルに追記する（関連性が高いため）
- **`registration_state()` は RTT 不要**: `self.client.inner.state.blocking_read()` で state の snapshot を直接読み取る。reactor 往復は不要
- **`register()` / `unregister()` / `update_config()` は RTT 必須**: `block_on` + `send_and_wait` で reactor 経由で実行
- **`[::STUB::] 解決**: 既存の `SipAccountHandle::client` フィールドの `#[allow(dead_code)]` がこのチケットで使用開始されるため、マーカーを除去する

## Scope

### `crates/siprs/src/client.rs`（修正）

`SipAccountHandle` に以下を実装：

```rust
impl SipAccountHandle {
    pub fn id(&self) -> AccountId;
    pub fn register(&self) -> Result<(), SipError>;
    pub fn unregister(&self) -> Result<(), SipError>;
    pub fn set_registration_enabled(&self, enabled: bool) -> Result<(), SipError>;
    pub fn registration_state(&self) -> Result<RegistrationState, SipError>;
    pub fn update_config(&self, patch: AccountConfigPatch) -> Result<(), SipError>;
}
```

###  `[::STUB::]` 除去

`SipAccountHandle::client` の `#[allow(dead_code)]` + `[::STUB::]` マーカーを除去する（このチケットでメソッド内で使用開始）。

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_account_register` | `register()` → MockBackend 経由で `SetRegistration { enabled: true }` 発行確認 |
| 2 | `test_account_unregister` | `unregister()` → `SetRegistration { enabled: false }` 発行確認 |
| 3 | `test_registration_state` | `registration_state()` が state から値を読み取れること |
| 4 | `test_update_config` | `UpdateAccountConfig` コマンドが送信されること |
| 5 | `test_account_dead_after_removal` | 削除済みアカウントで `AccountNotFound` |
| 6 | `test_account_shutdown` | shutdown 後の操作で `ShutdownInProgress` |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS
- [ ] `SipAccountHandle` の 6 メソッドが全て実装済み
- [ ] `[::STUB::]` マーカーが適切に除去されている
- [ ] `#[allow(dead_code)]` が不必要に残っていない

## Notes

### M13 マイルストーン

```text
M13-1 (#111) ← 本チケット | M13-2 (#112) 未着手
```
