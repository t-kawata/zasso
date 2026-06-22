# 計画: チケット #109 — M12-5 SipClient::shutdown()

## 要件

RFC §32 準拠。shutdown() (idempotent) + is_shutdown()

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 追記 | shutdown() + is_shutdown() + 2 tests |

## 実装手順

1. client.rs に 2 methods 追加
2. 2 tests 追加
3. cargo check + cargo test (0 warnings)

## レビュー方法

- run-quality-checks.js on client.rs
- 全テスト PASS (318 + 2 = 320)
