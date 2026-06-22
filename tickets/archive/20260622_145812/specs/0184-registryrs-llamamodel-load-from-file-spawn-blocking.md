---
ticket_id: 184
title: registry.rs 修正 — LlamaModel + load_from_file + spawn_blocking
slug: registryrs-llamamodel-load-from-file-spawn-blocking
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0184-registryrs-llamamodel-load-from-file-spawn-blocking/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0184-registryrs-llamamodel-load-from-file-spawn-blocking/review.md
---

# registry.rs 修正 — LlamaModel + load_from_file + spawn_blocking

## Summary

`registry.rs` のモデルロードバックエンドを `mistralrs::Model`（GgufModelBuilder / UqffMultimodalModelBuilder）から `llama_cpp_2::LlamaModel::load_from_file()` + `spawn_blocking` に置き換える。これにより llama-cpp-2 バックエンドへの移行の中核となるモデル管理を完成させる。

## Background

ggufrs は現在 mistralrs の `GgufModelBuilder`（GGUF ファイル用）と `UqffMultimodalModelBuilder`（UQFF ファイル用）を拡張子に応じて使い分けている。llama-cpp-2 移行に伴い、以下の理由からこれらを全削除し `LlamaModel::load_from_file()` に統合する：

1. llama-cpp-2 の `LlamaModel::load_from_file()` は同期 API のため、`spawn_blocking` でラップして async インターフェースと統合する必要がある
2. UQFF 形式は mistralrs 独自の量子化形式であり、llama-cpp-2 ではサポート外
3. `DeviceMapSetting::dummy()` や `with_force_cpu()` は mistralrs の DeviceMap バグ対応の一時的回避策であり、llama-cpp-2 では不要

**注記**: Cargo.toml に `llama_cpp_2` 依存を追加するのは M6-11 である。そのため本チケットのコードはコンパイルできない状態となる。これは Tickets.md マイルストーン M6-2 で許容された「一時的にコンパイルが通らない」期間に該当する。

## Scope

1. `registry.rs` の import 変更: `mistralrs::{DeviceMapSetting, GgufModelBuilder, Model, UqffMultimodalModelBuilder}` を削除し、`llama_cpp_2::LlamaModel` + `llama_cpp_2::params::LlamaParams` 等に置き換え
2. `ModelInfo.model` の型変更: `Option<Arc<Model>>` → `Option<Arc<LlamaModel>>`
3. `ModelRegistry::get()` のロジック書き換え: GgufModelBuilder 分岐 → `load_model()` 呼び出し
4. 新規プライベートメソッド `load_model()`: `spawn_blocking` + `LlamaModel::load_from_file()` のラッパー
5. 削除対象:
   - `build_model_with_gguf()` 関数（全行）
   - `build_model_with_uqff()` 関数（全行）
   - `model_name_to_uqff_repo()` 関数（全行）
   - `DeviceMapSetting` / `UqffMultimodalModelBuilder` 関連の全コード
   - 拡張子によるビルダー分岐（gguf/uqff/unknown）
   - `anyhow` crate の use（使用箇所削除につき）
6. RwLock のロック戦略は変更しない（読み取り→書き込みの二段階ロックパターンを維持）

## Non-scope

- Cargo.toml の依存関係変更（M6-11 で実施）
- `error.rs` の `#[from]` ターゲット変更（M6-2 で実施）
- `config.rs` / `settings.rs` の mistralrs 特化フィールド除去（M6-3 で実施）
- `inference/mod.rs` のトレイトメソッド変更（M6-5 で実施）
- `inference/generate.rs` の推論ロジック書き換え（M6-6 で実施）

## Investigation

### 証拠1: 現在の registry.rs の状態（ファイル全行）

**ファイル**: `crates/ggufrs/src/registry.rs` (552 行)

**主要な証拠**:

1. **import (L13)**: `use mistralrs::{DeviceMapSetting, GgufModelBuilder, Model, UqffMultimodalModelBuilder};` — llama-cpp-2 に置き換えが必要

