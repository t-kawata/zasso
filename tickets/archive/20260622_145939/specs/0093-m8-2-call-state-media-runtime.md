---
ticket_id: 93
title: "M8-2: CallState / MediaRuntime 定義"
slug: m8-2-call-state-media-runtime
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0093-m8-2-call-state-media-runtime/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0093-m8-2-call-state-media-runtime/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0093-m8-2-call-state-media-runtime/review.md
---

# M8-2: `CallState` enum / `MediaRuntime` 定義

## Summary

通話の全ライフサイクル状態を表現する `CallState` enum（13バリアント）と、メディアランタイム情報 `MediaRuntime` 構造体を定義する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§18, §18.1)

## Background

### RFC 準拠

RFC §18「通話状態モデル（New, Calling, Trying, Ringing, EarlyMedia, Incoming, Connecting, Active, Held, Transferring, Disconnecting, Disconnected, Failed）」。§18.1 遷移規則。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M8-1 (#92) | `CallStateSkeleton` / `MediaRuntimeSkeleton` を本実装に差し替える |
| M8-3 (#94) | 間接依存（同一マイルストーンの sibling） |

### 設計判断

- **`src/call.rs`**: `CallState` enum に専念。`CallStateSkeleton` を `runtime/state.rs` から削除
- **`src/runtime/state.rs`**: スケルトン型 `CallStateSkeleton` / `MediaRuntimeSkeleton` を削除し、`CallState` / `MediaRuntime` で置き換え
- **`MediaRuntime` はスケルトン**: 実際のフィールド（`mixer`, `bridge`, `tap_handles`）は M14-M16 で追加。本チケットでは空構造体として定義
- **`#[non_exhaustive]`**: `CallState` に付与
- **`is_terminal()` / `is_active_media()`**: 即値比較のユーティリティメソッド

## Scope

### `crates/siprs/src/call.rs`（新規）

```rust
/// SIP 通話状態。
///
/// RFC §18 の通話状態機械（13バリアント）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum CallState {
    New,
    Calling,
    Trying,
    Ringing,
    EarlyMedia,
    Incoming,
    Connecting,
    Active,
    Held,
    Transferring,
    Disconnecting,
    Disconnected,
    Failed,
}

impl CallState {
    /// 終端状態かどうかを返す。
    pub fn is_terminal(&self) -> bool;

    /// メディアセッションが確立済みのアクティブ状態かどうかを返す。
    pub fn is_active_media(&self) -> bool;
}
```

### `crates/siprs/src/runtime/state.rs`（修正）

- `CallStateSkeleton` → `CallState` に差し替え
- `MediaRuntimeSkeleton` → `MediaRuntime` に差し替え（空構造体、M14 以降でフィールド追加）

```rust
/// メディアランタイム情報。
///
/// M14-M16 で実際のフィールド（mixer, bridge, tap_handles 等）が追加される。
#[derive(Debug)]
pub(crate) struct MediaRuntime;
```

### `crates/siprs/src/lib.rs`（修正）

- `pub mod call;` 追加

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_is_terminal` | `is_terminal()` が `Disconnected` / `Failed` のみ true |
| 2 | `test_is_not_terminal` | その他11バリアントで false |
| 3 | `test_is_active_media` | `is_active_media()` が `Active` / `Held` で true |
| 4 | `test_is_not_active_media` | その他11バリアントで false |
| 5 | `test_clone_copy_eq` | Clone / Copy / PartialEq が機能すること |
| 6 | `test_non_exhaustive` | `#[non_exhaustive]` が付与されていること |

## Non-scope

- `can_transition_to()` — M9-2 で実装
- `MediaRuntime` のフィールド定義 — M14-M16
- `CallEntry` の型差し替え — M8-1 の `CallStateSkeleton` 差し替えが本チケットに含まれる

## Test Plan

### 基本方針

全13バリアントの列挙とユーティリティメソッドの正常系を網羅。

### ユニットテスト不可能な項目（例外）

なし。

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 247 テスト + 新規 6 テスト）
- [ ] `src/call.rs` に `CallState` が定義されている
- [ ] `CallState` に `is_terminal()` / `is_active_media()` が実装されている
- [ ] `CallState` に `#[non_exhaustive]` が付与されている
- [ ] `runtime/state.rs` の `CallStateSkeleton` が `CallState` に置き換えられている
- [ ] `runtime/state.rs` の `MediaRuntimeSkeleton` が `MediaRuntime` に置き換えられている
- [ ] 全テストで `unwrap()` 不使用

## Notes

### CallEntry の型差し替え

M8-1 で `CallEntry` の `state` フィールドは `CallStateSkeleton` を使用していた。本チケットで `use crate::call::CallState;` に置き換え、`MediaRuntimeSkeleton` も `MediaRuntime` に置き換える。

### M8 マイルストーン

```text
M8-1 (#92): RegistrationState / ClientState / AccountEntry / CallEntry ← 完了済み
M8-2 (#93): CallState / MediaRuntime ← 本チケット
M8-3 (#94): ClientCapabilities / SrtpImplementation / AudioDeviceCaps
```
