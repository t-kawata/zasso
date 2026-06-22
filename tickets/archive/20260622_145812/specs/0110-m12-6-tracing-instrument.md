---
ticket_id: 110
title: "M12-6: 全公開API・PJSIP callback への `#[tracing::instrument]` 計装"
slug: m12-6-tracing-instrument
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0110-m12-6-tracing-instrument/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0110-m12-6-tracing-instrument/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0110-m12-6-tracing-instrument/review.md
---

# M12-6: 全公開API・PJSIP callback への `#[tracing::instrument]` 計装

## Summary

全公開 API メソッドに `#[tracing::instrument]` を付与し、`account_id`, `call_id`, `SipErrorKind` 等のコンテキストフィールドを構造化ログとして出力する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§34.1)

## Background

### RFC 準拠

RFC §34.1「全 public operation と native callback を tracing span で囲む」。例: `#[tracing::instrument(skip(self, request), fields(account_id = %self.id()))]`。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M12-1 (#104) | `SipClient` 構造体定義 |
| M12-4 (#108) | `add_account` / `remove_account` / `account` / `accounts` |
| M12-5 (#109) | `shutdown()` / `is_shutdown()` |

### 設計判断

- **spam 抑制**: `AudioTapHandle::recv` は `trace` レベルで計装（大量呼び出し想定）
- **機密情報**: `SecretString` は `skip` に含める
- **音声データ**: `AudioChunk` の実データは span に含めない

## Scope

### 計装対象

**SipClient 公開メソッド:**

| メソッド | instrument 方針 |
|----------|----------------|
| `new` | `skip(config, backend)`, 結果を `Debug` |
| `add_account` | `skip(config)` |
| `remove_account` | `fields(account_id = %account_id)` |
| `account` | `fields(account_id = %account_id)` |
| `accounts` | シンプル |
| `subscribe` | シンプル |
| `subscribe_raw_sip` | シンプル |
| `subscribe_account` | `fields(account_id = %account_id)` |
| `shutdown` | シンプル |
| `is_shutdown` | シンプル |

**PJSIP extern "C" callback:** `tracing::trace!` で各呼び出しを記録（debug ビルドのみ活性化）。

### 計装ルール

- `account_id`/`call_id` は `Display` で `%`（構造化フィールド）
- 音声データ（`AudioChunk` の実データ）は span に含めない
- `SecretString` は `skip` に含める
- `SipError` が返る場合、エラーの `kind` と `message` を記録

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | CI script | 全公開 API に `#[tracing::instrument]` が付与されていること（`grep -c` カウント） |
| 2 | compile | `#[tracing::instrument]` の `skip` / `fields` 指定がコンパイルエラーでないこと |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS
- [ ] 全公開 API に `#[tracing::instrument]` が付与されていること
- [ ] `SecretString` を含む span 出力にパスワードが含まれないこと（将来の `tracing-test` 確認含む）
- [ ] `let _ =` による戻り値の意図的捨てが正しい箇所にのみ存在すること

## Notes

### M12 マイルストーン

```text
M12-1〜M12-4 ✅ | M12-5 (#109) ✅ | M12-6 (#110) ← 本チケット
```
