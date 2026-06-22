# 計画: チケット #105 — M12-2 SipClient::new()

## 要件

RFC §8.3 準拠。SipClient::new() — validation → reactor → initialize

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 追記 | SipClient::new() + 3 tests |

## 実装手順

1. client.rs に SipClient::new() 実装
2. 3 tests 追加
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on client.rs
- 全テスト PASS (308 + 3 = 311)
