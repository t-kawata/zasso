# 実装計画: Qwen3AsrBackend LocalAsrBackend impl + validate (M4-3 / #113)

## 変更ファイル一覧
- `crates/voiput/src/local/qwen3.rs`: EDIT — impl + validate + tests

## 実装手順
1. LocalAsrBackend impl (model_path, is_healthy) 追加
2. validate_qwen3_model_files() 追加
3. #[allow(dead_code)] 除去
4. 5 テスト追加
5. cargo check 0/0 + test 全通過
