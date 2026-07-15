# Plan: P0-3 — 全体モジュール構成・並行性モデル実装

## 概要

siprs crate のモジュール分割構成（RFC §6）と単一 core reactor thread による並行性モデル（RFC §7）の型骨格を実装する。本チケットでは crate の「骨格」— モジュール構成、公開API境界、並行性制御の型定義のみ — を確立し、メソッド実装は後続チケットに委譲する。

## 実装ファイル一覧 (全8ファイル)

| # | ファイル | アクション | 説明 |
|---|---------|-----------|------|
| 1 | `src/concurrency_model/mod.rs` | 新規作成 | 6子モジュール宣言 + pub use 再公開 |
| 2 | `src/concurrency_model/sipclient_struct.rs` | 編集 | SipClient + ClientInner 構造体定義 |
| 3 | `src/concurrency_model/command_serialization.rs` | 編集 | RuntimeCommand enum (10バリアント) |
| 4 | `src/concurrency_model/crate_root_api.rs` | 編集 | pub use 再公開リスト |
| 5 | `src/concurrency_model/sipclient_methods.rs` | 編集 | impl SipClient メソッドスケルトン |
| 6 | `src/concurrency_model/account_handle_api.rs` | 編集 | SipAccountHandle 構造体 |
| 7 | `src/concurrency_model/outgoing_call_request.rs` | 編集 | OutgoingCallRequest 構造体 |
| 8 | `src/lib.rs` | 編集 | モジュール宣言 + pub use 再公開強化 |
| 9 | `src/config/mod.rs` | 編集 | pub use 再公開に LogLevel 等を追加 |

## 各ファイルの実装詳細

### 1. `src/concurrency_model/mod.rs` — 新規作成

```rust
// Module declarations for the concurrency model subsystem.
//
// Each submodule corresponds to one RFC design node defining the
// single-core-reactor serialization architecture (§7).

pub mod account_handle_api;
pub mod command_serialization;
pub mod crate_root_api;
pub mod outgoing_call_request;
pub mod sipclient_methods;
pub mod sipclient_struct;

// Re-export primary concurrency-model types.
pub use crate_root_api::*;
```

**ポイント**: mod.rs は実装ロジックを一切含まず、子モジュール宣言 + pub use 再公開のみ。

---

### 2. `src/concurrency_model/sipclient_struct.rs` — 既存スタブの実装

現在の `pub trait Service {}` を以下の内容に置き換える：

```rust
// [::STUB::] P4-9 / P5-1: SipClient and ClientInner require RuntimeHandle,
// EventBus, and ClientState types from later tickets. This file provides
// the Arc wrapper skeleton; full field types will be resolved by P5-1.

/// Thin handle to the SIP client runtime.
///
/// `SipClient` is a reference-counted handle that is `Clone + Send + Sync`.
/// All PJSUA control goes through a single core reactor thread.
#[derive(Clone)]
pub struct SipClient {
    pub(crate) inner: std::sync::Arc<ClientInner>,
}

/// Inner state shared across all `SipClient` clones.
///
/// Fields are stub-typed (`()` / `bool`) until P4-9 / P5-1 resolves them.
pub struct ClientInner {
    // [::STUB::] P5-1: runtime: RuntimeHandle,
    // [::STUB::] P5-1: events: EventBus,
    // [::STUB::] P5-1: state: tokio::sync::RwLock<ClientState>,
    // [::STUB::] P5-1: shutdown: tokio::sync::watch::Sender<bool>,
    _placeholder: (),
}

// SAFETY: SipClient wraps Arc<ClientInner> which provides automatic
// Send + Sync when ClientInner itself is Send + Sync. ClientInner
// currently contains only `()` which is trivially Send + Sync.
// When fields are added in P5-1, verify each field's Send/Sync bounds.
unsafe impl Send for ClientInner {}
unsafe impl Sync for ClientInner {}
```

