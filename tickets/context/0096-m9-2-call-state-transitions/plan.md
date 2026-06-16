# 計画: チケット #96 — M9-2 CallState 遷移ロジック

## 要件

RFC §18.1 準拠。CallEvent (15 events) + 3 methods + 12 tests

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/call.rs | 追記 | CallEvent + 3 methods + 12 tests |

## 実装手順

1. call.rs に CallEvent + 3 methods 追加
2. 12 tests 追加
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on call.rs
- 全テスト PASS (270 + 12 = 282)
