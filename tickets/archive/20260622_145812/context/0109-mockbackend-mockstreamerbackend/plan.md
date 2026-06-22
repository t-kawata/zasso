# 実装計画: テストコードのトレイト変更対応 (M3-4 / #109)

## 確認のみ — コード変更なし。M3-2 レビュー時に既に完了。

## 確認項目
1. MockBackend (streamer.rs) が backend_name() を実装
2. MockStreamerBackend (test-run.rs) が backend_name() を実装
3. cargo check 0 errors/0 warnings
4. cargo test --lib 全通過
