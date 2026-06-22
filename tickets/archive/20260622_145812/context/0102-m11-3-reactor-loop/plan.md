# 計画: チケット #102 — M11-3 Reactor loop

## 要件

RFC §7.1 準拠。CoreReactor (spawn + run_loop) + 4 async tests

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/runtime/reactor.rs | 新規 | CoreReactor + spawn + run_loop + 4 tests |
| crates/siprs/src/runtime/mod.rs | 修正 | pub mod reactor; |

## 実装手順

1. reactor.rs 作成 (CoreReactor + spawn + run_loop)
2. mod.rs 修正
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on reactor.rs
- 全テスト PASS (302 + 4 = 306)
