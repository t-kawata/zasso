---
ticket_id: 106
title: "M12-3: subscribe() / subscribe_raw_sip() / subscribe_account()"
slug: m12-3-subscribe
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0106-m12-3-subscribe/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0106-m12-3-subscribe/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0106-m12-3-subscribe/review.md
---

# M12-3: `subscribe()` / `subscribe_raw_sip()` / `subscribe_account()`

## Summary

利用者がイベントを購読するための3つの入口を `SipClient` に追加する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§8.3, §15.4, §15.5)

## Background

### RFC 準拠

RFC §8.3「subscribe() は制御系イベントの broadcast receiver を購読する」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M7-1 (#90) | `EventBus` / `subscribe_control` / `subscribe_raw_sip` |
| M7-2 (#91) | `AccountEventReceiver` |
| M6-3 (#74) | `RawSipMessage` |
| M12-1 (#104) | `SipClient` / `ClientInner` |

### 設計判断

- 全メソッドは `EventBus` または `AccountEventReceiver` への委譲
- 同期的（async 不要）

## Scope

### `crates/siprs/src/client.rs`（追記）

```rust
impl SipClient {
    /// 制御系イベントを購読する。
    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<SipEvent>;

    /// RawSIP メッセージを購読する（無効時は None）。
    pub fn subscribe_raw_sip(&self) -> Option<tokio::sync::broadcast::Receiver<RawSipMessage>>;

    /// 特定アカウントのイベントのみを購読する。
    pub fn subscribe_account(&self, account_id: AccountId) -> AccountEventReceiver;
}
```

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_subscribe_control` | subscribe → publish → 受信一致 |
| 2 | `test_subscribe_account_filter` | subscribe_account → account_id フィルタ |
| 3 | `test_multiple_subscribe` | 複数 subscribe が独立した receiver |

## Non-scope

- 実際のイベント配信 — M12-2 の初期化テストですでに確認済み

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 311 + 新規 3）
- [ ] 3 つの subscribe メソッドが `SipClient` に追加されていること
- [ ] 全テストで `unwrap()` 不使用

## Notes

### M12 マイルストーン

```text
M12-1 (#104): SipClient ✅
M12-2 (#105): SipClient::new() ✅
M12-3 (#106): subscribe / subscribe_raw_sip / subscribe_account ← 本チケット
M12-4 (#107): add_account / remove_account
M12-5 (#108): SipClient::shutdown()
M12-6 (#109): tracing instrument
```
