---
ticket_id: 97
title: "M9-3: ClientState 管理 — 同時通話制約・shutdown 状態"
slug: m9-3-client-state-management
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0097-m9-3-client-state-management/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0097-m9-3-client-state-management/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0097-m9-3-client-state-management/review.md
---

# M9-3: `ClientState` 管理 — 同時通話制約・shutdown 状態

## Summary

`ClientState` に `max_calls` 上限強制、shutdown 状態管理、native_id 逆引きを追加する。全アカウント・通話の整合性を保証する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§18.2, §33)

## Background

### RFC 準拠

RFC §18.2「ClientConfig::max_calls を上限とする。アカウントごとの上限は未設定なら無制限だが、client 上限だけは強制する」。§33「状態の唯一正本は reactor thread が所有」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M8-1 (#92) | `ClientState` / `AccountEntry` / `CallEntry` — 拡張対象 |
| M2-1 (#62) | `ClientConfig::max_calls` — 上限値の取得元 |

### 設計判断

- **`src/runtime/state.rs`**: 既存の `ClientState` / `AccountEntry` / `CallEntry` を拡張
- **`native_id` は `i32`**: PJSUA の `pjsua_acc_id` / `pjsua_call_id` は `i32`。M17-1 で正式型に差し替え
- **`shutting_down` フラグ**: `initialized` と同列の bool フィールド
- **`can_add_call(max_calls)`**: `call_count() < max_calls` の簡易判定（`max_calls == 0` は常に false）
- **`add_account`/`add_call` にシャットダウンチェック追加**: shutdown 中は `InvalidState` を返す

## Scope

### `crates/siprs/src/runtime/state.rs`（修正）

```rust
// AccountEntry に native_id 追加
pub(crate) struct AccountEntry {
    pub id: AccountId,
    pub native_id: Option<i32>,      // ← 追加（M17-1 で ffi::pjsua_acc_id に差し替え）
    pub config: AccountConfig,
    pub registration: RegistrationState,
}

// CallEntry に native_id 追加
pub(crate) struct CallEntry {
    pub id: CallId,
    pub native_id: Option<i32>,      // ← 追加
    pub account_id: AccountId,
    pub state: CallState,
    pub media: Option<MediaRuntime>,
}

// ClientState に shutting_down 追加
pub(crate) struct ClientState {
    pub initialized: bool,
    pub shutting_down: bool,         // ← 追加
    pub accounts: BTreeMap<AccountId, AccountEntry>,
    pub calls: BTreeMap<CallId, CallEntry>,
    pub capabilities: ClientCapabilities,
}

impl ClientState {
    pub fn can_add_call(&self, max_calls: u32) -> bool;
    pub fn set_shutting_down(&mut self);
    pub fn is_shutting_down(&self) -> bool;
    pub fn get_account_by_native_id(&self, native_id: i32) -> Option<&AccountEntry>;
    pub fn get_call_by_native_id(&self, native_id: i32) -> Option<&CallEntry>;

    // add_account / add_call に shutting_down チェック追加
}
```

### テストコード（`state.rs` の既存テストモジュールに追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_can_add_call_under_limit` | `max_calls=3`、3通話目まで true、4通話目で false |
| 2 | `test_can_add_call_zero_limit` | `max_calls=0` → 常に false |
| 3 | `test_shutting_down_flag` | `set_shutting_down()` 後 `is_shutting_down()` == true |
| 4 | `test_shutdown_rejects_add_call` | shutdown 中 `add_call` が `InvalidState` |
| 5 | `test_shutdown_rejects_add_account` | shutdown 中 `add_account` が `InvalidState` |
| 6 | `test_native_id_reverse_lookup` | `get_account_by_native_id` / `get_call_by_native_id` 正引き |

## Non-scope

- FFI 型 `ffi::pjsua_acc_id` への差し替え — M17-1
- 実際の shutdown シーケンス — M12-5

## Test Plan

### 基本方針

境界値テスト（max_calls=3, 0）、shutdown フラグの状態遷移、native_id 逆引き。

### ユニットテスト不可能な項目（例外）

- FFI callback からの実際の native_id 設定 — M17-3

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 282 + 新規 6）
- [ ] `AccountEntry` / `CallEntry` に `native_id: Option<i32>` が追加されている
- [ ] `ClientState` に `shutting_down: bool` + 3 methods が追加されている
- [ ] `ClientState` に `can_add_call(max_calls)` / `get_account_by_native_id` / `get_call_by_native_id` が実装されている
- [ ] `add_account` / `add_call` が shutdown 中に `InvalidState` を返すこと
- [ ] 全テストで `unwrap()` 不使用

## Notes

### native_id の型

`i32` は PJSUA の `pjsua_acc_id` / `pjsua_call_id` の実際の型（C の `int`）に合わせている。M17-1 で bindgen が生成する `ffi::pjsua_acc_id` に差し替える。

### M9 マイルストーン

```text
M9-1 (#95): RegistrationState 遷移ロジック ← 完了済み
M9-2 (#96): CallState 遷移ロジック ← 完了済み
M9-3 (#97): ClientState 管理 ← 本チケット
```
