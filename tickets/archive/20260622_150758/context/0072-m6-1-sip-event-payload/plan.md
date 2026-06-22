# 計画: チケット #72 — M6-1 SipEventPayload enum + Info 構造体

## 要件

RFC §15.1 準拠の 36 バリアント SipEventPayload enum + 20 Info 構造体スケルトン

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/event.rs | 新規 | SipEventPayload (36 vars) + 20 Info structs + 6 tests |
| crates/siprs/src/lib.rs | 修正 | pub mod event; + pub use |

## 実装手順

1. event.rs 作成
2. lib.rs 修正
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on event.rs
- 翻訳可能性 grep
- 全テスト PASS 確認 (203 + 6 = 209)
