# 実装計画: Qwen3AsrModelPaths + Qwen3AsrConfig 構造体の定義 (M2-3 / #103)

## 変更ファイル一覧
- `crates/voiput/src/types.rs`: EDIT — 2 構造体追加
- `crates/voiput/src/config.rs`: EDIT — VoiputConfig + Builder フィールド追加

## 実装手順
1. types.rs に Qwen3AsrModelPaths + Qwen3AsrConfig 追加
2. config.rs の VoiputConfig に qwen3_asr_config フィールド追加
3. VoiputConfigBuilder にフィールド + メソッド追加
4. build() の構造体リテラルにフィールド追加
5. cargo check 確認

## レビュー方法
- cargo check 成功
- derive 属性確認
- Builder パターン一貫性確認
