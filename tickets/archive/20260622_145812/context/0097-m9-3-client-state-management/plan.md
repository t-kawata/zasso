# 計画: チケット #97 — M9-3 ClientState 管理

## 要件

RFC §18.2/§33 準拠。max_calls 上限、shutdown、native_id 逆引き

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/runtime/state.rs | 修正 | 構造体拡張 + 5 methods + 6 tests |

## 実装手順

1. state.rs の構造体を拡張
2. 5 methods 追加
3. テスト修正 + 6 追加
4. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on state.rs
- 全テスト PASS (282 + 6 = 288)
