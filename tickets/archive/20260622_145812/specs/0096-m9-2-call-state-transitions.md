---
ticket_id: 96
title: "M9-2: CallState 遷移ロジック"
slug: m9-2-call-state-transitions
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0096-m9-2-call-state-transitions/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0096-m9-2-call-state-transitions/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0096-m9-2-call-state-transitions/review.md
---

# M9-2: `CallState` 遷移ロジック

## Summary

通話状態の正当な遷移を保証する。発信・着信の両経路、Hold/Unhold/Transfer、切断までの全パスを状態機械で表現する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§18, §18.1)

## Background

### RFC 準拠

RFC §18.1 遷移規則（発信パス、着信パス、Hold/Unhold/Transfer、切断パス）。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M8-2 (#93) | `CallState` enum（13 variants） |
| M0-1 (#52) | `SipError` / `SipErrorKind::InvalidState` |
| M6-2 (#73) | `EventDirection` — `CallState::direction()` の戻り値 |

### 設計判断

- **`src/call.rs`**: `CallState` と同じファイルにメソッドを追加
- **`CallEvent` enum**: 同一ファイルに定義。発信系5 + 着信系2 + 制御系4 + 切断系4 = 15 イベント
- **`can_transition_to()`**: 状態遷移表に基づく判定
- **`apply_call_event()`**: イベント適用 + 状態更新
- **`direction()`**: `New` では `None`、OutgoingCallStarted 後は `Outbound`、IncomingCall 後は `Inbound`

## Scope

### `crates/siprs/src/call.rs`（追記）

```rust
/// 通話状態遷移イベント。
pub enum CallEvent {
    // ── 発信系 ──
    Dialed,
    Provisional(u16),
    EarlyMedia,
    Connected(u16),
    // ── 着信系 ──
    Incoming,
    Answered(u16),
    // ── 制御系 ──
    Hold,
    Unhold,
    ReferSent,
    ReferSuccess,
    ReferFailed,
    // ── 切断系 ──
    Bye,
    Cancel,
    Failure(u16, String),
    LocalHangup,
}

impl CallState {
    pub fn can_transition_to(&self, next: CallState) -> bool;
    pub fn apply_call_event(&mut self, event: CallEvent) -> Result<(), SipError>;
    pub fn direction(&self) -> Option<EventDirection>;
}
```

### テストコード

12 テスト（発信正常系、EarlyMedia経由、着信正常系、Hold/Unhold、Transfer、Failure、Timeout、Cancel、切断後操作、max_calls、全テーブル、direction）

## Non-scope

- `max_calls` 上限チェック — M9-3
- MockBackend を使用した結合テスト — M10-2

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 270 + 新規 12）
- [ ] `src/call.rs` に `CallEvent` enum が追加されている
- [ ] `CallState` に 3 メソッド（`can_transition_to`, `apply_call_event`, `direction`）が実装されている
- [ ] `apply_call_event()` が不正遷移を `SipError::InvalidState` で拒否すること
- [ ] 全テストで `unwrap()` 不使用

## Notes

### 遷移表（発信・着信・制御・切断の全パス）

発信: New→Calling→Trying→Ringing→Connecting→Active
着信: New→Incoming→Connecting→Active
制御: Active↔Held, Active↔Transferring
切断: Active/Held/Transferring→Disconnecting→Disconnected
失敗: Ringing/EarlyMedia/Connecting→Failed

### M9 マイルストーン

```text
M9-1 (#95): RegistrationState 遷移ロジック ← 完了済み
M9-2 (#96): CallState 遷移ロジック ← 本チケット
M9-3 (#97): ClientState 管理
```
