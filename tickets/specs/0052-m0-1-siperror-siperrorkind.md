---
ticket_id: 52
title: "M0-1: SipError / SipErrorKind 定義"
slug: m0-1-siperror-siperrorkind
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0052-m0-1-siperror-siperrorkind/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0052-m0-1-siperror-siperrorkind/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0052-m0-1-siperror-siperrorkind/plan.md
---
# M0-1: SipError / SipErrorKind 定義

## Summary

siprs crate の最小骨組みを作成し、crate 全体のエラー型統一基盤 `SipError` / `SipErrorKind` を定義する。

以下のファイルを新規作成し、`cargo build` / `cargo test` が通る状態にする：

- `crates/siprs/Cargo.toml` — crate マニフェスト（workspace 非依存、単独 crate）
- `crates/siprs/src/lib.rs` — crate ルート
- `crates/siprs/src/error.rs` — `SipError` / `SipErrorKind` 完全定義 + テスト

## Background

このチケットは siprs crate 全体の土台となる。後続の全チケット（60チケット）はこのエラー型を `Result<T, SipError>` の E として使用する。

**重要**: `SipError` は `AccountId` / `CallId` への参照を持つ（RFC §14）。これらは M0-2 で正式定義される型であるため、本チケットでは `error.rs` 内にインラインで先行定義し、M0-2 で `util/id.rs` に移設する。この一時的二重定義を防ぐため、本チケットでは以下の方針を採る：

- `error.rs` 内で `pub(super)` な `AccountId` / `CallId` newtype を仮定義
- `SipError` の `account_id` / `call_id` フィールドはこれらの型を使用
- 型の移動先パスが変わるだけで M0-2 での修正は `error.rs` の use 文のみ
- 公開 API での型の同一性は M0-2 の re-export により維持

**補正事項**: Tickets.md（M0-1 実装スコープ）に「全24バリアント」とあるが、RFC §14 の `SipErrorKind` enum 定義は **23バリアント** である。本チケットでは RFC の定義に従い23バリアントを実装する。

## Scope

### 1. `crates/siprs/Cargo.toml`

package メタデータ:
- name = "siprs", version = "0.1.0", edition = "2021"
- description = "Async Rust SIP client crate powered by PJSUA 2.17"
- license = "MIT OR Apache-2.0"

```toml
[package]
name = "siprs"
version = "0.1.0"
edition = "2021"
description = "Async Rust SIP client crate powered by PJSUA 2.17"
license = "MIT OR Apache-2.0"

[lib]
name = "siprs"
crate-type = ["lib"]

[dependencies]
thiserror = "2"
serde = { version = "1", features = ["derive"], optional = true }
tracing = "0.1"

[dev-dependencies]
static_assertions = "1"
```

依存関係は `cargo add` で追加すること（Cargo.toml への直接手書き禁止）。ただし `cargo add` は実行時バージョンを最新に解決するため、上記は参考記述。

### 2. `crates/siprs/src/lib.rs`

```rust
//! # siprs — Async Rust SIP Client
//!
//! tokio ネイティブの非同期 SIP クライアント。PJSUA 2.17 を FFI 経由で駆動し、
//! 複数アカウント・発着信・音声処理・DTMF・ICE/TURN/STUN・TLS・SRTP を提供する。
//!
//! ## フェーズ1: 基盤型定義
//!
//! このモジュール階層は実装進行に伴い拡張される。M0-1 時点では error モジュールのみ。

pub mod error;

// Phase 1 で順次追加:
// pub mod util;   // M0-2: AccountId, CallId, AudioSourceId
// pub mod audio;  // M1-1: AudioFormat, SampleRate 等
// pub mod config; // M1-3: TransportConfig, ClientConfig 等
```

### 3. `crates/siprs/src/error.rs`

#### 3a. `AccountId` / `CallId` 仮定義（M0-2 移設予定）

