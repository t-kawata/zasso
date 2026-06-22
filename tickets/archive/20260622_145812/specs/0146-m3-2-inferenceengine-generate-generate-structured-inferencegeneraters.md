---
ticket_id: 146
title: "M3-2: InferenceEngine generate / generate_structured 実装 (inference/generate.rs)"
slug: "m3-2-inferenceengine-generate-generate-structured-inferencegeneraters"
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0146-m3-2-inferenceengine-generate-generate-structured-inferencegeneraters/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0146-m3-2-inferenceengine-generate-generate-structured-inferencegeneraters/review.md
---
# M3-2: InferenceEngine generate / generate_structured 実装 (inference/generate.rs)

## Summary

`GgufEngine` に `InferenceEngine` トレイトの `generate()` / `generate_structured()` を実装する。
同時に `ModelRegistry::get()` 内のスタブを実際の `GgufModelBuilder` によるモデルロードに置き換え、
`GenerateParams` → `SamplingParams` 変換を実装する。

## Background

### 設計上の位置づけ

M3-2 は ggufrs の最も基本的な推論機能を提供する。このチケットで初めて `mistralrs` の実際の推論 API
が呼ばれ、GgufModelBuilder によるモデルロード（context_size, gpu_layers 等の設定反映）が行われる。

### 現在の実装状況

- `InferenceEngine` トレイト定義 (`inference/mod.rs`): ✅ M2-1 完了
- `ModelRegistry::get()` (`registry.rs:153`): ✅ 非同期フレームワーク実装済み、**ロードロジックは STUB**
- `GgufEngine` (`lib.rs`): ✅ 構造体 + `new()` 実装済み、**未だ `InferenceEngine` 未実装**
- `GenerateParams` (`inference/mod.rs`): ✅ 定義済み
- `Model::send_chat_request()` (mistralrs 0.8.1): ✅ 非ブロッキング推論API
- `Model::generate_structured()` (mistralrs 0.8.1): ✅ JSON Schema 拘束生成
- `GgufModelBuilder` (mistralrs 0.8.1): ✅ `.build()` で `Model` を生成
- `SamplingParams` (mistralrs-core 0.8.1): ✅ 生成パラメータ構造体
- `Constraint` (mistralrs-core 0.8.1): ✅ `None` / `JsonSchema(Value)` / `Regex(String)` / `Lark(String)`
- `ChatCompletionResponse` (mistralrs 0.8.1): ✅ `choices: Vec<Choice>`, `Choice.message.content`

### このチケットの必要性

M2-1/M2-2 でトレイト定義と非同期枠組みが整ったが、実際の推論処理とモデルロードは未実装。
GgufEngine は `InferenceEngine` トレイトを実装していないため、`dyn InferenceEngine` として
使用できず、M4-1（サーバー）への橋渡しができない。

## Scope

### 実装するもの

1. **`inference/generate.rs` 作成**
   - `GgufEngine` への `InferenceEngine` 実装ブロック
   - `generate()`: `ModelRegistry::get()` → `Model::send_chat_request()` → テキスト抽出
   - `generate_structured()`: `ModelRegistry::get()` → `Constraint::JsonSchema` + `Model::send_chat_request()` → Value 抽出

2. **`ModelRegistry::get()` 内の実際のモデルロード**
   - `GgufModelBuilder` を使用した `Model` インスタンス生成
   - `ModelInfo` のフィールド（chat_template）を builder に反映
   - ロード成功後、`ModelInfo.model` に `Arc<Model>` を設定してキャッシュ
   - `load_immediate()` / `load_all()` のスタブも同時解決

3. **`GenerateParams` → `SamplingParams` 変換**
   - `temperature` (f32 → f64), `max_tokens` (u32 → usize → `max_len`)
   - `top_p` (f32 → f64), `presence_penalty`, `frequency_penalty`

4. **`inference/mod.rs` の更新**
   - `pub mod generate;` 宣言
   - モジュールドキュメントから STUB 削除

5. **`lib.rs` の M3-5 先行部分**
   - 必要な mistralrs 型の `pub use`（`Model`, `TextMessages`, `TextMessageRole`, `Constraint` 等）

### 実装しないもの

- `generate_stream()` — 別チケット M3-3
- `send_raw()` — 別チケット M3-4
- サーバー統合 — M4-1 以降
- モデルファイルの自動ダウンロード — M5-1

## Investigation

### mistralrs 0.8.1 API の要点

