# 実装計画: Qwen3AsrBackend 結合テスト (M8-1 / #121)

## 変更ファイル一覧
- `crates/voiput/tests/qwen3_asr_test.rs`: NEW — 2 tests

## 実装手順
1. tests/qwen3_asr_test.rs 作成
2. qwen3_config_or_fail() + load_sample_wav() 実装
3. test_qwen3_asr_backend_new + test_qwen3_asr_transcribe_sample
4. cargo test --test qwen3_asr_test 実行
5. cargo test --lib 影響なし確認