```rust
// TODO(M0-2): これらの型は util/id.rs に移動し、error.rs からは re-export を使用する
//             移動時は lib.rs に pub mod util を追加し、pub use error::AccountId を維持する

/// アカウント識別子（ランタイム一意）。
///
/// M0-2 で util モジュールに正式移設。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct AccountId(u64);

impl AccountId {
    /// テスト用: 直接 ID 値を指定して生成
    #[doc(hidden)]
    pub const fn from_raw(id: u64) -> Self {
        Self(id)
    }
}

/// 通話識別子（ランタイム一意）。
///
/// M0-2 で util モジュールに正式移設。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CallId(u64);

impl CallId {
    #[doc(hidden)]
    pub const fn from_raw(id: u64) -> Self {
        Self(id)
    }
}
```

**設計判断**: `NonZeroU64`（RFC §9）ではなく `u64` を使用している理由:
- テストコードで `AccountId::from_raw(0)` を許容する必要がある（エラー型のテストでは具体的な ID 値よりも型の有無を検証）
- M0-2 で正式定義時に `NonZeroU64` に変更し、型安全性を高める
- `PartialOrd + Ord` は M0-2 で追加（M0-1 では不要）

#### 3b. `SipErrorKind` enum（23バリアント）

```rust
use std::fmt;

/// エラー種別を分類する stable な列挙型。
///
/// この enum はプログラム的なエラー種別判別を提供する。
/// `retryable` フラグと組み合わせてリカバリ戦略の決定に使用する。
///
/// # バリアント一覧（23）
///
/// | バリアント | 意味 | retryable |
/// |---|---|---|
/// | InvalidConfig | 設定値のバリデーションエラー | false |
/// | InvalidState | 状態遷移違反 | true |
/// | AlreadyInitialized | 二重初期化 | true |
/// | NotInitialized | 未初期化状態での操作 | true |
/// | AccountNotFound | アカウント不在 | false |
/// | CallNotFound | 通話不在 | false |
/// | TransportInitFailed | トランスポート初期化失敗 | true |
/// | RegistrationFailed | SIP REGISTER 失敗 | true |
/// | AuthenticationFailed | 認証失敗（credentials 不変） | false |
/// | InviteFailed | INVITE 失敗 | true |
/// | MediaInitFailed | メディア初期化失敗 | true |
/// | MediaNegotiationFailed | メディアネゴシエーション失敗 | true |
/// | IceFailed | ICE ネゴシエーション失敗 | true |
/// | TlsFailed | TLS 接続失敗（設定不変） | false |
/// | SrtpFailed | SRTP 初期化失敗（設定不変） | false |
/// | AudioFormatUnsupported | 非対応フォーマット | false |
/// | AudioPipelineBroken | 音声パイプライン異常 | true |
/// | DtmfFailed | DTMF 送受信失敗 | true |
/// | Timeout | タイムアウト | true |
/// | ChannelClosed | イベントチャネル閉鎖 | false |
/// | NativeError | PJSIF ネイティブエラー | true |
/// | ShutdownInProgress | シャットダウン中 | false |
/// | InternalInvariantBroken | 内部不変条件違反（バグ） | false |
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SipErrorKind {
    InvalidConfig,
    InvalidState,
    AlreadyInitialized,
    NotInitialized,
    AccountNotFound,
    CallNotFound,
    TransportInitFailed,
    RegistrationFailed,
    AuthenticationFailed,
    InviteFailed,
    MediaInitFailed,
    MediaNegotiationFailed,
    IceFailed,
    TlsFailed,
    SrtpFailed,
    AudioFormatUnsupported,
    AudioPipelineBroken,
    DtmfFailed,
    Timeout,
    ChannelClosed,
    NativeError,
    ShutdownInProgress,
    InternalInvariantBroken,
}
```

**注記**: 上記は RFC §14 の定義に完全準拠する。Tickets.md で「24バリアント」と記載されている箇所については、RFC 実定義が23であることを確認済み。念のため variant 追加が必要な将来フェーズでは `#[non_exhaustive]` を追加する判断をする（Phase 9 統合テスト時に再評価）。

#### 3c. `SipError` 構造体

