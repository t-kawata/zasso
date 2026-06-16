---
ticket_id: 112
title: "M13-2: 発着信API — make_call / answer / hangup / hold / unhold / transfer / send_dtmf / call_state"
slug: m13-2-call-api
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0112-m13-2-call-api/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0112-m13-2-call-api/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0112-m13-2-call-api/review.md
---

# M13-2: 発着信API — `make_call` / `answer` / `hangup` / `hold` / `unhold` / `transfer` / `send_dtmf` / `call_state`

## Summary

通話操作 API を `SipClient` に追加する。`make_call`, `answer`, `hangup`, `hold`, `unhold`, `transfer`, `send_dtmf`, `call_state` の 8 メソッドを実装し、全操作は reactor 経由で直列化される。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§8.5, §19, §19.1, §20, §38)

## Background

### RFC 準拠

- §19 発着信 API 詳細
- §19.1 answer semantics（`180`/`183`/`200`/`486`/`603` のみ許可）
- §38 blind transfer mandatory

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M12-4 (#108) | `SipClient` 構造体 / `block_on` / `send_and_wait` |
| M12-5 (#109) | `ensure_not_shutdown()` |
| M12-6 (#110) | `#[tracing::instrument]` パターン |
| M13-1 (#111) | `SipAccountHandle` |
| M11-1 (#100) | `RuntimeCommand::MakeCall` / `Answer` / `Hangup` / `Hold` / `Unhold` / `SendDtmf` / `Transfer` |
| M9-2 (#86) | `CallState` 遷移ロジック |

## Scope

### `crates/siprs/src/client.rs`（追記）

`SipClient` に以下 8 メソッドを追加：

```rust
impl SipClient {
    pub fn make_call(&self, account_id: AccountId, request: OutgoingCallRequest) -> Result<CallId, SipError>;
    pub fn answer(&self, call_id: CallId, code: u16) -> Result<(), SipError>;
    pub fn hangup(&self, call_id: CallId, reason: HangupReason) -> Result<(), SipError>;
    pub fn hold(&self, call_id: CallId) -> Result<(), SipError>;
    pub fn unhold(&self, call_id: CallId) -> Result<(), SipError>;
    pub fn transfer(&self, call_id: CallId, target: String) -> Result<(), SipError>;
    pub fn send_dtmf(&self, call_id: CallId, digits: String, method: DtmfMethod) -> Result<(), SipError>;
    pub fn call_state(&self, call_id: CallId) -> Result<CallState, SipError>;
}
```

### 設計判断

- **`answer` コード制限**: 180/183/200/486/603 のみ許可、それ以外は `InvalidConfig`
- **`call_state()` は RTT 不要**: `state.blocking_read()` で snapshot 読み取り
- **全操作に `ensure_not_shutdown()` チェック**: shutdown 後は `ShutdownInProgress`
- **`send_dtmf` の `digits` は `String`**: 現時点では `Into<String>` 未使用（将来の overload で対応）

### テストコード

| # | テスト | 内容 |
|---|--------|------|
| 1 | `test_make_call` | RuntimeCommand の配送確認 |
| 2 | `test_answer_ok` | 200 OK の配送確認 |
| 3 | `test_answer_invalid_code` | 999 → エラー確認 |
| 4 | `test_hangup` | Hangup コマンド配送確認 |
| 5 | `test_hold_unhold` | Hold/Unhold 配送確認 |
| 6 | `test_transfer` | Transfer 配送確認 |
| 7 | `test_send_dtmf` | SendDtmf 配送確認 |
| 8 | `test_call_state` | state snapshot 読み取り確認 |
| 9 | `test_call_after_shutdown` | shutdown 後 → ShutdownInProgress |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS
- [ ] SipClient に 8 メソッド追加済み
- [ ] `answer` の不正コードチェックが動作すること

## Notes

### M13 マイルストーン

```text
M13-1 (#111) ✅ | M13-2 (#112) ← 本チケット
```