2. **ModelInfo.model フィールド (L64)**: `pub(crate) model: Option<Arc<Model>>` — `Model` は mistralrs の型。`Arc<LlamaModel>` に変更

3. **ModelInfo Debug 実装 (L76)**: `"Some(Arc<Model>)"` → `"Some(Arc<LlamaModel>)"` に変更

4. **`From<ModelConfig> for ModelInfo` (L81-93)**: フィールド構造は変更なし（`model_path`, `context_size`, `gpu_layers`, `batch_size` は保持）。ただし `model` フィールドの型が変わるためコンパイルが必要。

5. **`ModelRegistry::get()` (L156-210)**: 拡張子による分岐（L189-195）:
    ```rust
    match extension.as_deref() {
        Some("gguf") => build_model_with_gguf(&model_path_str, &model_path).await,
        Some("uqff") => build_model_with_uqff(name, &model_path).await,
        _ => Err(anyhow::anyhow!("unsupported model format: {:?}", extension)),
    }
    ```
    → `self.load_model(name).await` に置き換え。拡張子チェック不要。

6. **`build_model_with_gguf()` (L250-264)**: GgufModelBuilder で構築。全行削除。

7. **`build_model_with_uqff()` (L280-291)**: UqffMultimodalModelBuilder + DeviceMapSetting::dummy() + with_force_cpu()。全行削除。

8. **`model_name_to_uqff_repo()` (L297-303)**: Gemma4 モデル名→HuggingFace リポジトリ解決。全行削除。

### 証拠2: RFC §3.1 の設計（RFC.md L352-467）

設計上の変換ルール:
- `Model`（mistralrs）→ `LlamaModel`（llama-cpp-2）に型変更
- `GgufModelBuilder` / `UqffModelBuilder` → `LlamaModel::load_from_file()` に置き換え
- ロード処理を `spawn_blocking` でラップ（llama-cpp-2 の API が同期的なため）
- `DeviceMapSetting` 関連の処理を削除

RFC §3.1 のコード例（L405-431）:
```rust
async fn load_model(&self, name: &str) -> Result<Arc<LlamaModel>> {
    let (model_path, n_ctx, n_gpu_layers) = {
        let models = self.models.read().unwrap();
        let info = models.iter().find(|m| m.name == name).unwrap();
        (info.model_path.clone(), info.context_size, info.gpu_layers)
    };
    let n_ctx = n_ctx.unwrap_or(DEFAULT_CONTEXT_SIZE);
    let n_gpu_layers = n_gpu_layers.unwrap_or(0);
    let model = tokio::task::spawn_blocking(move || {
        let ctx_params = llama_cpp_2::context::params::LlamaContextParams::default()
            .with_n_ctx(n_ctx);
        let params = llama_cpp_2::LlamaParams::default()
            .with_n_gpu_layers(n_gpu_layers)
            .with_progress_callback(false);
        LlamaModel::load_from_file(model_path, &params)
            .map_err(|e| GgufError::ModelLoadFailed {
                name: name.to_string(),
                source: Box::new(e),
            })
    }).await.map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;
    Ok(Arc::new(model))
}
```

### 証拠3: Cargo.toml — llama_cpp_2 未追加（M6-11 待ち）

`crates/ggufrs/Cargo.toml` は現在 `mistralrs = { version = "0.8.1", default-features = false }` のみ。
`llama_cpp_2` は依存に存在しないため、本チケットのコード変更後はコンパイルできない。
Tickets.md L742 に明記: 「**この時点からコンパイルが一時的に通らなくなる。Cargo.toml の依存差し替えは M6-11 で行う。**」

### 証拠4: 犯罪・スタブの点検

- **Malfeasance.json**: 未解決の犯罪なし（0件）
- **スタブ一覧**: 11件検出（error.rs: 5件、inference/generate.rs: 4件、server/router.rs: 1件、settings.rs: 1件）
- 該当ファイル（registry.rs）内のスタブは0件
- 他ファイルのスタブは M6-6（generate.rs 全書き換え）や M6-11（error 依存差し替え）で解決予定のため、本チケットでは対応不要

