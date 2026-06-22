---
ticket_id: 53
title: "M0-2: AccountId / CallId / AudioSourceId newtype 定義"
slug: m0-2-accountid-callid-audiosourceid
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0053-m0-2-accountid-callid-audiosourceid/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0053-m0-2-accountid-callid-audiosourceid/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0053-m0-2-accountid-callid-audiosourceid/plan.md
---
# M0-2: AccountId / CallId / AudioSourceId newtype 定義

## Summary

siprs crate の ID 型を正式定義する。M0-1 で `error.rs` に仮定義した `AccountId` / `CallId` を `util/id.rs` に移設し、`NonZeroU64` 化・採番機能追加・`AudioSourceId` 追加を行う。

以下のファイルを新規作成・修正し、`cargo build` / `cargo test` が通る状態にする：

- `crates/siprs/src/util/id.rs` — 新規：3 ID 型の正式定義
- `crates/siprs/src/util/mod.rs` — 新規：util モジュール宣言
- `crates/siprs/src/lib.rs` — 修正：`pub mod util` 追加、`pub use error::AccountId` re-export
- `crates/siprs/src/error.rs` — 修正：仮定義削除、`use crate::util::id::{AccountId, CallId}` に変更

## Background

### 依存関係の整理

M0-1 → M0-2 の移行で以下の依存関係を正式化する：

```
M0-1（仮定義）:
  error.rs: pub struct AccountId(u64)    ← 仮、NonZero制約なし
  error.rs: pub struct CallId(u64)       ← 仮、NonZero制約なし
  lib.rs:   なし（error.rs の pub が直公開）

M0-2（正式定義 — 本チケット）:
  util/id.rs: pub struct AccountId(NonZeroU64)  ← 正式、型安全
  util/id.rs: pub struct CallId(NonZeroU64)     ← 正式、型安全
  util/id.rs: pub struct AudioSourceId(NonZeroU64)  ← 新規
  error.rs:   use crate::util::id::{AccountId, CallId}  ← use に変更
  lib.rs:     pub mod util;                        ← 追加
  lib.rs:     pub use error::*;                    ← or 個別 re-export
```

### RFC 準拠

RFC §9 に完全準拠し、以下の型安全性を提供する：
- `NonZeroU64` によりゼロ値の未初期化誤用を型レベルで排除
- 3 つの ID 型は互いに異なる型であり、コンパイル時に混用を防止
- ランタイム一意性は単調増加 `AtomicU64` カウンタで保証
- PJSUA のネイティブ ID 再利用から利用者を保護（内部で `BiMap<RuntimeId, NativeId>` 変換）

## Scope

### 1. `crates/siprs/src/util/id.rs`（新規）

