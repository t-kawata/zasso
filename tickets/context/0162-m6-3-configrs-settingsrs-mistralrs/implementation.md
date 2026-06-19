# 実装サマリ: M6-3 — config.rs + settings.rs 修正

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/ggufrs/src/config.rs` | MODIFY | DirectML削除, feature_name+cmake_flags追加, chat_template削除, テスト更新 |
| `crates/ggufrs/src/consts/settings.rs` | MODIFY | DEFAULT_CONTEXT_SIZE: 32768→2048, doc更新 |
| `crates/ggufrs/src/registry.rs` | MODIFY | chat_template フィールド削除（ModelConfig変更に伴い波及） |
| `crates/ggufrs/src/lib.rs` | MODIFY | chat_template: None 削除（テスト内）（ModelConfig変更に伴い波及） |

## 実装内容

### config.rs（主要変更）
- `GpuProvider::DirectML` バリアント削除（4バリアント構成に）
- `GpuProvider::from_str("directml")` → 削除（未知の値として None）
- `GpuProvider::detect()` Windows デフォルト: DirectML → Cpu
- `GpuProvider::mistralrs_feature()` → `feature_name()` + `cmake_flags()` に置き換え
- `ModelConfig::chat_template` フィールド削除（全コンストラクタからも除去）
- Metal/Cuda doc コメントの mistralrs 言及を llama-cpp-2 に更新
- テスト: 2削除（DirectML/mistralrs_feature）、6新規（feature_name×3 + cmake_flags×3）

### settings.rs
- `DEFAULT_CONTEXT_SIZE: u32 = 32768` → `2048`
- doc コメント更新（llama-cpp-2 推奨値に）

### registry.rs（波及修正）
- `ModelInfo::chat_template` フィールド削除
- `build_model_with_gguf` の chat_template パラメータ削除
- テスト修正

### lib.rs（波及修正）
- テスト内の `chat_template: None` 削除

## 検証結果
- `cargo check`: ✅ 警告0
- `cargo test --lib config::tests`: ✅ 85/85 passed
- `cargo test`（全188テスト）: ✅ 188/188 passed
- DirectML/chat_template/mistralrs_feature 残存: ✅ 0件
