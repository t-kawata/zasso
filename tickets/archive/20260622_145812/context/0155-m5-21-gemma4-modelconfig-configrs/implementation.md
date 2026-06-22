# M5-2.1: Gemma4 ModelConfig 追加 — 実装サマリ

## 変更したファイル

### crates/ggufrs/src/config.rs (本実装)
- `ModelConfig::gemma4_e2b()` 追加 — Gemma4 E2B (2B, ≈3.1GB, UQFF)
  - `context_size: Some(2048)` (高速化の設計判断)
  - `model_path: "models/gemma4-e2b-uqff/q4k-0.uqff"`
- `ModelConfig::gemma4_e4b()` 追加 — Gemma4 E4B (4B, ≈5.0GB, UQFF)
  - `context_size: Some(2048)` (同上)
  - `model_path: "models/gemma4-e4b-uqff/q4k-0.uqff"`
- 10 ケースのユニットテスト追加（各モデル5ケース）
- Qwen3.5 系コンストラクタは維持

### ボーイスカウト改善（clippy 警告解決）
- crates/ggufrs/build.rs: `&PathBuf` → `&Path` (ptr_arg)
- crates/ggufrs/src/config.rs: 不要な `return` 削除 (needless_return)
- crates/ggufrs/src/config.rs: `#[allow(clippy::should_implement_trait)]` 追加
- crates/ggufrs/src/error.rs: doc comment インデント修正 (doc_lazy_continuation)
- crates/ggufrs/src/registry.rs: `impl Default for ModelRegistry` 追加 (new_without_default)
- crates/ggufrs/src/registry.rs: `std::io::Error::other()` に変更 (io_other_error)
- crates/ggufrs/src/server/openai.rs: `std::io::Error::other()` に変更 (io_other_error, 2箇所)

## 検証結果
- `cargo test`: 168 tests passed (新規10含む), 0 failed
- `cargo clippy -- -D warnings`: clean
- `cargo fmt`: clean
- 既存テスト変更なし
