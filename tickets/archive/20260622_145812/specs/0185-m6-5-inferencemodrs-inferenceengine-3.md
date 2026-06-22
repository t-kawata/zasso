---
ticket_id: 185
title: M6-5: inference/mod.rs 修正 — InferenceEngine トレイト3メソッド化
slug: m6-5-inferencemodrs-inferenceengine-3
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0185-m6-5-inferencemodrs-inferenceengine-3/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0185-m6-5-inferencemodrs-inferenceengine-3/review.md
---
# M6-5: inference/mod.rs 修正 — InferenceEngine トレイト3メソッド化

## Summary

`inference/mod.rs` の `InferenceEngine` トレイトから `send_raw()` メソッドを削除し4→3メソッド化する。同時に `GenerateParams` から `enable_thinking` フィールドを削除する。これにより mistralrs 依存型（`RequestBuilder` / `Response`）がトレイト定義から完全に除去され、llama-cpp-2 バックエンドへの移行準備が完了する。

## Background

ggufrs はフェーズ F（llama-cpp-2 バックエンド移行）を進めており、M6-4（registry.rs）まででモデルロード層の mistralrs 依存は除去された。本チケット M6-5 は推論インターフェース層から mistralrs の残存依存を取り除く：

1. **`send_raw()`**: mistralrs の `RequestBuilder` に依存した低レベルパススルーメソッド。llama-cpp-2 には相当概念が存在しないため削除する。
2. **`enable_thinking`**: mistralrs の拡張思考（chain-of-thought）機能に対応するフィールド。llama-cpp-2 には相当機能が存在しないため削除する。
3. **`pub mod raw`**: 元のコードでは未作成だが、将来の誤った追加を防ぐため `// pub mod raw` コメントとして明示的に無効化する方針。

本チケットは「mistralrs 依存を完全に断つ」移行の中間マイルストーンであり、後続の M6-6（generate.rs 書き換え）・M6-7（stream.rs 書き換え）・M6-9（server/openai.rs 修正）は本チケットの型定義に依存する。

## Scope

1. `inference/mod.rs` の `use mistralrs::{RequestBuilder, Response}` 行を削除
2. `InferenceEngine` トレイトから `send_raw()` メソッド定義を削除（4→3メソッド）
3. `GenerateParams` から `enable_thinking: Option<bool>` フィールドを削除
4. `GenerateParams::default()` から `enable_thinking` 初期化を削除
5. `// pub mod raw` コメントを追加して将来の誤追加を防止（現時点で該当ファイルは存在しない）
6. `#[cfg(test)] mod tests` 内の以下のテスト・モックを修正：
   - `DummyEngine` の `send_raw()` 実装を削除
   - `MockEngine` の `send_raw()` モック定義を削除
   - `mock_send_raw_exists` テストを削除
   - `generate_params_enable_thinking_true` テストを削除（該当フィールド削除により）
   - `generate_params_default_uses_constants` テストの `enable_thinking` アサート行を削除

## Non-scope

- `inference/generate.rs` の推論ロジック書き換え（M6-6 で実施）
- `inference/stream.rs` のストリーム変換ロジック（M6-7 で実施）
- `inference/raw.rs` の削除（M6-8 で実施、そもそもファイル未作成）
- `server/openai.rs` の `send_raw` 呼び出し削除（M6-9 で実施）
- `lib.rs` の re-export 修正（M6-10 で実施）
- `Cargo.toml` の依存差し替え（M6-11 で実施）
- `GenerateParams` → `llama_cpp_2::InferenceParams` 変換ロジック（M6-6 で実施）
- `generate_structured` の `params` 引数削除（RFC §4.1 で設計変更の可能性あり。本チケットではスコープ外とし、M6-6 で判断）

## Investigation

### 証拠1: 現在の inference/mod.rs の状態（全行確認済み）

**ファイル**: `crates/ggufrs/src/inference/mod.rs` (374 行)

**1. mistralrs 依存の import（L14）:**
```rust
use mistralrs::{RequestBuilder, Response};
```
→ `send_raw()` 削除により、この import 行は不要になる。

**2. GenerateParams.enable_thinking フィールド（L65）:**
```rust
/// 拡張思考（chain-of-thought）の有効化
///
/// `Some(true)` で有効化、`Some(false)` で無効化。
/// `None` の場合は mistralrs のデフォルト動作に委譲する。
/// ASR 補正タスクでは `Some(false)` を推奨（高速化の設計判断）。
pub enable_thinking: Option<bool>,
```
→ フィールド全行削除。llama-cpp-2 に相当機能なし。

**3. GenerateParams::default()（L76）:**
```rust
enable_thinking: None,
```
→ 削除。

