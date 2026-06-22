# 計画: チケット #71 — M5-3 PairAligner

## 要件

RFC §25/§25.1 準拠の PairAligner を src/audio/bridge.rs に追記:
TimedFrame<T> + PairAligner (6 メソッド) + 10 tests

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/bridge.rs | 追記 | PairAligner 構造体 + 10 tests |

## 実装手順

1. bridge.rs に PairAligner + TimedFrame 追記
2. テスト 10 件追加
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on bridge.rs
- 翻訳可能性 grep
- 全テスト PASS 確認 (193 + 10 = 203)
