---
ticket_id: 92
title: "M8-1: RegistrationState / ClientState / AccountEntry / CallEntry 定義"
slug: m8-1-state-types
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0092-m8-1-state-types/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0092-m8-1-state-types/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0092-m8-1-state-types/review.md
---

# M8-1: `RegistrationState` enum / `ClientState` / `AccountEntry` / `CallEntry` 定義

## Summary

全アカウント・通話のランタイム状態を表現する型を定義する。`RegistrationState` は SIP 登録状態の7状態機械を表現し、`ClientState` は reactor thread が排他的に所有する全体状態を保持する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§17, §33)

## Background

### RFC 準拠

RFC §17「登録状態モデル（Disabled, Idle, Registering, Registered, Unregistering, Failed, Expired）」。§33「状態の唯一正本は reactor thread が所有する」。§33 AccountEntry / CallEntry 定義。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M0-2 (#53) | `AccountId` / `CallId` — `BTreeMap` のキー型 |
| M2-2 (#63) | `AccountConfig` — `AccountEntry::config` フィールド |
| M6-1 (#72) | `ClientCapabilities` — `ClientState::capabilities` フィールド（event.rs で仮定義済み） |
| M8-2 (#TBD) | `CallState` / `MediaRuntime` — `CallEntry` で使用（本チケットではスケルトン） |

### 設計判断

- **`src/account.rs`**（新規）: `RegistrationState` enum に特化
- **`src/runtime/state.rs`**（新規）: `ClientState`, `AccountEntry`, `CallEntry` を定義
- **`src/runtime/mod.rs`**（新規）: `pub mod state;` 宣言
- **`CallState` / `MediaRuntime` はスケルトン**: M8-2 で正式定義されるまで `() ` または `#[allow(dead_code)]` な空構造体を仮置き
- **`BTreeMap`**: キーの `Ord` による順序保証。`AccountId` / `CallId` は既に `Ord` 実装済み
- **`ClientState` の可視性**: `pub(crate)` — reactor 内部でのみ使用

## Scope

### `crates/siprs/src/account.rs`（新規）

```rust
/// SIP 登録状態。
///
/// RFC §17 の登録状態機械（7状態）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationState {
    /// 登録機能無効。
    Disabled,
    /// 未登録（初期状態）。
    Idle,
    /// 登録処理中。
    Registering,
    /// 登録完了。
    Registered,
    /// 登録解除処理中。
    Unregistering,
    /// 登録失敗。
    Failed,
    /// 登録期限切れ。
    Expired,
}
```

### `crates/siprs/src/runtime/state.rs`（新規）

```rust
use std::collections::BTreeMap;
use crate::account::RegistrationState;
use crate::config::AccountConfig;
use crate::error::SipError;
use crate::event::ClientCapabilities;
use crate::util::id::{AccountId, CallId};

// CallState / MediaRuntime は M8-2 で定義。ここではスケルトン。
#[allow(dead_code)] pub(crate) struct CallStateSkeleton;
#[allow(dead_code)] pub(crate) struct MediaRuntimeSkeleton;

/// アカウントエントリ。
pub(crate) struct AccountEntry {
    pub id: AccountId,
    pub config: AccountConfig,
    pub registration: RegistrationState,
}

/// 通話エントリ。
pub(crate) struct CallEntry {
    pub id: CallId,
    pub account_id: AccountId,
    pub state: CallStateSkeleton,
    pub media: Option<MediaRuntimeSkeleton>,
}

/// クライアントのランタイム状態。
///
/// reactor thread が排他的に所有する。
pub(crate) struct ClientState {
    pub initialized: bool,
    pub accounts: BTreeMap<AccountId, AccountEntry>,
    pub calls: BTreeMap<CallId, CallEntry>,
    pub capabilities: ClientCapabilities,
}

impl ClientState {
    /// 空の ClientState を生成する。
    pub fn new(capabilities: ClientCapabilities) -> Self;

    // ── Account operations ──
    pub fn add_account(&mut self, entry: AccountEntry) -> Result<(), SipError>;
    pub fn remove_account(&mut self, id: AccountId) -> Result<AccountEntry, SipError>;
    pub fn get_account(&self, id: AccountId) -> Result<&AccountEntry, SipError>;
    pub fn get_account_mut(&mut self, id: AccountId) -> Result<&mut AccountEntry, SipError>;

    // ── Call operations ──
    pub fn add_call(&mut self, entry: CallEntry) -> Result<(), SipError>;
    pub fn remove_call(&mut self, id: CallId) -> Result<CallEntry, SipError>;
    pub fn get_call(&self, id: CallId) -> Result<&CallEntry, SipError>;
    pub fn get_call_mut(&mut self, id: CallId) -> Result<&mut CallEntry, SipError>;

    /// 現在の通話数を返す（`max_calls` 制限チェック用）。
    pub fn call_count(&self) -> usize;
}
```

### `crates/siprs/src/runtime/mod.rs`（新規）

```rust
pub mod state;
```

### `crates/siprs/src/lib.rs`（修正）

- `pub mod account;` 追加
- `pub mod runtime;` 追加

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_client_state_new` | `ClientState::new()` が空の状態を返す |
| 2 | `test_add_get_account` | `add_account` → `get_account` が正しいエントリを返す |
| 3 | `test_add_account_duplicate` | 重複 `add_account` が `Err` を返す |
| 4 | `test_remove_account` | `remove_account` 後 `get_account` が `AccountNotFound` |
| 5 | `test_add_call_count` | `add_call` 時 `call_count` が増加 |
| 6 | `test_remove_call` | `remove_call` 後 `get_call` が `CallNotFound` |
| 7 | `test_account_not_found` | 存在しない account_id で `AccountNotFound` |
| 8 | `test_call_not_found` | 存在しない call_id で `CallNotFound` |
| 9 | `test_registration_state_display` | `RegistrationState` の `Display` が期待通り |

## Non-scope

- `CallState` の正式定義 — M8-2
- `MediaRuntime` の正式定義 — M8-2
- `ClientCapabilities` のフィールド定義 — M8-3
- FFI 型（`native_id`）— M17-1 以降
- `RwLock<ClientState>` ラッパー — M12-1

## Test Plan

### 基本方針

全操作の正常系・異常系を網羅。`BTreeMap` 操作の基本的なテスト。`SipError::AccountNotFound` / `CallNotFound` の伝播確認。

### ユニットテスト不可能な項目（例外）

- FFI 統合後の `native_id` 管理 — M17 以降で検証

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 238 テスト + 新規 9 テスト）
- [ ] `src/account.rs` に `RegistrationState` が定義されている
- [ ] `src/runtime/state.rs` に `ClientState`, `AccountEntry`, `CallEntry` が定義されている
- [ ] `ClientState` が 8 操作（add/get/remove account/call, get_mut, call_count）+ `new` を持つこと
- [ ] `ClientState` が `pub(crate)` であること
- [ ] `pub(crate)` なスケルトン型（`CallStateSkeleton`, `MediaRuntimeSkeleton`）が仮定義されている
- [ ] 全テストで `unwrap()` 不使用

## Notes

### スケルトン型について

`CallState` / `MediaRuntime` は M8-2 で正式に定義されるまで、スケルトン型で代替する。これにより `CallEntry` のフィールド構造を先に確定させ、M8-2 で型を差し替えるだけで済むようにする。

### native_id の省略

RFC §33 では `AccountEntry` に `native_id: ffi::pjsua_acc_id` が定義されているが、FFI バインディング（M17-1）が未生成のため本チケットでは省略する。M17-2 以降でネイティブ ID 管理を追加する。

### M8 マイルストーン

```text
M8-1 (#92): RegistrationState / ClientState / AccountEntry / CallEntry ← 本チケット
M8-2 (#93): CallState / MediaRuntime
M8-3 (#94): ClientCapabilities / SrtpImplementation / AudioDeviceCaps
```
