---
ticket_id: 104
title: "M12-1: SipClient 構造体（Arc + ClientInner）"
slug: m12-1-sip-client
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0104-m12-1-sip-client/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0104-m12-1-sip-client/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0104-m12-1-sip-client/review.md
---

# M12-1: `SipClient` 構造体（Arc + ClientInner）

## Summary

crate の公開APIのルートとなる `SipClient` 構造体を定義する。`Arc` で内部状態を共有し、`Clone` 可能な薄いハンドルとして振る舞う。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§8.2)

## Background

### RFC 準拠

RFC §8.2「SipClient は参照カウント化された薄いハンドルであり、内部に reactor handle、イベントバス、アカウント/通話インデックス、shutdown state を持つ」。§5「SipClient: Send + Sync の成立」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M11-2 (#101) | `RuntimeHandle` — reactor 通信 |
| M7-1 (#90) | `EventBus` — イベント配信 |
| M8-1 (#92) | `ClientState` — ランタイム状態 |
| M10-1 (#98) | `SipBackend` — バックエンド抽象化 |

### 設計判断

- **`src/client.rs`**: 新規ファイル。`SipClient` と `ClientInner` を定義
- **`Arc<ClientInner>`**: 内部状態を参照カウントで共有。Clone = Arc::clone
- **`ClientInner`**: `RuntimeHandle` / `EventBus` / `RwLock<ClientState>` / `watch::Sender<bool>`
- **`Debug` 手動実装**: 内部状態の一部のみ表示（パスワード等の機密情報を除外）

## Scope

### `crates/siprs/src/client.rs`（新規）

```rust
/// SIP クライアントのルートハンドル。
///
/// 参照カウント化された薄いハンドルであり、`Clone` 可能。
/// 内部状態へのアクセスは `RwLock` で保護され、状態変更は reactor 経由でのみ行われる。
#[derive(Clone)]
pub struct SipClient {
    inner: Arc<ClientInner>,
}

/// SipClient の内部状態。
struct ClientInner {
    /// Reactor との通信ハンドル。
    runtime: RuntimeHandle,
    /// イベント配信バス。
    events: EventBus,
    /// ランタイム状態（RwLock 保護）。
    state: tokio::sync::RwLock<ClientState>,
    /// シャットダウン通知送信側。
    shutdown: tokio::sync::watch::Sender<bool>,
}
```

### `crates/siprs/src/lib.rs`（修正）

- `// pub mod client;` → `pub mod client;`
- `pub use client::SipClient;`

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_sip_client_send_sync` | `Send + Sync` コンパイル時検証 |
| 2 | `test_sip_client_clone` | Clone が内部状態を共有すること |
| 3 | `test_sip_client_debug` | Debug 出力に機密情報が含まれないこと |

## Non-scope

- `SipClient::new()` — M12-2
- `subscribe()` / `add_account()` 等のAPI — M12-3, M12-4

## Test Plan

### 基本方針

コンパイル時検証と基本操作の正常系テスト。

### ユニットテスト不可能な項目（例外）

- 実際の reactor を使用した統合 — M12-2 以降

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 305 + 新規 3）
- [ ] `src/client.rs` が作成されている
- [ ] `SipClient` が `Clone` + `Send + Sync` であること
- [ ] `SipClient` の `Debug` 実装が機密情報を露出しないこと
- [ ] 全テストで `unwrap()` 不使用

## Notes

### ClientInner のフィールド

`ClientInner` は API 利用者に直接露出しない。全操作は `SipClient` のメソッド経由で行われ、内部では `self.inner.runtime` を通じて reactor と通信する。

### M12 マイルストーン

```text
M12-1 (#104): SipClient 構造体（Arc + ClientInner）← 本チケット
M12-2 (#105): SipClient::new() — 初期化・バリデーション・Reactor起動
M12-3 (#106): subscribe() / subscribe_raw_sip() / subscribe_account()
M12-4 (#107): add_account() / remove_account() / account() / accounts()
M12-5 (#108): SipClient::shutdown() — idempotent・cancel safety
M12-6 (#109): 全公開APIへの #[tracing::instrument] 計装
```
