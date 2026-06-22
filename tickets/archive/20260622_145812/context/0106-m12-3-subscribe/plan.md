# 計画: チケット #106 — M12-3 subscribe

## 要件

RFC §8.3 準拠。3 subscribe methods on SipClient

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 追記 | subscribe/subscribe_raw_sip/subscribe_account + 3 tests |

## 実装手順

1. client.rs に 3 methods 追加
2. 3 tests 追加
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on client.rs
- 全テスト PASS (311 + 3 = 314)