### 証拠5: 依存チケットの状態

Tickets.md 上の依存関係:
- **先行実装必須 M6-2（LlamaCppError）**: error.rs の `#[from]` ターゲットを `llama_cpp_2::Error` に変更済みであること
- **先行実装必須 M6-3（ModelConfig 変更）**: config.rs の mistralrs 特化フィールドが除去済みであること
- **後続 M6-5（InferenceEngine からの呼び出し）**: registry.get() の戻り値型変更に追随

## Test Plan

### ユニットテスト計画

#### 維持するテスト（同期メソッド・ロジック不変）

| # | テスト名 | 変更内容 | 備考 |
|---|---------|---------|------|
| 1 | `model_info_from_model_config_copies_all_fields` | 変更なし | 型は変わるがフィールド構造は同一 |
| 2 | `model_info_model_field_is_none_after_from` | 変更なし | |
| 3 | `model_info_model_field_settable` | 変更なし | |
| 4 | `new_creates_empty_registry` | 変更なし | |
| 5 | `add_model_then_list_contains_name` | 変更なし | |
| 6 | `from_config_with_multiple_models` | 変更なし | |
| 7 | `add_model_duplicate_name_keeps_both` | 変更なし | |
| 8 | `list_models_preserves_insertion_order` | 変更なし | |
| 9 | `get_unregistered_model_returns_not_found` | 変更なし | |
| 10 | `load_immediate_skips_lazy_models` | 変更なし | lazy_load のロジックは不変 |

#### 削除するテスト（UQFF / ビルダー分岐）

| # | テスト名 | 削除理由 |
|---|---------|---------|
| 1 | `create_uqff_config` (ヘルパー) | UQFF サポート削除 |
| 2 | `create_unknown_config` (ヘルパー) | 拡張子分岐削除 |
| 3 | `uqff_model_path_returns_model_load_failed` | UQFF サポート削除 |
| 4 | `unknown_extension_returns_model_load_failed` | 拡張子分岐削除 |
| 5 | `gguf_model_path_uses_gguf_model_builder` | GgufModelBuilder 削除 |
| 6 | `model_name_to_uqff_repo_maps_gemma4_e2b` | 関数削除 |
| 7 | `model_name_to_uqff_repo_maps_gemma4_e4b` | 関数削除 |
| 8 | `model_name_to_uqff_repo_unknown_returns_name` | 関数削除 |

#### 更新するテスト

| # | テスト名 | 変更内容 |
|---|---------|---------|
| 1 | `get_unloaded_model_returns_stub_error` | mistralrs の `ModelLoadFailed` を期待するテストから、`load_model()` のエラーパス（ファイル不在→`ModelLoadFailed`）を期待するテストに変更 |

#### 新規追加テスト

| # | テスト名 | 内容 | 備考 |
|---|---------|------|------|
| 1 | `get_triggers_load_model_for_unloaded_model` | `lazy_load=true` の未ロードモデルに対して `get()` 呼び出しが `load_model()` を経由することを確認（ファイル不在→`ModelLoadFailed`） | 正常系の完全テストは M6-11（実ファイルあり）以降 |
| 2 | `load_model_returns_model_load_failed_on_missing_file` | 存在しないパスで `load_model()` が `ModelLoadFailed` を返すことを確認 | spawn_blocking 内の `LlamaModel::load_from_file` のエラーハンドリング検証 |

### ユニットテスト不可能な項目（例外）

1. **`load_model()` の正常系（ファイル読み込み成功パス）**: 実 GGUF ファイルが存在しないためテスト不可能。M6-13（test-run + 実動作確認）で検証
2. **`spawn_blocking` 内の `LlamaModel::load_from_file()` の正確なパラメータ伝播**: llama-cpp-2 の内部実装依存のため、コンパイルが通ることのみの確認に留める
3. **コンパイル検証自体**: Cargo.toml に `llama_cpp_2` が追加されていないため、本チケットのコードはコンパイル不可能。コンパイル検証は M6-11 以降で実施

