# 計画: チケット #91 — M7-2 AccountEventReceiver

## 要件

RFC §15.5 準拠のアカウントフィルタリングラッパー

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/event.rs | 追記 | AccountEventReceiver + 4 methods + 6 tests |

## 実装手順

1. event.rs に AccountEventReceiver 追記
2. 6 tests 追加
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on event.rs
- 全テスト PASS 確認 (232 + 6 = 238)
