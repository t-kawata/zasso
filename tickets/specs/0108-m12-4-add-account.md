---
ticket_id: 108
title: "M12-4: add_account() / remove_account() / account() / accounts()"
slug: m12-4-add-account
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0108-m12-4-add-account/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0108-m12-4-add-account/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0108-m12-4-add-account/review.md
---

# M12-4: `add_account()` / `remove_account()` / `account()` / `accounts()`

## Summary

アカウントライフサイクル管理の公開APIを `SipClient` に追加する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§8.3, §8.4)

## Background

### RFC 準拠

RFC §8.3/§8.4 SipClient API / SipAccountHandle API。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M12-1 (#104) | `SipClient` / `ClientInner` |
| M11-1 (#100) | `RuntimeCommand::AddAccount` / `RemoveAccount` |
| M2-2 (#63) | `AccountConfig` |

### 設計判断

- **`SipAccountHandle` は軽量スケルトン**: M13-1 で正式定義されるまで、`AccountId` を保持するだけの最小構造体を同一ファイルに定義
- **`add_account` は同期的**: `block_on` で reactor からの応答を待つ
- **`accounts()` は snapshots**: `ClientState` から全アカウントの一覧を取得

## Scope

### `crates/siprs/src/client.rs`（追記）

```rust
/// SIP アカウントハンドル（M13-1 で拡張予定）。
#[derive(Clone, Debug)]
pub struct SipAccountHandle {
    pub(crate) id: AccountId,
    pub(crate) client: SipClient,
}

impl SipClient {
    /// SIP アカウントを追加する。
    pub fn add_account(&self, config: AccountConfig) -> Result<SipAccountHandle, SipError>;

    /// SIP アカウントを削除する。
    pub fn remove_account(&self, account_id: AccountId) -> Result<(), SipError>;

    /// アカウントハンドルを取得する。
    pub fn account(&self, account_id: AccountId) -> Result<SipAccountHandle, SipError>;

    /// 全アカウントのハンドル一覧を返す。
    pub fn accounts(&self) -> Vec<SipAccountHandle>;
}
```

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_add_account_valid` | 有効 config → Ok + handle |
| 2 | `test_add_account_invalid_config` | 無効 config → InvalidConfig |
| 3 | `test_accounts_snapshot` | add → accounts() に含まれる |
| 4 | `test_account_not_found` | 存在しない ID → AccountNotFound |

## Non-scope

- `SipAccountHandle` の完全実装 — M13-1
- `make_call` / `hangup` 等 — M13-2

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 314 + 新規 4）
- [ ] `SipAccountHandle` がスケルトンとして定義されていること
- [ ] 全テストで `unwrap()` 不使用

## Notes

### SipAccountHandle のスケルトン

`SipAccountHandle` は M13-1 で正式に拡張されるまで `AccountId` のみを保持する最小構造体として定義する。

### M12 マイルストーン

```text
M12-1 (#104): SipClient ✅
M12-2 (#105): SipClient::new() ✅
M12-3 (#106): subscribe / subscribe_raw_sip / subscribe_account ✅
M12-4 (#108): add_account / remove_account / account / accounts ← 本チケット
M12-5 (#109): SipClient::shutdown()
M12-6 (#110): tracing instrument
```
