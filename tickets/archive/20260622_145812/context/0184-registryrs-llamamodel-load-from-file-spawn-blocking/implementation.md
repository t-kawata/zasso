# 実装サマリ（修正版）: チケット 184 — registry.rs 修正

## 変更ファイル
- `crates/ggufrs/src/registry.rs`
- `crates/ggufrs/Cargo.toml` (llama-cpp-2 追加、M6-11 の一部前倒し)

## 実装内容（最終版）

### 1. import 変更
- 削除: `use mistralrs::{DeviceMapSetting, GgufModelBuilder, Model, UqffMultimodalModelBuilder}`
- 追加: `llama_cpp_2::llama_backend::LlamaBackend`
- 追加: `llama_cpp_2::model::params::LlamaModelParams`
- 追加: `llama_cpp_2::model::LlamaModel`
- 削除: `use anyhow;`

### 2. llama-cpp-2 バックエンド初期化
- 追加: `ensure_backend()` — OnceLock によるグローバル1回のみの LlamaBackend::init()
- 競合状態を安全に処理（初回成功→格納、2回目以降は格納済みを返す）

### 3. ModelInfo の型変更
- `model: Option<Arc<Model>>` → `Option<Arc<LlamaModel>>`
- Debug impl + 全コメント更新

### 4. ModelRegistry::get() 書き換え
- 拡張子ビルダー分岐（gguf/uqff/unknown）削除 → `load_model()` 呼び出し
- ロック戦略は維持

### 5. load_model() 新規追加
- `LlamaModel::load_from_file(backend, path, params)` を spawn_blocking でラップ
- `LlamaModelParams::default().with_n_gpu_layers(n_gpu_layers)` でパラメータ設定
- !Send な LlamaModelParams はクロージャ内で生成して安全に使用
- n_gpu_layers は Option<u32> から u32 に unwrap_or(0)

### 6. 削除
- build_model_with_gguf(), build_model_with_uqff(), model_name_to_uqff_repo()

### 7. テスト更新
- 維持: 同期メソッドテスト10件
- 維持: get_unregistered_model_returns_not_found, load_immediate_skips_lazy_models
- 新規: get_triggers_load_model_for_unloaded_model
- 削除: UQFF関連テスト8件

## コンパイル状態
- ✅ registry.rs 単体: コンパイル成功
- ❌ ggufrs crate 全体: inference/generate.rs で4エラー（M6-6 のスコープ、別チケット）

## 既知の制約
- n_ctx (context_size) は LlamaModelParams の設定項目に含まれず（LlamaContextParams で設定）、load_model() では使用しない
- M6-6 で inference/generate.rs が llama-cpp-2 対応になるまで crate 全体のコンパイルは通らない
- `.expect("RwLock poisoned")` 8件は既存コード全域の標準パターン