**重要**: 型は `std::sync::Arc` のみ使用（Cargo.toml に依存追加不要）。`tokio::sync::RwLock` や `tokio::sync::watch` はコメントアウト。

---

### 3. `src/concurrency_model/command_serialization.rs` — 既存スタブの実装

現在の `pub trait Service {}` を以下の内容に置き換える：

```rust
// [::STUB::] P4-9: RuntimeCommand handler implementations are stubbed.
// This file defines the enum skeleton and the core reactor dispatch;
// each variant's execution logic will be implemented in P4-9.

/// Commands serialized through the core reactor via unbounded MPSC channel.
///
/// Each variant carries a `oneshot::Sender` for the command result.
/// Full sender/receiver wiring will use `tokio::sync::mpsc` + `oneshot`
/// when tokio is added as a dependency (P4-9).
///
/// [::STUB::] P4-9: replace placeholder `()` reply types with
/// `tokio::sync::oneshot::Sender<Result<..., SipError>>`.
#[derive(Debug)]
pub enum RuntimeCommand {
    Initialize { config: (), reply: () },
    AddAccount { config: (), reply: () },
    RemoveAccount { account_id: (), reply: () },
    SetRegistration { account_id: (), enabled: bool, reply: () },
    MakeCall { account_id: (), request: (), reply: () },
    Hangup { call_id: (), reason: (), reply: () },
    Hold { call_id: (), reply: () },
    Unhold { call_id: (), reply: () },
    SendDtmf { call_id: (), digits: String, method: (), reply: () },
    Shutdown { reply: () },
}
```

**ポイント**: 全10バリアントを定義。型は全て `()` プレースホルダー（P4-9 で本実装）。`Debug` トレイトを derive。

---

### 4. `src/concurrency_model/crate_root_api.rs` — 既存スタブの実装

現在の `pub trait Service {}` を以下の内容に置き換える：

```rust
// [::STUB::] P0-4: Type re-exports from other modules are pending.
// This module defines the paths that will re-export types to lib.rs.
// Re-export markers are commented out until the source modules exist.

/// Crate root public API — re-exported from lib.rs.
///
/// These `pub use` chains form the crate's external contract.
/// Each commented line indicates a re-export destination that will be
/// activated when the corresponding module is implemented.

// [::STUB::] P0-4: pub use crate::client::SipClient;
// [::STUB::] P0-4: pub use crate::config::{ClientConfig, AccountConfig, ...};
// [::STUB::] P0-4: pub use crate::account::{AccountId, SipAccountHandle, ...};
// [::STUB::] P0-4: pub use crate::call::{CallId, CallState, OutgoingCallRequest, ...};
// [::STUB::] P0-4: pub use crate::audio::{AudioChunkPair, ...};
// [::STUB::] P0-4: pub use crate::event::{SipEvent, SipEventPayload, EventBus, ...};
// [::STUB::] P0-4: pub use crate::error::{SipError, SipErrorKind};
// [::STUB::] P0-4: pub use crate::transport::*;
```

**ポイント**: コメントアウトされた pub use が RFC §8.1 の完全な形。P0-4 で有効化。

---

### 5. `src/concurrency_model/sipclient_methods.rs` — 既存スタブの実装

