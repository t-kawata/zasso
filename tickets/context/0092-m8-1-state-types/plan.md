# 計画: チケット #92 — M8-1 状態型定義

## 要件

RFC §17/§33 準拠: RegistrationState (7 vars) + ClientState + AccountEntry + CallEntry

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/account.rs | 新規 | RegistrationState enum + Display |
| crates/siprs/src/runtime/mod.rs | 新規 | pub mod state; |
| crates/siprs/src/runtime/state.rs | 新規 | ClientState + AccountEntry + CallEntry + 8 methods + 9 tests |
| crates/siprs/src/lib.rs | 修正 | pub mod account; + pub mod runtime; |

## 実装手順

1. account.rs 作成
2. runtime/mod.rs + runtime/state.rs 作成
3. lib.rs 修正
4. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on new files
- 全テスト PASS 確認 (238 + 9 = 247)
