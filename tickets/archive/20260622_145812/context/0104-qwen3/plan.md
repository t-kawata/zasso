# 実装計画: Qwen3 モデルファイル名定数の追加 (M2-4 / #104)

## 変更ファイル一覧
- `crates/voiput/src/constants.rs`: EDIT — 5 定数追加

## 実装手順
1. constants.rs の VAD 定数群の直後に 5 定数を追加
2. cargo check で確認

## レビュー方法
- 5 定数すべて pub(crate) 確認
- 定数値が RFC と一致
- cargo check 成功