```rust
use std::fmt;
use std::num::NonZeroU64;
use std::sync::atomic::{AtomicU64, Ordering};

// ---------------------------------------------------------------------------
// AccountId
// ---------------------------------------------------------------------------

/// アカウント識別子（ランタイム一意）。
///
/// 内部表現は `NonZeroU64` であり、ゼロ値による未初期化誤用を型レベルで排除する。
/// PJSUA の `pjsua_acc_id` は再利用されうるため、そのまま公開せずこの型で隠蔽する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AccountId(NonZeroU64);

impl AccountId {
    /// 新しい一意なアカウント ID を生成する。
    ///
    /// 単調増加カウンタによりランタイム一意性を保証する。
    /// `u64::MAX` に達した場合はパニックする（現実的に到達不可能）。
    pub fn generate() -> Self {
        static NEXT_ACCOUNT_ID: AtomicU64 = AtomicU64::new(1);
        let id = NEXT_ACCOUNT_ID.fetch_add(1, Ordering::Relaxed);
        // SAFETY: AtomicU64 は 1 からカウントアップするため、NonZeroU64 は常に非ゼロ。
        Self(NonZeroU64::new(id).expect("AccountId counter overflowed u64::MAX"))
    }

    /// 内部の生の u64 値を取得する（FFI 境界等で使用）。
    pub fn into_raw(self) -> u64 {
        self.0.get()
    }
}

impl fmt::Display for AccountId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Account({})", self.0)
    }
}

// ---------------------------------------------------------------------------
// CallId
// ---------------------------------------------------------------------------

/// 通話識別子（ランタイム一意）。
///
/// 内部表現は `NonZeroU64`。PJSUA の `pjsua_call_id` は再利用されうるため、
/// そのまま公開せずこの型で隠蔽する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CallId(NonZeroU64);

impl CallId {
    /// 新しい一意な通話 ID を生成する。
    pub fn generate() -> Self {
        static NEXT_CALL_ID: AtomicU64 = AtomicU64::new(1);
        let id = NEXT_CALL_ID.fetch_add(1, Ordering::Relaxed);
        Self(NonZeroU64::new(id).expect("CallId counter overflowed u64::MAX"))
    }

    /// 内部の生の u64 値を取得する。
    pub fn into_raw(self) -> u64 {
        self.0.get()
    }
}

impl fmt::Display for CallId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Call({})", self.0)
    }
}

// ---------------------------------------------------------------------------
// AudioSourceId
// ---------------------------------------------------------------------------

/// 音声ソース識別子（ランタイム一意）。
///
/// OUT 方向へ音声を供給する任意の入力源を識別する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AudioSourceId(NonZeroU64);

impl AudioSourceId {
    /// 新しい一意な音声ソース ID を生成する。
    pub fn generate() -> Self {
        static NEXT_AUDIO_SOURCE_ID: AtomicU64 = AtomicU64::new(1);
        let id = NEXT_AUDIO_SOURCE_ID.fetch_add(1, Ordering::Relaxed);
        Self(NonZeroU64::new(id).expect("AudioSourceId counter overflowed u64::MAX"))
    }

    /// 内部の生の u64 値を取得する。
    pub fn into_raw(self) -> u64 {
        self.0.get()
    }
}

impl fmt::Display for AudioSourceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "AudioSource({})", self.0)
    }
}
```

#### serde サポート（optional feature）

`serde` feature が有効な場合のみ、`Serialize` / `Deserialize` を実現する。
`#[cfg(feature = "serde")]` ゲートでラップする。

```rust
#[cfg(feature = "serde")]
impl serde::Serialize for AccountId {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.get().serialize(serializer)
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for AccountId {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = u64::deserialize(deserializer)?;
        let inner = NonZeroU64::new(raw).ok_or_else(|| {
            serde::de::Error::custom("AccountId must be non-zero")
        })?;
        Ok(Self(inner))
    }
}

// CallId と AudioSourceId も同様
```

**設計判断**: `#[derive(Serialize, Deserialize)]` ではなく手動実装を選ぶ理由：
- 内部の `NonZeroU64` を透過的にシリアライズ（u64 として入出力）
- デシリアライズ時にゼロ値をチェックし、不変条件を回復
- derive だと内部構造が露出する可能性がある

#### モジュール構成

```rust
// util/id.rs 内の最終構成:

mod impl_serde;  // #[cfg(feature = "serde")] で条件コンパイル
```

または同一ファイル内で `#[cfg(feature = "serde")]` ブロック。

### 2. `crates/siprs/src/util/mod.rs`（新規）

```rust
//! ユーティリティモジュール。
//!
//! ID 型・内部データ構造・FFI ヘルパーなどを提供する。

pub mod id;
```

### 3. `crates/siprs/src/lib.rs`（修正）

```rust
//! # siprs — Async Rust SIP Client
//! ...

pub mod error;
pub mod util;

// Phase 1 で順次追加:
// pub mod audio;  // M1-1: AudioFormat, SampleRate 等
// pub mod config; // M1-3: TransportConfig, ClientConfig 等
```

