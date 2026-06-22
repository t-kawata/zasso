---
ticket_id: 193
title: テストコード修正 — MockEngine + 結合テスト
slug: mockengine
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0193-mockengine/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0193-mockengine/review.md
---

# テストコード修正 — MockEngine + 結合テスト

## Summary

llama-cpp-2 バックエンド移行に伴うテストコード（単体テスト・結合テスト）の修正を完了する。
先行チケット（M6-1〜M6-11）により mock! 定義・error.rs テスト・ルーターテストの大部分は既に更新済みである。
本チケットでは残課題である **registry.rs の llama-cpp-2 panic 問題** の調査と、`cargo test` 全通過の確認を行う。

## Background

llama-cpp-2 バックエンド移行（フェーズF）の過程で、以下のテスト関連作業が M6-1〜M6-11 で部分的に実施された：

- M6-2（error.rs）: `MistralrsError` → `LlamaCppError` への置き換え完了。対応テスト `gguf_error_display_llama_cpp_error` 追加済み。
- M6-5（inference/mod.rs）: `InferenceEngine` トレイトを4メソッドから3メソッドに削減（`send_raw` 削除）。`MockEngine` の mock! 定義は既に3メソッド・`&str` 引数に更新済み。
- M6-6（inference/generate.rs）: `no_send_raw_in_generate_module` テスト追加済み。
- M6-9（server/openai.rs + router.rs）: Anthropic エンドポイント削除、ルーターテストは MockEngine 使用で動作済み。

しかし **registry.rs に llama-cpp-2 が存在しないモデルファイルで panic する問題** が `#[ignore]` のテストとして残っており、本チケットで対応する。

## Scope

1. **registry.rs の llama-cpp-2 panic 問題の調査と修正**
   - `get_triggers_load_model_for_unloaded_model` テスト（現在 `#[ignore]`）の原因調査
   - llama-cpp-2 が存在しないファイルパスで panic する問題の修正またはエラーハンドリング改善
   - `[::STUB::]` マーカーの解決

2. **`cargo test` 全テスト通過確認**
   - `cargo test`（実モデル不要のテストのみ）で全テスト通過を確認
   - 失敗があれば修正

3. **残存 mistralrs 参照の確認と掃除**
   - `test_error_from_mistralrs` の残骸確認（grep で既に 0 件だが最終確認）
   - `TextMessages` 型参照の残骸確認
   - `send_raw` 関連テストの残骸確認

## Non-scope

- test-run バイナリの修正（M6-13）
- cargo feature flags 最終調整・clippy（M6-14）
- サーバー結合テスト（`tests/server_integration_test.rs` — 既に正しく動作）
- 公開API確認テスト（`tests/ggufrs_api_check.rs` — 既に正しく動作）

## Investigation

### 証拠1: mock! 定義の現状 — 既に3メソッド・&str に更新済み

`src/inference/mod.rs:220-228`:
```rust
mock! {
    pub Engine {}
    #[async_trait]
    impl InferenceEngine for Engine {
        async fn generate(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<String, GgufError>;
        async fn generate_structured(&self, model_name: &str, prompt: &str, params: GenerateParams, schema: Value) -> Result<Value, GgufError>;
        async fn generate_stream(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError>;
    }
}
```

**確認結果**: ✅ `send_raw` 削除済み、引数型は `&str`（TextMessages ではない）、3メソッド。
**追加対応不要。**

### 証拠2: error.rs テスト — 既に llama-cpp-2 対応済み

`src/error.rs:190-203`:
```rust
#[test]
fn gguf_error_display_llama_cpp_error() {
    let llama_err = llama_cpp_2::LlamaCppError::BackendAlreadyInitialized;
    let err = GgufError::LlamaCppError(llama_err);
    // ... display assertions
}
```

`test_error_from_mistralrs` の grep 結果: 0 件（既に全削除済み）。
`MistralrsError` の grep 結果: 0 件。

**確認結果**: ✅ 置き換え完了。`test_error_from_llamacpp` 相当のテストは `gguf_error_display_llama_cpp_error` として実装済み。
**追加対応不要。**

### 証拠3: send_raw 関連テスト — 既に全削除済み

