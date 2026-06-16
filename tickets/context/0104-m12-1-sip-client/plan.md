# 計画: チケット #104 — M12-1 SipClient

## 要件

RFC §8.2 準拠。SipClient (Arc<ClientInner>) + Clone + Send + Sync + Debug

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 新規 | SipClient + ClientInner + 3 tests |
| crates/siprs/src/lib.rs | 修正 | pub mod client; + pub use |

## 実装手順

1. client.rs 作成
2. lib.rs 修正
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on client.rs
- 全テスト PASS (305 + 3 = 308)
