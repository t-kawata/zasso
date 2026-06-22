# 計画: M2-2 (ticket #160) — ConcurrencyLimiter

## 要件
tokio::sync::Semaphore ラッパー。Async acquire + queue + LimiterError。

## 変更ファイル
| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 編集 | tokio + dev-dependencies |
| src/provider/limiter.rs | 新規 | ConcurrencyLimiter + LimiterError + 6テスト |
| src/lib.rs | 編集 | pub mod provider; |

## 実装手順
1. Cargo.toml 編集
2. provider/limiter.rs 作成
3. lib.rs 編集
4. cargo test + cargo clippy 確認
