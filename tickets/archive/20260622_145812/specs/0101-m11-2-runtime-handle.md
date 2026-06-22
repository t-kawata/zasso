---
ticket_id: 101
title: "M11-2: RuntimeHandle — MPSC + oneshot 送受信"
slug: m11-2-runtime-handle
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0101-m11-2-runtime-handle/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0101-m11-2-runtime-handle/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0101-m11-2-runtime-handle/review.md
---

# M11-2: `RuntimeHandle` — MPSC + oneshot 送受信

## Summary

`SipClient` が reactor と通信するためのハンドル `RuntimeHandle` を実装する。`tokio::sync::mpsc::unbounded_channel` でコマンドを送信し、`oneshot` で結果を待ち受ける。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§7.2)

## Background

### RFC 準拠

RFC §7.2「公開 API は RuntimeCommand を unbounded MPSC で reactor へ送る」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M11-1 (#100) | `RuntimeCommand` — 送信するコマンド型 |

### 設計判断

- **`src/runtime/handle.rs`**: 新規ファイル
- **`RuntimeHandle`**: `mpsc::UnboundedSender<RuntimeCommand>` のラッパー
- **`send_and_wait<T>`**: クロージャでコマンド生成 + oneshot 送信 + 非同期待機を一度に行う汎用ヘルパー
- **`Clone`**: `UnboundedSender` は Clone。`RuntimeHandle` も Clone 可能

## Scope

### `crates/siprs/src/runtime/handle.rs`（新規）

```rust
use crate::error::SipError;
use crate::runtime::command::RuntimeCommand;

/// Reactor との通信ハンドル。
///
/// `SipClient` および `SipAccountHandle` が reactor と通信するための
/// MPSC 送信チャネル。`Clone` 可能。
#[derive(Clone)]
pub(crate) struct RuntimeHandle {
    tx: tokio::sync::mpsc::UnboundedSender<RuntimeCommand>,
}

impl RuntimeHandle {
    /// ハンドルと対応する receiver を生成する。
    pub fn new() -> (Self, tokio::sync::mpsc::UnboundedReceiver<RuntimeCommand>);

    /// コマンドを reactor に送信する（非ブロッキング）。
    pub fn send(&self, cmd: RuntimeCommand) -> Result<(), SipError>;

    /// コマンドを送信し、結果を非同期待機する。
    pub async fn send_and_wait<T>(
        &self,
        f: impl FnOnce(tokio::sync::oneshot::Sender<Result<T, SipError>>) -> RuntimeCommand,
    ) -> Result<T, SipError>;

    /// reactor 側の receiver が drop されたかを確認する。
    pub fn is_closed(&self) -> bool;
}
```

### `crates/siprs/src/runtime/mod.rs`（修正）

- `pub mod handle;` 追加

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_send_receive` | `send` → reactor 側 `recv` が同一コマンド |
| 2 | `test_send_and_wait_roundtrip` | `send_and_wait` → oneshot reply ラウンドトリップ |
| 3 | `test_clone_handle` | Clone 後も送信可能 |
| 4 | `test_is_closed` | receiver drop 後 `is_closed() == true` |

## Non-scope

- Reactor loop — M11-3
- `SipClient` との統合 — M12

## Test Plan

### 基本方針

`#[tokio::test]` で非同期テスト。`tokio::sync:: oneshot` と `mpsc` の基本動作を検証。

### ユニットテスト不可能な項目（例外）

- Reactor loop との結合 — M11-3

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 298 + 新規 4）
- [ ] `RuntimeHandle` が `Clone` であること
- [ ] `send_and_wait` が汎用ヘルパーとして機能すること
- [ ] 全テストで `unwrap()` 不使用

## Notes

### send_and_wait の design

`send_and_wait<T>` はクロージャを受け取り、その中で `oneshot::Sender` を含む `RuntimeCommand` を生成する。これにより呼び出し側は「コマンド生成」と「結果受信」を単一の async 呼び出しで行える。

### M11 マイルストーン

```text
M11-1 (#100): RuntimeCommand enum 定義 ← 完了済み
M11-2 (#101): RuntimeHandle ← 本チケット
M11-3 (#102): Reactor loop — 単一スレッドでのコマンド処理
```
