# 計画: チケット #95 — M9-1 RegistrationState 遷移ロジック

## 要件

RFC §17.1 準拠。RegistrationEvent (6 events) + 5 methods + 48通り遷移表

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/account.rs | 追記 | RegistrationEvent + 5 methods + 12 tests |

## 実装手順

1. account.rs に RegistrationEvent 追加
2. RegistrationState に 5 methods 追加
3. 12 tests 追加
4. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on account.rs
- 全テスト PASS (258 + 12 = 270)