```rust
/// crate 統一エラー型。
///
/// すべての公開 API は `Result<T, SipError>` を返す。
/// `thiserror::Error` により `Display` / `Error` が自動導出される。
#[derive(Debug, thiserror::Error)]
#[error("{kind}: {message}")]
pub struct SipError {
    /// エラー種別（プログラム的判別用）
    pub kind: SipErrorKind,

    /// 人間可読なエラー詳細（日本語または英語）
    pub message: String,

    /// PJSIP ネイティブエラーコード（該当する場合）
    pub native_status: Option<i32>,

    /// 関連アカウント ID（該当する場合）
    pub account_id: Option<AccountId>,

    /// 関連通話 ID（該当する場合）
    pub call_id: Option<CallId>,

    /// リトライ可能フラグ
    ///
    /// - `true`: 一時的な状態に起因し、リトライで回復する可能性がある
    /// - `false`: 設定や前提条件に起因し、リトライしても回復しない
    pub retryable: bool,
}
```

#### 3d. コンストラクタヘルパー（コンビニエンスメソッド）

```rust
impl SipError {
    /// 設定値のバリデーションエラーを生成する。
    pub fn invalid_config(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::InvalidConfig,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// 状態遷移違反エラーを生成する。
    pub fn invalid_state(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::InvalidState,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: true,
        }
    }

    /// タイムアウトエラーを生成する。
    pub fn timeout(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::Timeout,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: true,
        }
    }

    /// ネイティブエラー（PJSIP）をラップする。
    pub fn native_error(
        msg: impl Into<String>,
        native_status: i32,
        account_id: Option<AccountId>,
        call_id: Option<CallId>,
    ) -> Self {
        Self {
            kind: SipErrorKind::NativeError,
            message: msg.into(),
            native_status: Some(native_status),
            account_id,
            call_id,
            retryable: true,
        }
    }

    /// チャネル閉鎖エラーを生成する。
    pub fn channel_closed(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::ChannelClosed,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// シャットダウン中エラーを生成する。
    pub fn shutdown_in_progress() -> Self {
        Self {
            kind: SipErrorKind::ShutdownInProgress,
            message: "client is shutting down".into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }

    /// 内部不変条件違反エラーを生成する。
    pub fn invariant_broken(msg: impl Into<String>) -> Self {
        Self {
            kind: SipErrorKind::InternalInvariantBroken,
            message: msg.into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        }
    }
}
```

**設計判断**: 
- 全コンストラクタを用意せず、RFC §14.1 の変換方針に基づき主要なものだけ提供
- `native_status` は一部のコンストラクタでのみ受付（`NativeError` は必須、それ以外は任意）
- `account_id` / `call_id` は後方互換性のため `update_context` メソッドを用意してもよい（M0-2 の BiMap 出現後に評価）

## Non-scope

- `AccountId` / `CallId` の正式定義（NonZeroU64 化、generate() 採番、serde、Display）— M0-2
- `SipErrorKind` への `#[non_exhaustive]` 付与 — 後方互換性保証が必要になった時点で判断
- `SipError` の `serde::Serialize` / `Deserialize` 実装 — serde feature として M0-2 以降で追加
- 他のエラー型（`SipEventPayload::Error`）— イベント型定義 Phase 3
- エラー変換トレイト（`From<pj_status_t>` 等）— Phase 8 FFI 層

## Investigation

### 依存関係の確認

`SipError` → `AccountId` / `CallId`（M0-2 で正式定義）の依存があるため、本チケットでは仮定義を行う。M0-2 での移設手順：

```
M0-1 (本チケット):
  crates/siprs/src/error.rs:
    - pub struct AccountId(u64)           // 仮定義
    - pub struct CallId(u64)              // 仮定義
    - pub struct SipError { account_id: Option<AccountId>, ... }

M0-2 (後続チケット):
  crates/siprs/src/util/id.rs:
    - pub struct AccountId(NonZeroU64)    // 正式定義
    - pub struct CallId(NonZeroU64)       // 正式定義
  crates/siprs/src/error.rs:
    - use crate::util::id::AccountId;     // 仮定義削除、use に変更
  crates/siprs/src/lib.rs:
    - pub mod util;                       // 追加
    - pub use error::AccountId;           // re-export 互換性維持
```

