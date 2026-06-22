# 実装計画: LocalAsrBackend トレイトの定義 (M1-2 / #99)

## 変更ファイル一覧
- `crates/trate/src/local.rs`: EDIT — スタブ→LocalAsrBackend trait 定義

## 実装手順
1. local.rs に LocalAsrBackend: AsrBackend trait を定義（model_path, is_healthy）
2. [::STUB::] マーカーを除去
3. cargo check 確認
4. cargo tree 確認

## レビュー方法
- cargo check 成功
- cargo tree (anyhow only)
- run-quality-checks.js
- 翻訳可能性チェック