**`GgufModelBuilder`** (`mistralrs/src/gguf.rs:12`):
```rust
pub struct GgufModelBuilder { /* model_id, files, chat_template, force_cpu 等 */ }
impl GgufModelBuilder {
    pub fn new(model_id: impl ToString, files: Vec<impl ToString>) -> Self;
    pub fn with_chat_template(mut self, chat_template: impl ToString) -> Self;
    pub fn with_force_cpu(mut self) -> Self;
    pub async fn build(self) -> anyhow::Result<Model>;
}
```

**`Model`** (`mistralrs/src/model.rs:61`):
```rust
pub struct Model { runner: Arc<MistralRs> }
impl Model {
    pub fn new(runner: Arc<MistralRs>) -> Self;
    pub async fn send_chat_request<R: RequestLike>(&self, request: R) -> Result<ChatCompletionResponse>;
    pub async fn generate_structured<T: DeserializeOwned + JsonSchema>(&self, messages: impl Into<RequestBuilder>) -> Result<T>;
}
```

**`SamplingParams`** (`mistralrs-core/src/sampler.rs:60`):
```rust
pub struct SamplingParams {
    pub temperature: Option<f64>,
    pub top_k: Option<usize>,
    pub top_p: Option<f64>,
    pub min_p: Option<f64>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub max_len: Option<usize>,
    pub n_choices: usize,
    // ...
}
```

**`Constraint`** (`mistralrs-core/src/request.rs:21`):
```rust
pub enum Constraint {
    Regex(String), Lark(String), JsonSchema(serde_json::Value),
    Llguidance(LlguidanceGrammar), None,
}
```

**`ChatCompletionResponse`**: `choices: Vec<Choice>` → `Choice.message.content: Option<String>`

**`TextMessages`** (`mistralrs/src/messages.rs:52`):
```rust
pub struct TextMessages { messages: Vec<IndexMap<String, MessageContent>> }
impl TextMessages {
    pub fn new() -> Self;
    pub fn add_message(self, role: TextMessageRole, text: impl ToString) -> Self;
}
```

### GgufModelBuilder と ModelInfo の対応

`ModelInfo` → `GgufModelBuilder`:
- `model_path` → `model_id`（`.to_string_lossy()`）
- `files` → `vec!["**"]`（単一GGUFファイルのワイルドカード）
- `chat_template Some(t)` → `.with_chat_template(t)`
- `context_size`, `gpu_layers`, `batch_size`: GgufModelBuilder に直接対応メソッドなし → デフォルト使用

### GenerateParams → SamplingParams 変換

```rust
impl From<GenerateParams> for SamplingParams {
    fn from(params: GenerateParams) -> Self {
        Self {
            temperature: params.temperature.map(|t| t as f64),
            top_p: params.top_p.map(|p| p as f64),
            frequency_penalty: params.frequency_penalty,
            presence_penalty: params.presence_penalty,
            max_len: params.max_tokens.map(|m| m as usize),
            top_k: None, min_p: None, top_n_logprobs: 0,
            repetition_penalty: None, stop_toks: None,
            logits_bias: None, n_choices: 1, dry_params: None,
        }
    }
}
```

### テキスト生成のデータフロー

```
generate(model_name, prompt, params)
  → ModelRegistry::get(model_name)
    → 未ロード → GgufModelBuilder::new(path, ["**"]).build() → Arc<Model>
    → ロード済み → Arc<Model> を返す
  → TextMessages 構築 (prompt → User)
  → SamplingParams 変換 (params → mistralrs 形式)
  → Model::send_chat_request(request)
  → response.choices[0].message.content → String
```

### スタブ状況

M3-2 で解決すべきSTUB（対象ディレクトリ: `crates/ggufrs/src/`）:

| ファイル | 行 | 内容 |
|----------|-----|------|
| `inference/mod.rs` | L5 | メソッド実装追加のSTUB |
| `registry.rs` | L5 | load_model 実際のロード処理 |
| `registry.rs` | L148 | load_model の実際の呼び出し |
| `registry.rs` | L165, L169 | get() 内のロード処理 |
| `registry.rs` | L184, L189 | load_immediate 実装 |
| `registry.rs` | L204, L208 | load_all 実装 |

M3-2 で解決しないSTUB: `lib.rs` (M3-5), `server/mod.rs` (M4-1/4-2), `test-run.rs` (M5-2)

### 依存チケット状態