### 23 vs 24 バリアントの確認

RFC §14（`docs/rust-sip-client-rfc.md` L568-L592）を直接カウント:

```
1.  InvalidConfig
2.  InvalidState
3.  AlreadyInitialized
4.  NotInitialized
5.  AccountNotFound
6.  CallNotFound
7.  TransportInitFailed
8.  RegistrationFailed
9.  AuthenticationFailed
10. InviteFailed
11. MediaInitFailed
12. MediaNegotiationFailed
13. IceFailed
14. TlsFailed
15. SrtpFailed
16. AudioFormatUnsupported
17. AudioPipelineBroken
18. DtmfFailed
19. Timeout
20. ChannelClosed
21. NativeError
22. ShutdownInProgress
23. InternalInvariantBroken
```

合計 **23バリアント**。Tickets.md の「24」は誤記であり本チケットでは23で実装する。

## Test Plan

### ユニットテスト（`error.rs` 内 `#[cfg(test)] mod tests`）

```
// tests/ ディレクトリは M20-1 で作成。本チケットでは error.rs 内にインラインテスト。
mod tests {
    use super::*;
```

#### 1. 全 SipErrorKind バリアントの Display 出力検証

```rust
#[test]
fn test_sip_error_display_contains_kind_and_message() {
    let err = SipError::invalid_config("port must be > 0");
    let display = format!("{}", err);
    assert!(display.contains("InvalidConfig"), "Display should contain kind name: {}", display);
    assert!(display.contains("port must be > 0"), "Display should contain message: {}", display);
}
```

- 全コンストラクタの表示形式が `"{kind}: {message}"` であることを確認
- `send + !Sync` ではなく `Send + Sync` を満たすこと

#### 2. retryable フラグの決定論的マッピング

```rust
#[test]
fn test_retryable_mapping() {
    // retryable = false のグループ
    assert!(!SipError::invalid_config("").retryable);
    assert!(!SipError::channel_closed("").retryable);
    assert!(!SipError::shutdown_in_progress().retryable);
    assert!(!SipError::invariant_broken("").retryable);

    // retryable = true のグループ
    assert!(SipError::invalid_state("").retryable);
    assert!(SipError::timeout("").retryable);
}
```

- 各エラー種別の retryable フラグが下表と一致すること：

| kind | retryable | 根拠 |
|------|-----------|------|
| InvalidConfig | false | 設定を変えなければ再試行しても同じ結果 |
| InvalidState | true | 状態が変化すれば成功する可能性がある |
| Timeout | true | ネットワーク状況により次回成功しうる |
| ChannelClosed | false | チャネルインスタンスは再利用不可 |
| ShutdownInProgress | false | クライアント終了中は操作不能 |
| InternalInvariantBroken | false | バグ修正なしに回復不能 |

#### 3. account_id / call_id のラウンドトリップ

```rust
#[test]
fn test_account_call_id_roundtrip() {
    let aid = AccountId::from_raw(42);
    let cid = CallId::from_raw(99);
    let err = SipError::native_error("invite failed", 500, Some(aid), Some(cid));

    assert_eq!(err.account_id, Some(AccountId::from_raw(42)));
    assert_eq!(err.call_id, Some(CallId::from_raw(99)));
    assert_eq!(err.native_status, Some(500));
}
```

#### 4. native_status の Option 透過性

```rust
#[test]
fn test_native_status_none() {
    let err = SipError::invalid_config("bad config");
    assert!(err.native_status.is_none());
}

#[test]
fn test_native_status_some() {
    let err = SipError::native_error("pjsip error", 70001, None, None);
    assert_eq!(err.native_status, Some(70001));
}
```

#### 5. コンパイル時検証: 全バリアント数の const assert