```rust
// [::STUB::] P5-1: Full SipClient method implementations with
// RuntimeCommand dispatch. This file defines the method signatures only.

use crate::concurrency_model::sipclient_struct::SipClient;

impl SipClient {
    /// Initialize the SIP client with the given configuration.
    // [::STUB::] P5-1: full implementation
    pub fn initialize(config: ()) -> Result<Self, ()> {
        todo!()
    }

    /// Add a SIP account.
    // [::STUB::] P5-1: full implementation
    pub fn add_account(&self, config: ()) -> Result<(), ()> {
        todo!()
    }

    /// Remove a SIP account.
    // [::STUB::] P5-1: full implementation
    pub fn remove_account(&self, account_id: ()) -> Result<(), ()> {
        todo!()
    }

    /// Set registration state for an account.
    // [::STUB::] P5-1: full implementation
    pub fn set_registration(&self, account_id: (), enabled: bool) -> Result<(), ()> {
        todo!()
    }

    /// Make an outgoing call.
    // [::STUB::] P5-1: full implementation
    pub fn make_call(&self, account_id: (), request: ()) -> Result<(), ()> {
        todo!()
    }

    /// Hang up an active call.
    // [::STUB::] P5-1: full implementation
    pub fn hangup(&self, call_id: (), reason: ()) -> Result<(), ()> {
        todo!()
    }

    /// Place a call on hold.
    // [::STUB::] P5-1: full implementation
    pub fn hold(&self, call_id: ()) -> Result<(), ()> {
        todo!()
    }

    /// Remove a call from hold.
    // [::STUB::] P5-1: full implementation
    pub fn unhold(&self, call_id: ()) -> Result<(), ()> {
        todo!()
    }

    /// Send DTMF digits during an active call.
    // [::STUB::] P5-1: full implementation
    pub fn send_dtmf(&self, call_id: (), digits: &str, method: ()) -> Result<(), ()> {
        todo!()
    }

    /// Gracefully shut down the SIP client.
    // [::STUB::] P5-1: full implementation
    pub fn shutdown(&self) -> Result<(), ()> {
        todo!()
    }
}
```

**ポイント**: 全9メソッドのシグネチャを定義。本体は `todo!()`（P5-1 で実装）。

---

### 6. `src/concurrency_model/account_handle_api.rs` — 既存スタブの実装

```rust
// [::STUB::] P4-9: SipAccountHandle requires AccountConfig and related types.
// This file defines the handle skeleton only.

/// Handle to a registered SIP account.
///
/// [::STUB::] P4-9: add account operations (register, unregister, modify).
pub struct SipAccountHandle {
    // [::STUB::] P4-9: account_id: AccountId,
    // [::STUB::] P4-9: client: SipClient,
    _placeholder: (),
}

impl SipAccountHandle {
    /// Create a new account handle.
    // [::STUB::] P4-9: full constructor
    pub fn new() -> Self {
        Self { _placeholder: () }
    }
}
```

---

### 7. `src/concurrency_model/outgoing_call_request.rs` — 既存スタブの実装

```rust
// [::STUB::] P0-4: OutgoingCallRequest requires CallConfig and URI types.
// This file defines the parameter skeleton only.

/// Parameters for an outgoing SIP call.
///
/// [::STUB::] P0-4: add uri, headers, audio config fields.
pub struct OutgoingCallRequest {
    // [::STUB::] P0-4: uri: String,
    // [::STUB::] P0-4: headers: Vec<(String, String)>,
    // [::STUB::] P0-4: audio: (),
    _placeholder: (),
}
```

---

### 8. `src/lib.rs` — 編集

現在の内容:
```rust
pub mod api;
pub mod config;
```

変更後:
```rust
//! # siprs — Safe asynchronous SIP voice communication via PJSUA
//! (existing doc comments kept as-is)

pub mod api;
pub mod config;
pub mod concurrency_model;

// Re-export primary types.
pub use crate::concurrency_model::sipclient_struct::SipClient;
pub use crate::config::client_config::{LogLevel, RawSipEventConfig, ResamplerQuality, TimeoutConfig};
```

**ポイント**: `pub mod concurrency_model;` 追加 + `pub use SipClient` + config 型の再公開。

---

### 9. `src/config/mod.rs` — 編集

現在の pub use ブロックに以下を追加（既存行は維持）：

```rust
pub use self::client_config::{
    LogLevel, RawSipEventConfig, ResamplerQuality, TimeoutConfig,
};
```

これらは既に `client_config.rs` で定義済みのため、現状と変わらないが明示的にリストする。

## テスト計画

