---
ticket_id: 109
title: "M12-5: SipClient::shutdown() — idempotent・cancel safety"
slug: m12-5-shutdown
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0109-m12-5-shutdown/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0109-m12-5-shutdown/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0109-m12-5-shutdown/review.md
---

# M12-5: `SipClient::shutdown()` — idempotent・cancel safety

## Summary

安全なクリーンアップシーケンス `SipClient::shutdown()` を実装する。idempotent で 2回目以降の呼び出しは `Ok(())` を即座に返す。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§32, §32.1)

## Background

### RFC 準拠

RFC §32「shutdown() は idempotent である。進行中 command をこれ以上受け付けず、全リソースを解放する」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M12-1 (#104) | `SipClient` / `ClientInner` |
| M11-1 (#100) | `RuntimeCommand::Shutdown` |

### 設計判断

- **`shutdown()` は同期的**: `block_on` で reactor からの応答を待つ
- **idempotent**: 2回目は `watch` チャネルで既に shutdown 状態を検知し即座に `Ok(())`

## Scope

### `crates/siprs/src/client.rs`（追記）

```rust
impl SipClient {
    /// シャットダウンする（idempotent）。
    pub fn shutdown(&self) -> Result<(), SipError>;

    /// シャットダウン状態かを確認する。
    pub fn is_shutdown(&self) -> bool;
}
```

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_shutdown_idempotent` | 2回目も `Ok(())` |
| 2 | `test_is_shutdown` | shutdown 後 `is_shutdown() == true` |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 318 + 新規 2）
- [ ] `shutdown()` が idempotent であること
- [ ] `is_shutdown()` が shutdown 状態を正しく返すこと

## Notes

### M12 マイルストーン

```text
M12-1〜M12-4 ✅ | M12-5 (#109) ← 本チケット | M12-6 (#110) 未着手
```