- M2-1 (トレイト定義): ✅ 完了
- M2-2 (非同期メソッド): ✅ 完了
- M3-1 (GgufConfig::build): ✅ 完了 (#145)

## Test Plan

### ユニットテスト計画

#### 1. `GenerateParams` → `SamplingParams` 変換（generate.rs 内の mod tests）

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 1.1 | 全フィールド変換 | 正常系 | temperature, max_tokens, top_p, penalties が正しく変換される |
| 1.2 | None フィールド変換 | 正常系 | 全て None → SamplingParams も None |
| 1.3 | 型変換の精度 | 正常系 | f32→f64、u32→usize の精度確認 |

#### 2. Mistralrs 型のテスト（generate.rs の mod tests）

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 2.1 | TextMessages 構築テスト | 正常系 | 文字列から TextMessages が正しく構築できる |
| 2.2 | Constraint::JsonSchema 構築 | 正常系 | serde_json::Value から Constraint が生成できる |

#### 3. generate() エラーパス（モック + 結合）

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 3.1 | 存在しないモデル名 | 異常系 | registry.get() → ModelNotFound |

#### 4. 回帰テスト

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 4.1 | 既存 mockall テスト通過 | 回帰 | inference/mod.rs のモック定義が壊れていない |
| 4.2 | 既存 registry テスト通過 | 回帰 | registry.rs の全テストが通過 |

#### カバレッジ目標

- `generate.rs`: ラインカバレッジ 80%+
- `GenerateParams → SamplingParams` 変換: 100%
- `ModelRegistry` モデルロードパス: エラーハンドリングカバレッジ 80%

### ユニットテスト不可能な項目（例外）

1. **GgufModelBuilder による実際のモデルロード**: 実際の GGUF モデルファイルが必要。M5-1 のモデル自動ダウンロード完了後、結合テストで検証する。
2. **Model::send_chat_request の実際の推論**: mistralrs のランタイムとモデルファイルが必要。M5-3 結合テストで検証する。

## Boy Scout Rule — 翻訳可能性計画

### 新規コードで遵守すべきルール

1. **関数名は動詞句**: `generate`, `generate_structured`, `load_model`
2. **変数名はドメイン概念**: `model`, `model_info`, `sampling_params`, `chat_response`
3. **一関数一責務**: generate() は「モデル解決→推論→結果抽出」と複数ステップを持つが、
   逐語訳可能なレベルで統一されたフローとして記述する
4. **エラーは `?` で伝播**: `unwrap()` 不使用、既存の `From` / `map_err` で対応
5. **コメントは「なぜ」**: コードが「何を」しているかは関数名と構造で語る

### 既存コードの改善

- `registry.rs` の `clippy::never_loop` 警告: `load_all()` 内のループで即 `return` している問題を
  実際の実装でループを回すように修正（M3-2 で自然解決）
- `registry.rs` の `clippy::io_other_error`: スタブから実際のエラー処理に置き換わるため自然解決

## Acceptance Criteria

- [ ] `inference/generate.rs` が作成され、`GgufEngine` に `InferenceEngine` を実装
- [ ] `generate()` が正常にテキストを返す（単体テスト＋モック検証）
- [ ] `generate_structured()` が JSON Schema 拘束付き出力を返す（単体テスト＋モック検証）
- [ ] 存在しないモデル名で `ModelNotFound` エラー
- [ ] `ModelRegistry::get()` 内のモデルロードスタブが `GgufModelBuilder` 呼び出しに置き換わっている
- [ ] `GenerateParams` → `SamplingParams` 変換が実装されている
- [ ] `[::STUB::]` マーカーが ggufrs/src/ 内の M3-2 該当箇所から全て除去されている
- [ ] 既存テストが全て通過している
- [ ] 新規テストが全て通過している

## Notes

- `model_id` には `ModelInfo.model_path` を `.to_string_lossy()` で文字列化して渡す
- `files` には `vec!["**"]` を指定（単一 GGUF ファイルのパターン）
- `ModelInfo.context_size` と `gpu_layers` は `GgufModelBuilder` に直接対応するメソッドがないため、
  現時点ではビルダーデフォルトを使用。必要に応じて別チケットで対応する。
- `Model` はスレッドセーフ（`Arc<Model>` として共有可能）
- 依存: M2-1 ✅、M2-2 ✅、M3-1 ✅
- 後続: M3-3（generate_stream）、M3-4（send_raw）、M3-5（lib.rs 統合）、M4-1（サーバー）

### 成果物

- 計画: context/0146-m3-2-inferenceengine-generate-generate-structured-inferencegeneraters/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0146-m3-2-inferenceengine-generate-generate-structured-inferencegeneraters/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0146-m3-2-inferenceengine-generate-generate-structured-inferencegeneraters/review.md（未作成、/review-ticket 全チェック通過後に作成）