### ユニットテスト（lib.rs 内 `#[cfg(test)] mod tests`）

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // ── モジュール構造テスト ──

    /// Verify that all top-level module symbols compile.
    #[test]
    fn modules_compile_successfully() {
        // Compile-time check: if modules are declared correctly,
        // this test file will compile. No runtime assertion needed.
        let _ = api::versioning_policy::VERSION;
        let _ = LogLevel::Info;
        let _ = RawSipEventConfig::default();
        let _ = ResamplerQuality::High;
        let _ = TimeoutConfig::default();
    }

    // ── SipClient ──

    /// SipClient derives Clone.
    #[test]
    fn sip_client_is_clone() {
        // Compile-time check: SipClient implements Clone.
        fn assert_clone<T: Clone>() {}
        assert_clone::<SipClient>();
    }

    /// SipClient is Send + Sync (compile-time check).
    #[test]
    fn sip_client_is_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<SipClient>();
        assert_sync::<SipClient>();
    }

    // ── RuntimeCommand ──

    /// RuntimeCommand derives Debug.
    #[test]
    fn runtime_command_is_debug() {
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<RuntimeCommand>();
    }

    /// RuntimeCommand has exactly 10 variants.
    #[test]
    fn runtime_command_has_ten_variants() {
        // Compile-time: if a variant is added/removed, this test breaks.
        match &RuntimeCommand::Shutdown { reply: () } {
            RuntimeCommand::Initialize { .. } => {}
            RuntimeCommand::AddAccount { .. } => {}
            RuntimeCommand::RemoveAccount { .. } => {}
            RuntimeCommand::SetRegistration { .. } => {}
            RuntimeCommand::MakeCall { .. } => {}
            RuntimeCommand::Hangup { .. } => {}
            RuntimeCommand::Hold { .. } => {}
            RuntimeCommand::Unhold { .. } => {}
            RuntimeCommand::SendDtmf { .. } => {}
            RuntimeCommand::Shutdown { .. } => {}
        }
    }
}
```

ただし、`RuntimeCommand` は `src/concurrency_model/command_serialization.rs` にあるため、lib.rs から直接参照できない。そのため、lib.rs のテストでは concurrency_model からの pub use が必要か、またはテストを各モジュール内に配置する。

**判断**: モジュール内テストは各ファイルに記述する。

#### `src/concurrency_model/sipclient_struct.rs` に追加するテスト

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sip_client_is_clone() {
        fn assert_clone<T: Clone>() {}
        assert_clone::<SipClient>();
    }

    #[test]
    fn sip_client_is_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<SipClient>();
        assert_sync::<SipClient>();
    }

    #[test]
    fn sip_client_clone_shares_inner() {
        let client = SipClient { inner: std::sync::Arc::new(ClientInner { _placeholder: () }) };
        let cloned = client.clone();
        assert!(std::sync::Arc::ptr_eq(&client.inner, &cloned.inner));
    }
}
```

#### `src/concurrency_model/command_serialization.rs` に追加するテスト

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_command_is_debug() {
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<RuntimeCommand>();
    }

    #[test]
    fn runtime_command_has_ten_variants() {
        let variants = vec![
            RuntimeCommand::Initialize { config: (), reply: () },
            RuntimeCommand::AddAccount { config: (), reply: () },
            RuntimeCommand::RemoveAccount { account_id: (), reply: () },
            RuntimeCommand::SetRegistration { account_id: (), enabled: true, reply: () },
            RuntimeCommand::MakeCall { account_id: (), request: (), reply: () },
            RuntimeCommand::Hangup { call_id: (), reason: (), reply: () },
            RuntimeCommand::Hold { call_id: (), reply: () },
            RuntimeCommand::Unhold { call_id: (), reply: () },
            RuntimeCommand::SendDtmf { call_id: (), digits: "1".into(), method: (), reply: () },
            RuntimeCommand::Shutdown { reply: () },
        ];
        assert_eq!(variants.len(), 10);
    }
}
```

### 結合テスト

`tests/` ディレクトリに統合テストファイルを作成：

```rust
// tests/concurrency_model_integration.rs