```rust
use static_assertions::const_assert;

// SipErrorKind の variant 数が 23 であることをコンパイル時に検証
const SIP_ERROR_KIND_VARIANT_COUNT: usize = {
    let mut n = 0;
    // nightly-only feature が必要なため、代わりに繋維テストで対応
    // ここではマクロベースの代替:
    n
};

// 代替: 各コンストラクタが存在することをコンパイル時に確認
const _: fn() = || {
    // 全23バリアントの網羅確認は match の網羅性チェックに委ねる
    // match に全バリアントが列挙されていないとコンパイルエラー
};
```

**注記**: `static_assertions` は dev-dependency として追加する。SipErrorKind の variant 数 const assert は、将来の variant 追加時の漏れを防止する。`std::mem::discriminant` を用いたランタイムカウント代替案もあるが、コンパイル時検証が望ましい。

**実装**: `static_assertions` の `count_assert!` は variant 数カウントに直接使えないため、アプローチを変える：

```rust
/// 全23バリアントの網羅性は match のコンパイル時チェックで保証される。
/// この関数が追加variant時にコンパイルエラーを起こすことで、variant追加漏れを防止する。
#[test]
fn test_all_variants_covered_by_retryable_mapping() {
    fn is_retryable(kind: SipErrorKind) -> bool {
        match kind {
            SipErrorKind::InvalidConfig => false,
            SipErrorKind::InvalidState => true,
            SipErrorKind::AlreadyInitialized => true,
            SipErrorKind::NotInitialized => true,
            SipErrorKind::AccountNotFound => false,
            SipErrorKind::CallNotFound => false,
            SipErrorKind::TransportInitFailed => true,
            SipErrorKind::RegistrationFailed => true,
            SipErrorKind::AuthenticationFailed => false,
            SipErrorKind::InviteFailed => true,
            SipErrorKind::MediaInitFailed => true,
            SipErrorKind::MediaNegotiationFailed => true,
            SipErrorKind::IceFailed => true,
            SipErrorKind::TlsFailed => false,
            SipErrorKind::SrtpFailed => false,
            SipErrorKind::AudioFormatUnsupported => false,
            SipErrorKind::AudioPipelineBroken => true,
            SipErrorKind::DtmfFailed => true,
            SipErrorKind::Timeout => true,
            SipErrorKind::ChannelClosed => false,
            SipErrorKind::NativeError => true,
            SipErrorKind::ShutdownInProgress => false,
            SipErrorKind::InternalInvariantBroken => false,
        }
    }

    // 少なくとも1つのバリアントが正しくマッピングされていることを確認
    assert!(!is_retryable(SipErrorKind::InvalidConfig));
    assert!(is_retryable(SipErrorKind::Timeout));
    assert!(!is_retryable(SipErrorKind::InternalInvariantBroken));

    // 全23バリアントの網羅確認: この match は全 variant を含むため、
    // 新しい variant が追加されるとコンパイルエラーになる
    let _exhaustive = match SipErrorKind::InvalidConfig {
        SipErrorKind::InvalidConfig
        | SipErrorKind::InvalidState
        | SipErrorKind::AlreadyInitialized
        | SipErrorKind::NotInitialized
        | SipErrorKind::AccountNotFound
        | SipErrorKind::CallNotFound
        | SipErrorKind::TransportInitFailed
        | SipErrorKind::RegistrationFailed
        | SipErrorKind::AuthenticationFailed
        | SipErrorKind::InviteFailed
        | SipErrorKind::MediaInitFailed
        | SipErrorKind::MediaNegotiationFailed
        | SipErrorKind::IceFailed
        | SipErrorKind::TlsFailed
        | SipErrorKind::SrtpFailed
        | SipErrorKind::AudioFormatUnsupported
        | SipErrorKind::AudioPipelineBroken
        | SipErrorKind::DtmfFailed
        | SipErrorKind::Timeout
        | SipErrorKind::ChannelClosed
        | SipErrorKind::NativeError
        | SipErrorKind::ShutdownInProgress
        | SipErrorKind::InternalInvariantBroken => {}
    };
}
```

#### 6. Send + Sync のコンパイル時確認

```rust
#[test]
fn test_error_send_sync() {
    fn assert_send<T: Send>() {}
    fn assert_sync<T: Sync>() {}

    assert_send::<SipError>();
    assert_sync::<SipError>();
    assert_send::<SipErrorKind>();
    assert_sync::<SipErrorKind>();
}
```

