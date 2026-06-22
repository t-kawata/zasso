# 実装計画: AsrBackend トレイトの定義 (M1-1 / #98)

## 変更ファイル一覧
- `crates/trate/src/lib.rs`: EDIT — AsrBackend trait 定義追加 + mod local; 宣言

## 実装手順
1. lib.rs に AsrBackend trait (Send 継承、5メソッド) を定義
2. mod local; 宣言を追加
3. cargo check 確認
4. cargo tree 確認

## レビュー方法
- cargo check 成功
- cargo tree (anyhow only)
- run-quality-checks.js
- 翻訳可能性チェック
