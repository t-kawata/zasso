# 計画: チケット #94 — M8-3 ClientCapabilities / SrtpImplementation / AudioDeviceCaps

## 要件

RFC §34.3 準拠。ClientCapabilities 空スケルトン → 20 フィールド本実装。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/event.rs | 修正 | ClientCapabilities (20 fields) + SrtpImplementation + AudioDeviceCaps + 5 tests |

## 実装手順

1. event.rs の ClientCapabilities を拡張
2. 5 tests 追加
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on event.rs
- 全テスト PASS (253 + 5 = 258)
