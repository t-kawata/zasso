# 実装計画: local モジュール宣言 + lib.rs 公開 (M4-1 / #111)

## 変更ファイル一覧
- `crates/voiput/src/local/mod.rs`: NEW
- `crates/voiput/src/local/qwen3.rs`: NEW
- `crates/voiput/src/local/recognizer.rs`: NEW
- `crates/voiput/src/lib.rs`: EDIT

## 実装手順
1. mkdir -p crates/voiput/src/local
2. mod.rs, qwen3.rs, recognizer.rs 作成
3. lib.rs に pub mod local; 追加
4. cargo check 確認