**互換性**: M0-1 で `crate::error::AccountId` として公開されていた型は、M0-2 以降 `crate::util::id::AccountId` になる。ただし既存の error.rs 内のコードは `use crate::util::id::AccountId` で対応し、lib.rs での re-export は行わない（利用者が明示的にパス指定することを期待）。

**ただし**、既存の error.rs の `SipError` のフィールド `pub account_id: Option<AccountId>` は型の内部表現が変わっても `Option<AccountId>` は同一型名のため互換性を維持する。

### 4. `crates/siprs/src/error.rs`（修正）

削除するブロック（L15-L51）:

```rust
// 削除:
// // ---------------------------------------------------------------------------
// // AccountId / CallId 仮定義（M0-2 で util/id.rs に正式移設）
// // ---------------------------------------------------------------------------
// // TODO(M0-2): ...
// ...
// impl CallId { ... }
```

追加する use 文:

```rust
// ファイル先頭の use ブロックに追加:
use crate::util::id::{AccountId, CallId};
```

これにより error.rs の仮定義ブロック全体（約40行）が削除され、`use crate::util::id::{AccountId, CallId}` の1行に置き換わる。

**注意**: error.rs 内のテストコードで `AccountId::from_raw(0)` を使用している箇所を確認する。M0-1 の仮定義では `from_raw(0)` が許容されていたが、M0-2 の `NonZeroU64` 版では `from_raw` メソッド自体が存在しない（代わりに `into_raw` のみ）。テストコードがある場合は修正が必要：

```rust
// テスト修正例:
// M0-1: let aid = AccountId::from_raw(42);
// M0-2: let aid = AccountId::generate(); // またはテスト用の補助関数
```

**テスト用補助関数**: テストコードで特定の ID 値を構築する必要がある場合、以下を `#[cfg(test)]` ブロックに追加する：

```rust
#[cfg(test)]
impl AccountId {
    /// テスト用: 特定の u64 値から ID を生成する（テスト専用）。
    #[doc(hidden)]
    pub fn from_test(id: u64) -> Self {
        Self(NonZeroU64::new(id).expect("test: id must be non-zero"))
    }
}
```

## Non-scope

- `BiMap<RuntimeId, NativeId>` 実装 — M4-1
- `PjOwnedStr` safe ラッパー — M4-2
- `SipClient` API での ID 使用 — M12-1
- `serde::Serialize` / `Deserialize` の結合テスト — M20-1 統合テスト

## Investigation

### error.rs の仮定義削除範囲

M0-1 の `error.rs` L15-L51 が削除対象。該当行は:

```
L15: // ---------------------------------------------------------------------------
L16: // AccountId / CallId 仮定義（M0-2 で util/id.rs に正式移設）
L17: // ---------------------------------------------------------------------------
L18: // TODO(M0-2): ...
L19-L22: // ...
L24: // /// アカウント識別子...
L25-L37: // AccountId struct + from_raw
L39: // /// 通話識別子...
L40-L51: // CallId struct + from_raw
```

これらの行を削除し、代わりに `use crate::util::id::{AccountId, CallId};` をファイル先頭の use ブロックに追加する。

### テスト影響箇所

error.rs のテスト（M0-1 実装）で `AccountId::from_raw` / `CallId::from_raw` を使用している箇所：

1. `test_account_call_id_roundtrip` — `AccountId::from_raw(42)`, `CallId::from_raw(99)` を使用
   → `AccountId::from_test(42)`, `CallId::from_test(99)` に変更（または `generate()` に変更してアサーションを修正）

2. その他 — 現状 `from_raw` を使用しているテストは上記のみ

## Test Plan

### ユニットテスト計画

#### id.rs 内のテスト

