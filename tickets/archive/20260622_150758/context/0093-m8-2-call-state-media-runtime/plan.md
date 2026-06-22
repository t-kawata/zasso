# 計画: チケット #93 — M8-2 CallState / MediaRuntime

## 要件

RFC §18 準拠: CallState (13 vars) + MediaRuntime + スケルトン型差し替え

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/call.rs | 新規 | CallState (13 vars) + 2 methods + 6 tests |
| crates/siprs/src/runtime/state.rs | 修正 | スケルトンを CallState/MediaRuntime に差し替え |
| crates/siprs/src/lib.rs | 修正 | pub mod call; |

## 実装手順

1. call.rs 作成
2. state.rs 修正
3. lib.rs 修正
4. cargo check + cargo test

## レビュー方法

- run-quality-checks.js
- 全テスト PASS 確認 (247 + 6 = 253)
