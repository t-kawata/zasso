# 実装計画: OpenAIBackend の trate::AsrBackend 実装スタブ除去 (M3-3 / #108)

## 変更ファイル一覧
- `crates/voiput/src/backends/openai.rs`: EDIT — スタブブロック削除

## 実装手順
1. openai.rs から [::STUB::] M3-3 ブロック削除
2. cargo check 確認
3. cargo test --lib 確認

## レビュー方法
- cargo check 0 errors, 0 warnings
- cargo test --lib 全通過
