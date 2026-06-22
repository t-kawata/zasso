# 計画: チケット #101 — M11-2 RuntimeHandle

## 要件

RFC §7.2 準拠。MPSC + oneshot RuntimeHandle

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/runtime/handle.rs | 新規 | RuntimeHandle + 4 methods + 4 async tests |
| crates/siprs/src/runtime/mod.rs | 修正 | pub mod handle; |

## 実装手順

1. handle.rs 作成
2. mod.rs 修正
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on handle.rs
- 全テスト PASS (298 + 4 = 302)
