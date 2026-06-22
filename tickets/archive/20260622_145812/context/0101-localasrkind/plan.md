# 実装計画: LocalAsrKind 列挙型の定義 (M2-1 / #101)

## 変更ファイル一覧
- `crates/voiput/src/types.rs`: EDIT — LocalAsrKind enum 追加

## 実装手順
1. types.rs に LocalAsrKind enum (Qwen3Asr バリアント) を追加
2. cargo check で確認

## レビュー方法
- cargo check 成功
- derive 属性確認
- voiput::LocalAsrKind としてアクセス可能か