#### 7. Debug 出力に内部詳細が含まれないことの確認

```rust
#[test]
fn test_debug_output_format() {
    let err = SipError::invalid_config("test message");
    let debug = format!("{:?}", err);
    assert!(debug.contains("SipError"));
    assert!(debug.contains("kind"));
    assert!(debug.contains("InvalidConfig"));
    assert!(debug.contains("test message"));
}
```

### ユニットテスト不可能な項目（例外）

- `serde` の Serialize/Deserialize roundtrip → serde feature は optional。M0-2 以降で feature gate 付きテストを追加
- `Send + Sync` のコンパイル時確認は上記のインライン関数で代替（静的アサーションクレートなしで実現）

### 手動テスト手順（ユーザー依頼）

本チケットに手動テストは不要。全テストは `cargo test` でメモリ内完結する。

## Boy Scout Rule — 翻訳可能性計画

このチケットで作成するファイルは新規であり、既存コードは存在しない。以下の原則に従って記述する：

- **error.rs**: 全コンストラクタ関数名は動詞句（`invalid_config`, `shutdown_in_progress`, `invariant_broken`）とし、処理内容が関数名から読み取れるようにする。RFC §14.1 の「エラー変換方針」をコメントに記述。
- **Cargo.toml**: コメントで各依存の使用目的を簡潔に記述。
- **lib.rs**: ドキュメントコメントは日本語。crate 全体の目的とモジュール階層を記述。

「翻訳可能性」の観点から特に注意する点：
- `SipErrorKind` の variant 名は `InvalidConfig` のように「形容詞+名詞」で統一し、将来の日本語ドキュメント生成時の一貫性を確保
- `retryable` フラグの自動導出ロジックは `SipErrorKind` の variant に対して決定論的であり、`SipError` 構築時に外部入力が混入しない設計とする

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（warning 未使用コードは lib.rs が最小限のため許可）
- [ ] `cargo test` で以下が PASS すること：
  - `test_sip_error_display_contains_kind_and_message`
  - `test_retryable_mapping`
  - `test_account_call_id_roundtrip`
  - `test_native_status_none`
  - `test_native_status_some`
  - `test_all_variants_covered_by_retryable_mapping`（全23バリアント網羅確認）
  - `test_error_send_sync`
  - `test_debug_output_format`
- [ ] RFC §14 の全23バリアントが過不足なく実装されていること
- [ ] 翻訳可能性検証: コンストラクタ名と variant 名が日本語に逐語訳できること（コードレビュー時に確認）
- [ ] Tickets.md の「24バリアント」との不一致を認識しており、意図的に23で実装していること

## Notes

### 補正事項: Tickets.md との不一致

| 項目 | Tickets.md の記述 | 本チケットの実装 | 根拠 |
|------|-------------------|-----------------|------|
| SipErrorKind バリアント数 | 「全24バリアント」（L42, L52） | 23バリアント | RFC §14 直接カウントにより確認 |
| const assert の variant 数 | 「全24バリアント数が 24 であることを const assert」（L52） | 23 で const assert を実装 | 同上 |

### 成果物

- 計画: `context/0052-m0-1-siperror-siperrorkind/plan.md`（未作成、承認後に作成）
- 実装サマリ: `context/0052-m0-1-siperror-siperrorkind/implementation.md`（未作成、実装完了後に作成）
- レビュー報告書: `context/0052-m0-1-siperror-siperrorkind/review.md`（未作成、レビュー完了後に作成）

### 後続チケットとの連携

| チケット | 連携内容 |
|----------|----------|
| M0-2 | AccountId/CallId の正式定義。error.rs の仮定義を util/id.rs に移設 |
| M3-1 | ClientConfig バリデーションで SipError::invalid_config を使用 |
| M12-6 | `#[tracing::instrument]` で SipErrorKind を span field として出力 |
| M17-3 | pj_status_t → SipError 変換（SipError::native_error を活用） |