| # | テスト名 | 内容 | 正常/異常 |
|---|---------|------|----------|
| 1 | test_account_id_generate_uniqueness | `generate()` 100回呼び出しで全値が一意 | 正常 |
| 2 | test_account_id_non_zero_invariant | `generate()` がゼロを返さないこと（100万回） | 正常 |
| 3 | test_account_id_equality | 同値性・HashMap キーとしての一貫性 | 正常 |
| 4 | test_account_id_ordering | PartialOrd + Ord が値の自然順序に従うこと | 正常 |
| 5 | test_account_id_display | Display が "Account(N)" 形式であること | 正常 |
| 6 | test_call_id_generate_uniqueness | CallId の一意性 | 正常 |
| 7 | test_call_id_display | Display が "Call(N)" 形式であること | 正常 |
| 8 | test_audio_source_id_generate_uniqueness | AudioSourceId の一意性 | 正常 |
| 9 | test_audio_source_id_display | Display が "AudioSource(N)" 形式であること | 正常 |
| 10 | test_id_types_not_interchangeable | 異種 ID 型間の代入がコンパイルエラーになること | コンパイル時検証 |
| 11 | test_id_send_sync_copy | Send + Sync + Copy を満たすこと | コンパイル時検証 |
| 12 | test_serde_roundtrip | serde feature 有効時、JSON roundtrip | 正常 |
| 13 | test_serde_rejects_zero | serde でゼロ値のデシリアライズがエラーになること | 異常 |

#### error.rs のテスト修正確認

- `test_account_call_id_roundtrip`: `from_raw(42)` / `from_raw(99)` を `from_test(42)` / `from_test(99)` に変更
- その他の error.rs テストは ID 型のインターフェース変更の影響を受けない（`Option<AccountId>` の比較のみ行うため）

### ユニットテスト不可能な項目（例外）

- serde の roundtrip test は `#[cfg(feature = "serde")]` ゲートが必要。デフォルトではスキップされる。M20-1 統合テストで feature 有効時の結合確認を行う。

## Boy Scout Rule — 翻訳可能性計画

M0-1 で仮定義されたコードを正式化するにあたり、以下の改善を行う：

- **error.rs**: 仮定義コメントブロック（〜40行）を削除し、`use crate::util::id::{AccountId, CallId}` の1行に置き換える。「なぜ一時的に u64 だったか」の説明は git log で確認できるため、コードには残さない
- **id.rs**: 各 ID 型の doc comment は日本語で「何のためにある型か」を簡潔に記述。Display 実装はデバッグ時に識別しやすい形式（`Account(1)` 等）とする
- `into_raw()` の doc comment には「FFI 境界以外で使用しないこと」と明記し、誤用を防止

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること
- [ ] RFC §9 の全 3 ID 型（AccountId, CallId, AudioSourceId）が実装済み
- [ ] 全 ID 型が `NonZeroU64` を内部表現として持つこと
- [ ] `generate()` が毎回異なる ID を返すこと
- [ ] 100 万回連続生成で NonZeroU64 不変条件が破れないこと
- [ ] 異種 ID 型間の比較がコンパイルエラーになること
- [ ] `error.rs` の仮定義が削除され、`use crate::util::id::*` に置き換わっていること
- [ ] `lib.rs` に `pub mod util;` が追加されていること

## Notes

### M0-1 からの移行パス

このチケット完了後、M0-1 の仮定義コードは全て除去される。互換性の観点では：
- `crate::error::AccountId` → 引き続き `crate::error` モジュール経由でアクセス可能（error.rs の `use` + lib.rs の `pub use` による透過）
- ただし利用者コードは `crate::util::id::AccountId` を直接使用することを推奨（error.rs の re-export は将来削除の可能性あり）
- **内部表現の変更**: `u64` → `NonZeroU64`。テストコードの `from_raw(x)` 呼び出しは `from_test(x)` に置き換え

### 後続チケットとの連携

| チケット | 連携内容 |
|----------|----------|
| M4-1 | BiMap<RuntimeId, NativeId> で AccountId/CallId をキーとして使用 |
| M12-1 | SipClient 構造体で AccountId を公開 API のパラメータとして使用 |
| M13-2 | make_call() の戻り値が CallId になる |