use siprs::SipClient;

/// Verify that SipClient is publicly accessible and satisfies Send + Sync.
#[test]
fn sip_client_is_send_sync_from_external_crate() {
    fn assert_send<T: Send>() {}
    fn assert_sync<T: Sync>() {}
    assert_send::<SipClient>();
    assert_sync::<SipClient>();
}

/// Verify that config types are publicly accessible.
#[test]
fn config_types_are_re_exported() {
    let _ = siprs::LogLevel::Info;
    let _ = siprs::RawSipEventConfig::default();
    let _ = siprs::ResamplerQuality::High;
    let _ = siprs::TimeoutConfig::default();
}
```

## Boy Scout 改善

### 翻訳可能性チェック結果

| チェック項目 | 該当箇所 | 対応 |
|------------|---------|------|
| 名詞始まりの関数 | `src/concurrency_model/` の既存コードに `pub trait Service {}` あり — スタブのため許容 | 改善不要 |
| 1文字変数 | concurrency_model 内に該当なし | — |
| 汎用名変数 | `_placeholder` が各構造体にある — スタブフィールドのため許容 | 改善不要 |
| マジックナンバー | 本チケット未使用 | — |
| デバッグ出力 | 本チケット未使用 | — |
| `unwrap()` の使用 | 既存コード(client_config.rs テスト内)に `unwrap()` 使用あり | テストコード内だが `?` 伝播に改善する余地あり。ただし本チケットのスコープ外 |

### 本チケットで行う改善

1. **src/lib.rs**: 実装ロジックを絶対に書かず、モジュール宣言 + pub use のみに限定（現在の設計と一致）
2. **src/concurrency_model/*.rs**: [::STUB::] コメントに RFC ノード参照を含め、後続チケットへのトレーサビリティを確保
3. **変数命名**: 全フィールドをドメイン語彙で記述（`_placeholder` はスタブの一時的措置）

## リスクと注意点

| リスク | 影響 | 対策 |
|-------|------|------|
| `unsafe impl Send for ClientInner {}` が将来のフィールド追加時に危険 | コンパイルは通るが、新しいフィールドが !Send/!Sync の場合に未定義動作 | `// SAFETY:` コメントに明確な根拠を記載。P5-1 で各フィールドの Send/Sync を再検証する TODO をコメントに明記 |
| concurrency_model の [::STUB::] 付きファイルが未実装のまま cargo check が通らない | チケット完了不能 | 各スタブに最低限の型定義（enum/struct の空フィールド）を入れ、コンパイルを通過させる |
| lib.rs の pub use で循環参照が発生 | コンパイルエラー | 現状 pub use する型は同一ファイル内で完結。循環は発生しない |
| `todo!()` がテスト実行時にパニックする | 該当メソッドのテストが失敗 | `todo!()` のメソッドは統合テストから呼ばれないシグネチャのみ。テストは構造チェックのみ行う |

## 実装順序

1. **`src/concurrency_model/mod.rs`** — 新規作成（他ファイルに依存しない）
2. **`src/concurrency_model/sipclient_struct.rs`** — SipClient + ClientInner 型定義
3. **`src/concurrency_model/command_serialization.rs`** — RuntimeCommand enum 定義
4. **`src/concurrency_model/crate_root_api.rs`** — pub use 再公開パス定義
5. **`src/concurrency_model/outgoing_call_request.rs`** — OutgoingCallRequest 構造体
6. **`src/concurrency_model/account_handle_api.rs`** — SipAccountHandle 構造体
7. **`src/concurrency_model/sipclient_methods.rs`** — impl SipClient メソッドスケルトン
8. **`src/lib.rs`** — モジュール宣言 + pub use 追加
9. **各ファイルに `#[cfg(test)]` テスト追加**
10. **`cargo check` + `cargo test` で検証**