**4. InferenceEngine トレイトの send_raw()（L168-172）:**
```rust
/// mistralrs RequestBuilder への低レベルアクセス
/// ...
async fn send_raw(
    &self,
    model_name: &str,
    request: RequestBuilder,
) -> Result<Response, GgufError>;
```
→ メソッド全体（L155-172）を削除。これによりトレイトは generate / generate_structured / generate_stream の3メソッドになる。

**5. DummyEngine の send_raw 実装（L215-221）:**
```rust
async fn send_raw(
    &self,
    _model_name: &str,
    _request: RequestBuilder,
) -> Result<Response, GgufError> {
    todo!()
}
```
→ 削除。

**6. MockEngine の send_raw モック定義（L268-269）:**
```rust
async fn send_raw(&self, model_name: &str, request: RequestBuilder) -> Result<Response, GgufError>;
```
→ 削除。

**7. mock_send_raw_exists テスト（L362-372）:**
```rust
#[tokio::test]
async fn mock_send_raw_exists() {
    let mut mock = MockEngine::new();
    mock.expect_send_raw()
        .returning(|_, _| Err(GgufError::ModelNotFound("not implemented".into())));
    let _ = mock;
}
```
→ 削除。

**8. generate_params_enable_thinking_true テスト（L248-255）:**
```rust
#[test]
fn generate_params_enable_thinking_true() {
    let params = GenerateParams {
        enable_thinking: Some(true),
        ..GenerateParams::default()
    };
    assert_eq!(params.enable_thinking, Some(true));
}
```
→ 削除。

**9. generate_params_default_uses_constants テスト（L237-246）:**
```rust
#[test]
fn generate_params_default_uses_constants() {
    let params = GenerateParams::default();
    assert_eq!(params.temperature, Some(DEFAULT_TEMPERATURE));
    assert_eq!(params.max_tokens, Some(DEFAULT_MAX_TOKENS));
    assert!(params.top_p.is_none());
    assert!(params.presence_penalty.is_none());
    assert!(params.frequency_penalty.is_none());
    assert!(params.enable_thinking.is_none());  // ← この行のみ削除
}
```
→ `assert!(params.enable_thinking.is_none());` 行のみ削除。

### 証拠2: RFC §4.1 の設計（RFC.md L594-661）

RFC の `InferenceEngine` トレイトは3メソッドを規定：
```rust
#[async_trait]
pub trait InferenceEngine: Send + Sync {
    async fn generate(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<String>;
    async fn generate_structured(&self, model_name: &str, prompt: &str, schema: Value) -> Result<Value>;
    async fn generate_stream(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<Pin<Box<dyn Stream<...>>>>;
}
```

RFC の5つの差分のうち本チケットに関係するもの：
- `send_raw()` 削除（4→3メソッド）
- `TextMessages` → `&str`（本チケット着手前のコードですでに `&str` 済み）

RFC では `generate_structured` の `params` 引数も削除されているが、Tickets.md の本チケットスコープには含まれていないため、本チケットでは変更しない（スコープ外と明記）。`params` 削除の判断は M6-6 以降に委ねる。

### 証拠3: 依存チケットの状態

**M6-4（Ticket 184, registry.rs 修正）**: ステータス `reviewed`。ModelInfo.model の型が `Arc<LlamaModel>` に変更され、本チケットの先行条件は満たされている。

**後続チケット**:
- M6-6（generate.rs 全書き換え）: 本チケットのトレイト定義変更に追随する
- M6-7（stream.rs 全書き換え）: 同上
- M6-9（server/openai.rs）: `send_raw` 呼び出し削除が必要。本チケットでトレイトから `send_raw` を削除すると、`engine.send_raw()` を呼んでいる `openai.rs` はコンパイルエラーになる

### 証拠4: 犯罪・スタブの点検

- **Malfeasance.json**: 未解決の犯罪なし（0件）
- **スタブ一覧**: 11件検出。内訳：
  - `error.rs`: 5件（M6-11 で解決予定）
  - `inference/generate.rs`: 4件（M6-6 で解決予定）
  - `server/router.rs`: 1件（M6-11 で解決予定）
  - `consts/settings.rs`: 1件（dead_code 抑制コメント）
- `inference/mod.rs` 内に `[::STUB::]` 未付与の不完全実装はない
- 本チケットの変更対象ファイルに新たなスタブは発生しない

### 証拠5: コンパイル可否

本チケットの変更のみでコンパイルは**通らない**。理由：
- `server/openai.rs` が `engine.send_raw()` を呼び出している（2箇所、L76 / L137）
- `server/openai.rs` が `use mistralrs::{ChatCompletionResponse, RequestBuilder, Response, TextMessageRole, TextMessages}` に依存（L18）
- これらの解消は M6-9（server/openai.rs 修正）で行う

Tickets.md のとおり、M6-2（M6-4 → M6-5 → ... → M6-12）の期間はコンパイルが通らない状態が継続する。

