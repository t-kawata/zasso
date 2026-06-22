# 実装計画: SttEngine::Local バリアントの追加 (M2-2 / #102)

## 変更ファイル一覧
- `crates/voiput/src/types.rs`: EDIT — SttEngine に Local バリアント追加

## 実装手順
1. types.rs の SttEngine に Local { backend: LocalAsrKind } を追加
2. cargo check で4箇所のmatch非網羅エラー発生を確認（許容）

## レビュー方法
- バリアント追加の確認
- 4箇所のmatch非網羅エラー確認
- #[default] が Os に残っていること確認
