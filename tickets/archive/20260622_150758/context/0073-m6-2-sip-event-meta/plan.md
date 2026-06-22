# 計画: チケット #73 — M6-2 SipEvent / EventMeta / EventTimestamp

## 要件

RFC §15.2/§15.3 準拠。SipEvent エンベロープ + EventMeta (9 fields) + EventTimestamp + EventDirection + EventMetaBuilder

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/event.rs | 追記 | 5 構造体/列挙型 + 7 tests |

## 実装手順

1. event.rs に追記
2. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on event.rs
- 翻訳可能性 grep
- 全テスト PASS 確認 (209 + 7 = 216)
