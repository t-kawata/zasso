# 実装計画: Qwen3AsrBackend の new() と transcribe() 実装 (M4-2 / #112)

## 変更ファイル一覧
- `crates/voiput/src/local/qwen3.rs`: EDIT — スタブ→Qwen3AsrBackend 実装
- `crates/voiput/src/recognizer.rs`: EDIT — #[allow(dead_code)] 除去 (2件)

## 実装手順
1. qwen3.rs に Qwen3AsrBackend struct + AsrBackend impl + テスト実装
2. recognizer.rs から resolve_qwen3_* 関数の #[allow(dead_code)] 除去
3. cargo check 0 errors/0 warnings
4. cargo test --lib 全通過
