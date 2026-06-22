# 計画: チケット #99 — M10-2 MockBackend

## 要件

RFC §27a/§43.2 準拠。テスト専用 SipBackend 実装

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/runtime/backend.rs | 追記 | MockBackend + SipBackend impl + 5 tests |

## 実装手順

1. backend.rs に MockBackend 追記
2. 5 tests 追加
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on backend.rs
- 全テスト PASS (291 + 5 = 296)
