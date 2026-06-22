# 計画: M2-1 (ticket #159) — KeyScheduler

## 要件
AtomicUsize ベースのスレッドセーフな key round-robin スケジューラ

## 変更ファイル
| ファイル | 種別 | 内容 |
|---------|------|------|
| src/routing/scheduler.rs | 新規 | KeyScheduler struct + impl + 8テスト |
| src/routing/mod.rs | 編集 | pub mod scheduler; |

## 実装手順
1. scheduler.rs 作成（new/with_seed/select_key/key_count/provider_name）
2. routing/mod.rs 編集
3. cargo test + cargo clippy 確認

## レビュー方法
- cargo check 警告ゼロ / cargo test 全通過 / clippy 通過
