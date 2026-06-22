---
ticket_id: 90
title: "M7-1: EventBus 構造体と基本操作"
slug: m7-1-event-bus
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0090-m7-1-event-bus/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0090-m7-1-event-bus/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0090-m7-1-event-bus/review.md
---

# M7-1: `EventBus` 構造体と基本操作

## Summary

全イベント配送の中核 `EventBus` を実装する。`control` バス（制御系イベント）と `raw_sip` バス（RawSIP メッセージ）の2チャネル構成により、大量の RawSIP メッセージが制御系イベントの配送に影響しない。`tokio::sync::broadcast` で非同期待機可能な購読機構を提供する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§15.4, §15.6, §15.7)

## Background

### RFC 準拠

RFC §15.4「制御系イベントと RawSIP メッセージを別バスで配信する。これにより RawSIP 有効時の制御系イベント取りこぼしを防止する」。§15.6「制御系イベントは control バスで配送される。順序は単一プロデューサ内で preserve される」。§15.7「両バスとも確実配送は保証されない」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M6-2 (#73) | `SipEvent` — `control` バスで配送されるイベント型 |
| M6-3 (#74) | `RawSipMessage` — `raw_sip` バスで配送されるメッセージ型 |
| 新規 | `tokio` crate — `tokio::sync::broadcast` が必要 |

### 設計判断

- **`src/event.rs` への追記**: 既存の `event.rs` に `EventBus` 構造体を追記
- **`tokio::sync::broadcast`**: 非同期待機可能な購読機構を提供。`broadcast::Receiver` を `tokio::select!` で待機可能
- **`Clone` derive**: `SipClient` が `EventBus` を保持し、reactor や callback bridge と共有するため
- **`publish` のエラー無視**: 購読者不在時の `send` エラーは無視（`let _ = tx.send(event)`）
- **`raw_sip` チャネル**: `Option<broadcast::Sender>` で有効/無効を表現。無効時は購読不可・発行 no-op
- **`tokio` 依存の追加**: 本チケットで `cargo add tokio` を実行

## Scope

### `crates/siprs/src/event.rs`（追記）

```rust
/// イベント配送バス。
///
/// 制御系イベント（`control`）と RawSIP メッセージ（`raw_sip`）の
/// 2 チャネル構成で、大量の RawSIP メッセージが制御系イベントの
/// 配送に影響しないことを保証する。
#[derive(Clone)]
pub struct EventBus {
    /// 制御系イベントのプライマリバス。
    control: broadcast::Sender<SipEvent>,
    /// RawSIP メッセージ専用バス（有効時のみ）。
    raw_sip: Option<broadcast::Sender<RawSipMessage>>,
}

impl EventBus {
    /// `EventBus` を生成する。
    ///
    /// `raw_sip_capacity` が `None` の場合、RawSIP バスは作成されない。
    pub fn new(control_capacity: usize, raw_sip_capacity: Option<usize>) -> Self;

    /// 制御系イベントを購読する。
    pub fn subscribe_control(&self) -> broadcast::Receiver<SipEvent>;

    /// RawSIP メッセージを購読する（無効時は `None`）。
    pub fn subscribe_raw_sip(&self) -> Option<broadcast::Receiver<RawSipMessage>>;

    /// 制御系イベントを発行する。
    ///
    /// 購読者不在時はエラーを無視する。
    pub fn publish(&self, event: SipEvent);

    /// RawSIP メッセージを発行する（専用バスが有効な場合のみ）。
    ///
    /// 無効時は no-op（パニックしない）。
    pub fn publish_raw_sip(&self, msg: RawSipMessage);
}
```

### `crates/siprs/Cargo.toml`（修正）

- `cargo add tokio` で `tokio` 依存を追加（features: `sync`）

### テストコード（`event.rs` の既存テストモジュールに追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_event_bus_publish_subscribe` | `publish` → `subscribe_control` で受信確認 |
| 2 | `test_event_bus_multiple_subscribers` | 複数購読者が同時受信できること |
| 3 | `test_event_bus_raw_sip_disabled` | `raw_sip_capacity = None` → `subscribe_raw_sip` が `None` |
| 4 | `test_event_bus_raw_sip_enabled` | `raw_sip_capacity = Some(64)` → `subscribe_raw_sip` が `Some` |
| 5 | `test_event_bus_publish_raw_sip_disabled_noop` | `raw_sip` 無効時に `publish_raw_sip` が no-op |
| 6 | `test_event_bus_publish_no_listener` | 購読者不在の `publish` がパニックしない |
| 7 | `test_event_bus_separate_channels` | `control` と `raw_sip` のイベントが干渉しないこと |
| 8 | `test_event_bus_clone` | `Clone` 後も同一バスを共有すること |

## Non-scope

- `AccountEventReceiver` — M7-2
- `#[cfg(feature = "serde")]` — 別チケット
- `tracing` による配送ログ — 後続チケット

## Test Plan

### 基本方針

`tokio::sync::broadcast` の同期待機 API（`try_recv`）を使用し、非同期ランタイムなしで検証する。`send` 直後に `try_recv` で即時受信できる broadcast の特性を活かす。

### ユニットテスト不可能な項目（例外）

- 非同期待機（`.recv().await`）の動作 — 非同期統合テストで検証（M12 以降）

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 224 テスト + 新規 8 テスト）
- [ ] `cargo add tokio --features sync` が成功していること
- [ ] `src/event.rs` に `EventBus` が追加されている
- [ ] 5 メソッド（`new`, `subscribe_control`, `subscribe_raw_sip`, `publish`, `publish_raw_sip`）が実装されている
- [ ] 購読者不在時の `publish` がパニックしないこと
- [ ] 全テストで `unwrap()` 不使用

## Notes

### tokio 依存の追加

`cargo add tokio --package siprs --features sync` で依存を追加する。`sync` feature のみで十分（`broadcast` は `sync` feature に含まれる）。runtime は呼び出し側が提供する。

### バス構成の意義

`raw_sip` チャネルが `Option` なのは、`RawSipEventConfig::enabled == false` の場合にゼロオーバーヘッドを達成するため。無効時はチャネル自体が作成されず、メモリもタスクも消費しない。

### M7 マイルストーン

```text
M7-1 (#75): EventBus 構造体と基本操作 ← 本チケット
M7-2 (#76): AccountEventReceiver — アカウントフィルタリング
```