## Boy Scout Rule — 翻訳可能性計画

### 改善対象（registry.rs 内）

1. **`build_model_with_gguf` 関数 (L250-264)**: モデル構築とエラーハンドリングが混在。新 `load_model()` では責務を「ファイルからモデルをロードして Arc でラップする」に限定する。関数名 `load_model` は動詞句として明確。

2. **`build_model_with_uqff` 関数 (L280-291)**: 削除により翻訳可能性は自動改善。

3. **`model_name_to_uqff_repo` 関数 (L297-303)**: 削除により翻訳可能性は自動改善。

4. **`get()` メソッドの拡張子分岐 (L189-195)**: `match extension.as_deref()` による三方向分岐を削除し、単一の `load_model(name)` 呼び出しに置き換える。これにより「モデル名からロードする」という単一責務が明確になる。

### 全般

- 今回の変更により `registry.rs` の公開インターフェースは `get()` / `load_immediate()` / `load_all()` / `list_models()` / `add_model()` / `from_config()` / `new()` の7メソッドに整理される
- 内部ヘルパーは `load_model()` の1つだけに統合され、翻訳可能性が向上する
- 削除対象の UQFF 関連コードには `DeviceMapSetting::dummy()` など macOS のメモリ検出バグ対応の詳細なコメントが付いていたが、これらは全て llama-cpp-2 では不要となる

## Acceptance Criteria

- [ ] `ModelInfo.model` の型が `Option<Arc<LlamaModel>>` に変更されている
- [ ] `ModelRegistry::get()` が `LlamaModel::load_from_file()` + `spawn_blocking` を使用している
- [ ] プライベートメソッド `load_model()` が新規追加されている
- [ ] `build_model_with_gguf()` / `build_model_with_uqff()` / `model_name_to_uqff_repo()` が削除されている
- [ ] `DeviceMapSetting` / `UqffMultimodalModelBuilder` 関連コードが全削除されている
- [ ] RwLock のロック戦略が変更されていない（読み取り→書き込みの二段階パターンを維持）
- [ ] 拡張子によるビルダー分岐が削除されている
- [ ] 同期メソッド関連の既存テストが維持されている
- [ ] UQFF / ビルダー分岐 関連のテストが削除または更新されている
- [ ] `anyhow` crate の use が削除されている（使用箇所がなくなったため）
- [ ] 削除・更新されたテスト群を含め、コード変更が設計書（RFC §3.1）と整合している
- [ ] 犯罪（Malfeasance.json）の新規発生がないこと

## Notes

- 本チケット実装後、コンパイルは M6-11（Cargo.toml 依存差し替え）まで通らない
- コードレビューでは主に設計の正しさと RFC との整合性を確認する（コンパイル検証は不可）
- 依存 M6-2（error.rs 修正）および M6-3（config.rs 修正）の完了を確認してから実装を開始すること

### 実装安全指針

`llama_cpp_2` の正確な API シグネチャは以下の公式ドキュメントで実装開始前に確認すること：

- `LlamaModel::load_from_file()`: https://docs.rs/llama-cpp-2/latest/llama_cpp_2/struct.LlamaModel.html#method.load_from_file
- `LlamaParams`: https://docs.rs/llama-cpp-2/latest/llama_cpp_2/struct.LlamaParams.html
- `LlamaContextParams`: https://docs.rs/llama-cpp-2/latest/llama_cpp_2/context/params/struct.LlamaContextParams.html

### 成果物

- 計画: context/0184-registryrs-llamamodel-load-from-file-spawn-blocking/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0184-registryrs-llamamodel-load-from-file-spawn-blocking/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0184-registryrs-llamamodel-load-from-file-spawn-blocking/review.md（未作成、/review-ticket 全チェック通過後に作成）
