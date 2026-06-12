# 計画: チケット #74 — M6-3 RawSipMessage / SipMessageDirection

## 要件

RFC §16 準拠。RawSipMessage (9 fields) + SipMessageDirection (Sent/Received) + with_redaction + from_raw_parts

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/event.rs | 追記 | RawSipMessage + SipMessageDirection + 8 tests |

## 実装手順

1. event.rs に追記
2. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on event.rs
- 全テスト PASS 確認 (216 + 8 = 224)
