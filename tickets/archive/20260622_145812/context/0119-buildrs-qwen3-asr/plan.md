# 実装計画: build.rs Qwen3-ASR モデルダウンロード (M7-1 / #119)

## 変更ファイル一覧
- `crates/voiput/build.rs`: EDIT — 定数 + サブディレクトリ + ループ統合

## 実装手順
1. QWEN3_MODEL_FILES 定数追加
2. create_dir_all("models/qwen3-asr") 追加
3. ダウンロード/検証ループを chain で拡張
4. cargo build 確認