`send_raw` の grep 結果:
- `src/inference/generate.rs:455-462`: `no_send_raw_in_generate_module` テスト（send_raw が存在しないことの確認テスト）

**確認結果**: ✅ send_raw はトレイト・実装・テストから完全に削除済み。
**追加対応不要。**

### 証拠4: registry.rs の llama-cpp-2 panic 問題（未解決）

`src/registry.rs:450-464`:
```rust
// [::STUB::] M6-12: llama-cpp-2 が存在しないモデルファイルで panic する問題。
// 本抑制前から存在していた事前問題。M6-12 で llama-cpp-2 のエラー処理を調査・修正する。
#[ignore]
#[tokio::test]
async fn get_triggers_load_model_for_unloaded_model() {
    // ... LlamaModel::load_from_file() が存在しないファイルで panic
}
```

**確認結果**: ❌ 未解決。`llama_cpp_2::LlamaModel::load_from_file()` が存在しないファイルパスに対して `Err` ではなく `panic!` を発生させる。調査・対応が必要。

### 証拠5: tests/ ディレクトリの結合テスト

- `tests/server_integration_test.rs` — GgufEngine を使用したサーバー起動・ルーティングテスト。モデル名 "nonexistent-model"、空設定。 ✅ 既に正しく動作。
- `tests/ggufrs_api_check.rs` — server::types の公開型確認。 ✅ 既に正しく動作。

### 証拠6: スタブ状況

```
crates/ggufrs/src/bin/test-run.rs:    → 3件（M6-13 対象、本チケット非スコープ）
crates/ggufrs/src/consts/settings.rs: → 1件（dead_code 抑制、全チケット共通）
crates/ggufrs/src/registry.rs:        → 1件（M6-12 対象 → 本チケットで解決）
```

## Test Plan

### ユニットテスト計画

| 対象 | テスト内容 | 種別 |
|------|-----------|------|
| `registry.rs` `load_model()` | llama-cpp-2 が存在しないモデルファイルで `Err` を返すこと | 正常系 |
| `registry.rs` `load_model()` | llama-cpp-2 が有効なモデルファイルで `Ok` を返すこと | 異常系 |
| 全既存テスト | `cargo test` 全通過の確認 | 回帰 |

### テスト手順

```bash
# テスト実行（実モデル不要のテストのみ）
cargo test --lib
cargo test --test server_integration_test
cargo test --test ggufrs_api_check
```

### ユニットテスト不可能な項目（例外）

- llama-cpp-2 の内部 panic 挙動は当該クレートの実装に依存するため、`load_from_file` の失敗パスをユニットテストで完全に検証することはできない。`std::panic::catch_unwind` を用いたラッパーで panic を Err に変換する方針を計画に含める。

## Boy Scout Rule — 翻訳可能性計画

本チケットで触るコードは以下の範囲：

1. **`registry.rs` `load_model` / `get` メソッド**: llama-cpp-2 の panic を `catch_unwind` でラップする場合、ラッパー関数に `try_load_model_with_safety` 等の「何をするか」を関数名で明確に表現する動詞句を採用する。panic ハンドリングの意図を日本語コメントで「なぜこのラッパーが必要か」説明する。

## Acceptance Criteria

- [ ] `cargo test` が全テスト通過（実モデル不要のテストのみ）
- [ ] registry.rs の llama-cpp-2 panic 問題が調査・修正されている
- [ ] `[::STUB::]` マーカー（registry.rs L450）が解決済み
- [ ] `test_error_from_mistralrs` / `send_raw` の残骸が全く存在しない（grep で確認）
- [ ] 翻訳可能性の検証が通っている
- [ ] 犯罪なし（Malfeasance.json 未解決レコード 0）

## Notes

- plan_path: 未作成（`/plan-ticket` 承認後に更新）
- implementation_path: 未作成（`/start-ticket` 実装完了後に更新）
- review_report_path: 未作成（`/review-ticket` 全チェック通過後に更新）

### 成果物

- 計画: context/0193-mockengine/plan.md（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: context/0193-mockengine/implementation.md（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: context/0193-mockengine/review.md（未作成、`/review-ticket` 全チェック通過後に作成")
