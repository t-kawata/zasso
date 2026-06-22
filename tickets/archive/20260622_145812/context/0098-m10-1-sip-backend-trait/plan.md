# 計画: チケット #98 — M10-1 SipBackend trait

## 要件

RFC §27a 準拠。SipBackend trait (14 methods) + 3 type aliases

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/runtime/backend.rs | 新規 | SipBackend trait + 3 型エイリアス + 3 tests |
| crates/siprs/src/runtime/mod.rs | 修正 | pub mod backend; |

## 実装手順

1. backend.rs 作成
2. mod.rs 修正
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on backend.rs
- 全テスト PASS (288 + 3 = 291)
