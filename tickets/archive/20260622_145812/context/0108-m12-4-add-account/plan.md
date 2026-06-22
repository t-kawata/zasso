# 計画: チケット #108 — M12-4 add_account

## 要件

RFC §8.3 準拠。SipAccountHandle + 4 methods

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 追記 | SipAccountHandle + 4 methods + 4 tests |

## 実装手順

1. client.rs に SipAccountHandle + 4 methods + 4 tests
2. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on client.rs
- 全テスト PASS (314 + 4 = 318)
