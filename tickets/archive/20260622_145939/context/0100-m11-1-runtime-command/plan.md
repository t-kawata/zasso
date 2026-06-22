# 計画: チケット #100 — M11-1 RuntimeCommand enum

## 要件

RFC §7.2 準拠。RuntimeCommand (17 vars) + HangupReason (5 vars)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/runtime/command.rs | 新規 | RuntimeCommand + HangupReason + 2 tests |
| crates/siprs/src/runtime/mod.rs | 修正 | pub mod command; |

## 実装手順

1. command.rs 作成
2. mod.rs 修正
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on command.rs
- 全テスト PASS (296 + 2 = 298)