## Test Plan

### ユニットテスト計画

| # | テスト名 | 変更 | 内容 |
|---|---------|------|------|
| 1 | `inference_engine_is_send_sync` | `DummyEngine` の `send_raw` 実装削除 | 変更なしの他のテスト維持確認 |
| 2 | `inference_engine_is_object_safe` | 変更なし | 引き続き3メソッドでオブジェクトセーフ維持 |
| 3 | `generate_params_default_uses_constants` | `enable_thinking` アサート行削除 | 残り5フィールドのデフォルト値検証 |
| 4 | `generate_params_enable_thinking_true` | **テスト削除** | 該当フィールド削除のため |
| 5 | `mock_generate_returns_expected_text` | 変更なし | MockEngine の generate モックは維持 |
| 6 | `mock_generate_returns_error` | 変更なし | |
| 7 | `mock_generate_structured_returns_value` | 変更なし | |
| 8 | `mock_generate_structured_returns_error` | 変更なし | |
| 9 | `mock_generate_stream_returns_ok` | 変更なし | |
| 10 | `mock_generate_stream_returns_error` | 変更なし | |
| 11 | `mock_send_raw_exists` | **テスト削除** | send_raw 削除により不要 |

### テスト不可能な項目（例外）

1. **クレート全体のコンパイル検証**: 本チケット変更後、`server/openai.rs` が `send_raw` 呼び出しでコンパイルエラーになる。クレート全体のコンパイル検証は M6-9 以降に実施する。

## Boy Scout Rule — 翻訳可能性計画

### 改善対象（inference/mod.rs 内）

1. **`send_raw` メソッド削除**: トレイトのメソッドが4→3に減少し、推論エンジン公開APIの責務が「生成する（generate）」「構造化生成する（generate_structured）」「ストリーム生成する（generate_stream）」に統一される。これによりトレイトの「何をするか」がメソッド名の並びだけで理解できるようになる。

2. **`enable_thinking` フィールド削除**: mistralrs 特化の概念が除去され、`GenerateParams` は推論パラメータ（temperature, max_tokens, top_p, presence_penalty, frequency_penalty）に純化される。各フィールド名が「温度」「最大トークン数」「Top-P」「存在ペナルティ」「頻度ペナルティ」と明確なドメイン概念を表現する。

3. **`mistralrs::{RequestBuilder, Response}` import 削除**: mistralrs 依存の型がトレイト定義から完全に消える。これにより `inference/mod.rs` の依存関係が純粋な標準ライブラリ＋クレート内型のみになり、モジュールの責務境界が明確化される。

### 全般

- 本チケットにより `inference/mod.rs` の翻訳可能性は「mistralrs の詳細を知らなくても読める」状態に改善される
- トレイトのコメントも `send_raw` 関連の記述を削除して整理する

## Acceptance Criteria

- [ ] `use mistralrs::{RequestBuilder, Response}` の import 行が削除されている
- [ ] `InferenceEngine` トレイトが3メソッド（generate, generate_structured, generate_stream）のみであること
- [ ] `send_raw()` メソッド定義が完全に削除されている
- [ ] `// pub mod raw` のコメントアウト行が追加されている（将来の誤追加防止）
- [ ] `GenerateParams` から `enable_thinking` フィールドが削除されている
- [ ] `GenerateParams::default()` から `enable_thinking` 初期化が削除されている
- [ ] `DummyEngine` が3メソッドのみ実装している（`send_raw` 実装がない）
- [ ] `MockEngine` のモック定義に `send_raw` が存在しない
- [ ] `mock_send_raw_exists` テストが削除されている
- [ ] `generate_params_enable_thinking_true` テストが削除されている
- [ ] `generate_params_default_uses_constants` テストから `enable_thinking` アサートが削除されている
- [ ] 残りの全テストが変更前と同様の動作を維持していること（構文的に）
- [ ] Malfeasance.json に新規犯罪が発生していないこと
- [ ] 新たな `[::STUB::]` 未付与の不完全実装を発生させていないこと

## Notes

- 本チケット実装後、`server/openai.rs` が `send_raw` 呼び出しでコンパイルエラーになるが、これは許容された状態（M6-9 で解消）
- `generate_structured` の `params` 引数は現状維持。RFC §4.1 では削除が示唆されているが、判断は M6-6 に委ねる
- 依存 M6-4（registry.rs 修正）の完了を確認してから実装を開始すること

### 成果物

- 計画: `context/0185-m6-5-inferencemodrs-inferenceengine-3/plan.md`（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: `context/0185-m6-5-inferencemodrs-inferenceengine-3/implementation.md`（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: `context/0185-m6-5-inferencemodrs-inferenceengine-3/review.md`（未作成、/review-ticket 全チェック通過後に作成）
