# 実装計画: streamer.rs AsrBackend 移行 + lib.rs 再公開更新 (M3-2 / #107)

## 変更ファイル一覧
- `crates/voiput/src/pipeline/streamer.rs`: EDIT — trait削除 + use追加
- `crates/voiput/src/lib.rs`: EDIT — pub use 更新

## 実装手順
1. streamer.rs から AsrBackend trait 定義削除 + use trate::AsrBackend 追加
2. lib.rs の pub use を trate からに変更
3. cargo check 確認

## レビュー方法
- streamer.rs 関連のコンパイル成功確認
- voiput::AsrBackend が利用可能なこと確認
- OpenAIBackend のエラーは許容（M3-3）
