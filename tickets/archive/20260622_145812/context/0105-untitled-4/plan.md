# 実装計画: パス解決の純粋関数群 (M2-5 / #105)

## 変更ファイル一覧
- `crates/voiput/src/recognizer.rs`: EDIT — 2 関数 + 5 テスト追加

## 実装手順
1. recognizer.rs の resolve_vad_model_path 直後に関数追加
2. use インポート確認
3. 5 テスト追加
4. cargo test 確認

## レビュー方法
- cargo check 成功
- cargo test --lib 全 5 テスト通過
- 翻訳可能性チェック
