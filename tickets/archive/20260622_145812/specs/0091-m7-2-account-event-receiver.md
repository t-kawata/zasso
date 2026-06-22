---
ticket_id: 91
title: "M7-2: AccountEventReceiver — アカウントフィルタリング"
slug: m7-2-account-event-receiver
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0091-m7-2-account-event-receiver/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0091-m7-2-account-event-receiver/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0091-m7-2-account-event-receiver/review.md
---

# M7-2: `AccountEventReceiver` — アカウントフィルタリング

## Summary

利用者が特定アカウントのイベントのみを購読できるようにするフィルタリングラッパーを実装する。内部で `broadcast::Receiver<SipEvent>` をラップし、`account_id` が一致しないイベントを透過的にスキップする。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§15.5)

## Background

### RFC 準拠

RFC §15.5「AccountEventReceiver は `account_id` に基づいて制御系イベントをフィルタリングする」。§15.7「イベントバスは観測用途であり確実配送を保証しない。ソースオブ真理は SipClient の query API」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M6-2 (#73) | `SipEvent` / `EventMeta` / `AccountId` — フィルタリング対象のイベント型 |
| M7-1 (#90) | `EventBus` — `subscribe_control()` が返す `broadcast::Receiver<SipEvent>` をラップ |
| M0-2 (#53) | `AccountId` — フィルタリング条件として使用 |

### 設計判断

- **`src/event.rs` への追記**: 既存の `event.rs` に追記
- **`recv()` は async**: `inner.recv().await` をループで呼び、一致するまでスキップ
- **`try_recv()`**: 非ブロッキング版。`broadcast::Receiver::try_recv()` のラッパー
- **フィルタリング条件**: `ev.meta.account_id == Some(self.account_id)` — `account_id` が `None` のイベント（`ClientInitialized` 等）は自動スキップ
- **`Lagged` 透過**: `inner.recv().await` の `RecvError::Lagged` をそのまま伝播

## Scope

### `crates/siprs/src/event.rs`（追記）

```rust
/// アカウント単位のイベントフィルタリングラッパー。
///
/// `broadcast::Receiver<SipEvent>` をラップし、指定された `account_id` に
/// 一致するイベントのみを透過的に抽出する。
pub struct AccountEventReceiver {
    /// フィルタリング対象のアカウント ID。
    account_id: AccountId,
    /// 内部の broadcast receiver。
    inner: tokio::sync::broadcast::Receiver<SipEvent>,
}

impl AccountEventReceiver {
    /// `AccountEventReceiver` を生成する。
    pub fn new(
        account_id: AccountId,
        inner: tokio::sync::broadcast::Receiver<SipEvent>,
    ) -> Self;

    /// フィルタリング対象のアカウント ID を返す。
    pub fn account_id(&self) -> AccountId;

    /// アカウントに一致するイベントを待機する。
    ///
    /// 一致しないイベントは透過的にスキップされる。
    pub async fn recv(
        &mut self,
    ) -> Result<SipEvent, tokio::sync::broadcast::error::RecvError>;

    /// 非ブロッキング版の受信。
    pub fn try_recv(
        &mut self,
    ) -> Result<Option<SipEvent>, tokio::sync::broadcast::error::TryRecvError>;
}
```

### テストコード（`event.rs` の既存テストモジュールに追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_account_event_recv_match` | 一致する `account_id` のイベントが `recv()` で返されること |
| 2 | `test_account_event_recv_skip_mismatch` | 一致しない `account_id` がスキップされること |
| 3 | `test_account_event_recv_skip_none` | `account_id = None` のイベントがスキップされること |
| 4 | `test_account_event_try_recv_match` | `try_recv()` で一致イベントが即時取得できること |
| 5 | `test_account_event_try_recv_empty` | 空時に `try_recv()` が適切なエラーを返すこと |
| 6 | `test_multiple_receivers_independent` | 複数の `AccountEventReceiver` が別 `account_id` で独立動作 |

## Non-scope

- `EventBus::subscribe_account()` — M12-3 で追加
- `tokio::test` 非同期ランタイム — 同期テスト（`try_recv`）で十分検証可能
- RecvError::Lagged の動作 — broadcast の API 仕様に準拠

## Test Plan

### 基本方針

同期 API（`try_recv`）でフィルタリングロジックを検証。非同期 `recv()` のループ動作は `try_recv` の繰り返しで間接的に検証する。`AccountId::generate()` で異なるアカウント ID を生成。

### ユニットテスト不可能な項目（例外）

- `.await` による実際の待機動作 — 非同期統合テストで検証（M12 以降）

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 232 テスト + 新規 6 テスト）
- [ ] `src/event.rs` に `AccountEventReceiver` が追加されている
- [ ] 4 メソッド（`new`, `account_id`, `recv`, `try_recv`）が実装されている
- [ ] `recv()` が一致しない `account_id` をスキップしてループすること
- [ ] `recv()` が `account_id = None` のイベントをスキップすること
- [ ] 全テストで `unwrap()` 不使用

## Notes

### フィルタリングの根拠

`account_id = None` のイベント（`ClientInitialized`, `Error` 等）はアカウントに紐づかない全体イベントであるため、`AccountEventReceiver` ではスキップされる。利用者は `EventBus::subscribe_control()` で全体イベントも購読できる。

### M7 マイルストーン

```text
M7-1 (#90): EventBus 構造体と基本操作 ← 完了済み
M7-2 (#91): AccountEventReceiver ← 本チケット
```
