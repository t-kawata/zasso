# 実装計画: LocalRecognizer Facade (M5-1 / #114)

## 変更ファイル一覧
- `crates/voiput/src/local/recognizer.rs`: EDIT — LocalRecognizer 実装
- `crates/voiput/src/recognizer.rs`: EDIT — #[allow(dead_code)] 除去 + pub(crate) 追加
- `crates/voiput/src/local/qwen3.rs`: EDIT — #[allow(dead_code)] 除去

## 実装手順
1. recognizer.rs: resolve_qwen3_* に pub(crate) + #[allow(dead_code)] 除去
2. local/qwen3.rs: validate_qwen3_model_files の #[allow(dead_code)] 除去
3. local/recognizer.rs: LocalRecognizer 実装
4. cargo check 0/0 + cargo test 全通過
