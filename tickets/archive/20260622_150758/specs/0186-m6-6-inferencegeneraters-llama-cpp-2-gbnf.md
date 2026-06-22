---
ticket_id: 186
title: M6-6: inference/generate.rs 全書き換え — llama-cpp-2 推論統合 + gbnf
slug: m6-6-inferencegeneraters-llama-cpp-2-gbnf
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0186-m6-6-inferencegeneraters-llama-cpp-2-gbnf/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0186-m6-6-inferencegeneraters-llama-cpp-2-gbnf/review.md
---
# M6-6: inference/generate.rs 全書き換え — llama-cpp-2 推論統合 + gbnf

## Summary

`inference/generate.rs` を mistralrs 依存から llama-cpp-2 + gbnf に全面書き換える。`InferenceEngine` トレイトの `generate()` / `generate_structured()` 実装を llama-cpp-2 の同期 API（`LlamaModel::new_context()` → `LlamaContext::infer()`）に置き換え、`generate_stream()` 実装を削除（M6-7 に移動）。JSON Schema 拘束は `Constraint::JsonSchema` から `gbnf::convert()` 経由の GBNF 文法に変更する。

## Background

現在の `inference/generate.rs` は mistralrs の `Model::send_chat_request()` / `RequestBuilder` / `Constraint` に依存している。M6-4（registry.rs）で `LlamaModel` へのモデルロード置き換えが完了し、M6-5（inference/mod.rs）でトレイト定義が3メソッド化された。本チケット M6-6 で推論実行部を llama-cpp-2 の同期 API に書き換えることで、mistralrs 依存を実装層からも完全に除去する。

### 前提状態（M6-4, M6-5 完了時点）

- **registry.rs**: `LlamaModel::load_from_file()` + `spawn_blocking` によるモデルロードが実装済み。`ModelRegistry::get()` は `Arc<LlamaModel>` を返す。
- **inference/mod.rs**: `InferenceEngine` トレイトは3メソッド（`generate` / `generate_structured` / `generate_stream`）。`send_raw` 削除済み。`GenerateParams` から `enable_thinking` 削除済み。
- **Cargo.toml**: `mistralrs` と `llama-cpp-2 = "0.1.150"` が共存（M6-11 で mistralrs 削除）。`gbnf = "0.2.7"` は未追加。
- **error.rs**: `LlamaCppError(#[from] mistralrs::error::Error)` のまま（M6-11 で llama_cpp_2 に差し替え）。

> **重要**: M6-6 のコードは `gbnf` の `use` と `llama_cpp_2` の型を使用するが、Cargo.toml に `gbnf` が追加されるのは M6-11 である。そのため M6-6 の実装単体ではコンパイルが通らない。これはフェーズ F の設計通りの順序であり、M6-11 で全依存が揃った時点でコンパイルが復旧する。

## Scope

1. **`inference/generate.rs` 全書き換え**:
   - mistralrs の全 import（`mistralrs::{Constraint, RequestBuilder, Response, SamplingParams, TextMessageRole}`）を削除
   - `From<GenerateParams> for SamplingParams` → `From<GenerateParams> for llama_cpp_2::InferenceParams` に置き換え
   - `generate()` の実装を以下のフローに変更:
     1. `self.registry.get(model_name)` で `Arc<LlamaModel>` を取得
     2. `GenerateParams` → `InferenceParams` に変換
     3. `tokio::task::spawn_blocking` 内で:
        - `LlamaContextParams::default().with_n_ctx(...)` でコンテキストパラメータ作成
        - `model.new_context(&ctx_params)` で `LlamaContext` 生成
        - `ctx.tokenize(prompt.as_bytes(), true)` でトークナイズ
        - `ctx.infer(tokens, &inference_params)` で推論実行
        - `ctx.tokenize_to_bytes(&output, false)` → `String::from_utf8()` で文字列化
        - 全エラーを `GgufError::InferenceFailed(Box::new(e))` にマッピング
   - `generate_structured()` の実装を以下のフローに変更:
     1. 同上のモデル取得
     2. `gbnf::convert(&schema)` で JSON Schema → GBNF 文法変換（エラー時は `GgufError::InvalidConfig`）
     3. `InferenceParams` 生成 → `grammar` フィールドに GBNF 文法をセット
     4. 同上の `spawn_blocking` → 推論実行
     5. `serde_json::from_str(&result)` で JSON パース（エラー時は `GgufError::InferenceFailed`）
   - `generate_stream()` 実装を **削除**（M6-7 で stream.rs に再実装）
   - `send_raw()` 実装を **削除**（トレイト定義から既に削除済み）

2. **テストコードの置き換え**:
   - mistralrs 依存テストの削除:
     - `from_generate_params_maps_all_fields` — `SamplingParams` 使用
     - `from_generate_params_none_fields_propagate` — `SamplingParams` 使用
     - `from_generate_params_default_values_convert` — `SamplingParams` 使用
     - `from_generate_params_fixed_fields` — `SamplingParams` 使用
     - `request_builder_constructs_with_messages` — `RequestBuilder` 使用
     - `constraint_json_schema_constructs` — `Constraint` 使用
   - 新規テストの追加:
     - `from_generate_params_to_inference_params_maps_all_fields`
     - `from_generate_params_to_inference_params_none_fields_propagate`
     - `gbnf_convert_valid_schema_success`
     - `gbnf_convert_invalid_schema_returns_error`

3. **廃止予定の関数の削除確認**:
   - `generate.rs` 内の `generate_stream()` 実装が削除され、`inference/mod.rs` で `pub mod generate` が依然として存在することを確認

## Non-Goals

- `generate_stream()` の再実装は M6-7 のスコープ。本チケットでは削除のみ行う。
- Cargo.toml への `gbnf` 追加は M6-11 のスコープ。本チケットでは `use gbnf;` を記述するが、コンパイルは通らない状態でよい。
- `error.rs` の `#[from]` 差し替えは M6-11 のスコープ。本チケットでは `GgufError::InferenceFailed(Box::new(e))` で手動マッピングする。
- ストリーミング関連のコードは本チケットでは触れない（M6-7 に委譲）。

## Dependencies

- **先行実装必須（完了済み）**: M6-4（registry.rs: LlamaModel + spawn_blocking）、M6-5（トレイト定義3メソッド化）
- **後続**: M6-7（stream.rs: TokenCallback + mpsc）、M6-9（サーバーからの呼び出し）、M6-11（Cargo.toml 依存差し替え＝コンパイル復旧）

## Investigation

### ファイル別調査結果

#### 1. 現在の `inference/generate.rs`（337行）

**mistralrs 依存箇所**（全削除対象）:

| 行 | 内容 | 削除理由 |
|----|------|---------|
| L29-30 | `use mistralrs::{...}` | 全削除 |
| L43-62 | `impl From<GenerateParams> for SamplingParams` | `InferenceParams` に置き換え |
| L80-94 | `RequestBuilder::new().add_message(...)` | mistralrs API |
| L96-100 | `model.send_chat_request(request).await` | mistralrs API |
| L102-112 | `response.choices[...].message.content` | mistralrs レスポンス型 |
| L118-143 | `generate_structured()` 同様 | mistralrs API 全般 |
| L159-219 | `generate_stream()` | M6-7 へ移動（本チケットで削除） |
| L221-233 | `send_raw()` | トレイト削除済みのため削除 |
| L236-336 | テストコード | mistralrs 型依存のため全削除＋書き直し |

**`[::STUB::]` マーカー**（4箇所）:
- L99: `// [::STUB::] M6-6 で全削除（このファイルごと llama-cpp-2 実装に書き換え）`
- L142: 同上（generate_structured 内）
- L185: 同上（generate_stream 内）
- L230: 同上（send_raw 内）

これらは本チケットの実装により解決される。

#### 2. RFC §4.3 generate() 実装（ref）

```rust
async fn generate(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<String> {
    let model = self.registry.get(model_name).await?;
    let inference_params: llama_cpp_2::InferenceParams = params.into();
    let prompt = prompt.to_string();

    let result = tokio::task::spawn_blocking(move || {
        let ctx_params = llama_cpp_2::context::params::LlamaContextParams::default()
            .with_n_ctx(inference_params.n_predict.max(512) as u32);
        let mut ctx = model.new_context(&ctx_params)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        let tokens = ctx.tokenize(prompt.as_bytes(), true)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        let output = ctx.infer(tokens, &inference_params)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        let output_bytes = ctx.tokenize_to_bytes(&output, false)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        String::from_utf8(output_bytes)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))
    }).await.map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;

    Ok(result)
}
```

#### 3. RFC §4.4 generate_structured() 実装（ref）

```rust
async fn generate_structured(&self, model_name: &str, prompt: &str, schema: Value) -> Result<Value> {
    let model = self.registry.get(model_name).await?;

    let gbnf_grammar = gbnf::convert(&schema)
        .map_err(|e| GgufError::InvalidConfig(format!("JSON Schema → GBNF failed: {e}")))?;

    let mut inference_params = llama_cpp_2::InferenceParams::default();
    inference_params.grammar = Some(gbnf_grammar);
    inference_params.temperature = 0.1;
    inference_params.n_predict = 256;

    let prompt = prompt.to_string();

    let result = tokio::task::spawn_blocking(move || {
        let ctx = model.new_context(
            &llama_cpp_2::context::params::LlamaContextParams::default().with_n_ctx(2048)
        ).map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        let tokens = ctx.tokenize(prompt.as_bytes(), true)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        let output = ctx.infer(tokens, &inference_params)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        let output_bytes = ctx.tokenize_to_bytes(&output, false)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        String::from_utf8(output_bytes)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))
    }).await.map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;

    serde_json::from_str(&result)
        .map_err(|e| GgufError::InferenceFailed(Box::new(e)))
}
```

#### 4. RFC §4.2 GenerateParams → InferenceParams 変換

```rust
impl From<GenerateParams> for llama_cpp_2::InferenceParams {
    fn from(params: GenerateParams) -> Self {
        let mut lp = llama_cpp_2::InferenceParams::default();
        if let Some(t) = params.temperature {
            lp.temperature = t;
        }
        if let Some(n) = params.max_tokens {
            lp.n_predict = n as i32;
        }
        if let Some(p) = params.top_p {
            lp.top_p = p;
        }
        if let Some(p) = params.presence_penalty {
            lp.penalty_last_n = lp.n_predict;
        }
        if let Some(_f) = params.frequency_penalty {
            lp.penalty_repeat = params.frequency_penalty
                .map(|f| 1.0 + f)
                .unwrap_or(1.0);
        }
        lp
    }
}
```

> **注意**: 上記の `InferenceParams` フィールド名は RFC 執筆時点の想定。実装開始前に [docs.rs/llama-cpp-2](https://docs.rs/llama-cpp-2/latest/llama_cpp_2/) で `InferenceParams` の実際のフィールド定義を確認し、必要に応じてアダプトすること。

#### 5. 既存のスタブ解決

本チケットで以下の `[::STUB::]` が解決される:

| ファイル | 行 | 内容 | 解決方法 |
|----------|-----|------|---------|
| `inference/generate.rs` | 99 | `send_chat_request` → `map_err` | ファイル全体書き換えにより削除 |
| `inference/generate.rs` | 142 | `send_chat_request` structured版 | 同上 |
| `inference/generate.rs` | 185 | `stream_chat_request` | 同上 |
| `inference/generate.rs` | 230 | `send_raw` 実装 | 同上 |

12件中4件のスタブが本チケットで解決される。残りは M6-8（mod.rs）、M6-11（error.rs, router.rs, settings.rs）で解決予定。

## Test Plan

### ユニットテスト計画

#### 1. `From<GenerateParams> for llama_cpp_2::InferenceParams` 変換テスト

| # | テスト名 | 正常/異常 | 内容 |
|---|---------|----------|------|
| 1 | `from_generate_params_maps_temperature` | 正常 | temperature → InferenceParams.temperature |
| 2 | `from_generate_params_maps_max_tokens` | 正常 | max_tokens(u32) → n_predict(i32) |
| 3 | `from_generate_params_maps_top_p` | 正常 | top_p → InferenceParams.top_p |
| 4 | `from_generate_params_maps_presence_penalty` | 正常 | presence_penalty → penalty_last_n |
| 5 | `from_generate_params_maps_frequency_penalty` | 正常 | frequency_penalty → penalty_repeat (1.0 + f) |
| 6 | `from_generate_params_none_fields_leave_defaults` | 正常 | None のフィールドがデフォルト値のまま |
| 7 | `from_generate_params_all_fields_mapped` | 正常 | 全フィールド同時設定で正しくマップされる |
| 8 | `from_generate_params_zero_values` | 境界 | max_tokens=0 → n_predict=0 |

#### 2. `gbnf::convert()` テスト

| # | テスト名 | 正常/異常 | 内容 |
|---|---------|----------|------|
| 9 | `gbnf_convert_valid_object_schema` | 正常 | `{"type":"object","properties":{"name":{"type":"string"}}}` → GBNF 文字列 |
| 10 | `gbnf_convert_valid_array_schema` | 正常 | `{"type":"array","items":{"type":"number"}}` → GBNF 文字列 |
| 11 | `gbnf_convert_invalid_schema_type` | 異常 | 存在しない未定義の型 → エラー |
| 12 | `gbnf_convert_non_object_input` | 異常 | JSON 配列 → エラー |

#### 3. ファイル構成テスト（コンパイル時）

| # | テスト名 | 正常/異常 | 内容 |
|---|---------|----------|------|
| 13 | `generate_mod_exists` | 正常 | `pub mod generate` が依然として有効であること |
| 14 | `inference_engine_generate_signature` | 正常 | `send_raw` メソッドが generate.rs に存在しないこと |

### ユニットテスト不可能な項目（例外）

- `generate()` の `spawn_blocking` 内統合テスト: `LlamaModel::load_from_file` が必要（実GGUFファイル依存）。`ModelRegistry::get()` のモックが必要だが `ModelRegistry` はトレイトではなく具象型のため、mockall によるモックが困難。結合テスト（tests/）でカバーする。
- `generate_structured()` の実際の GBNF 制約動作確認: 実モデルを使った推論が必要。結合テストでカバーする。
- gbnf クレートの内部変換ロジック: gbnf クレートの責任であり、本クレートではテストしない。ただし `gbnf::convert()` 呼び出しの成功/失敗は上記テストでカバーする。

## Acceptance Criteria

1. [ ] `generate.rs` から `use mistralrs::{...}` が全て削除されている
2. [ ] `From<GenerateParams> for llama_cpp_2::InferenceParams` が実装されている
3. [ ] `generate()` が `ModelRegistry::get()` → `spawn_blocking` + `LlamaContext` パターンで実装されている
4. [ ] `generate_structured()` が `gbnf::convert()` + `InferenceParams::grammar` で実装されている
5. [ ] `generate_stream()` 実装が generate.rs から削除されている（M6-7 で stream.rs に追加）
6. [ ] `send_raw()` 実装が削除されている
7. [ ] 全てのエラーが `GgufError::InferenceFailed` または `GgufError::InvalidConfig` にマッピングされている
8. [ ] mistralrs 依存のテストが全削除され、新しい変換テスト + gbnf テストが追加されている
9. [ ] 12件のスタブのうち4件が解決されている（generate.rs 内の `[::STUB::] M6-6` マーカー4箇所）

## Boy Scout Rule — 翻訳可能性計画

本チケットでは generate.rs を全書き換えする。新規コードは以下の翻訳可能性原則に従う:

1. **関数名は動詞句**: `generate()`, `generate_structured()` は既に動詞句。内部で抽出するヘルパー関数も動詞句命名する（例: `build_inference_params()`, `run_inference_blocking()`）
2. **一関数一責務**: `generate()` は「同期的な推論ブロックの構築」を責務とする。spawn_blocking クロージャ内の「コンテキスト生成」「トークナイズ」「推論実行」「デコード」の各ステップは明確に分離されたまま記述する。必要以上に関数抽出は行わないが、クロージャが20行を超える場合は命名された内部関数への抽出を検討する。
3. **ハードコード値禁止**: `n_ctx` のデフォルト値（`n_predict.max(512) as u32`）は設定定数化を検討する。ただし `DEFAULT_CONTEXT_SIZE`（2048）が `consts/settings.rs` に既に存在するため、そちらを参照する。
4. **エラー握りつぶし禁止**: 各 `Result` は `?` 演算子で伝播し、`unwrap()` / `expect()` を一切使用しない。`spawn_blocking` の join エラーも `GgufError::InferenceFailed` にマッピングする。
5. **モジュール境界の明確化**: 本ファイルの責務は「同期推論APIの非同期ラップ」に限定する。トークナイズやデコードのロジック内包を避け、llama-cpp-2 のAPIをそのまま使用する。

## Implementation Order

1. `inference/generate.rs` の全内容を下記構造で書き換え:

```
// imports: std, async_trait, futures, serde_json, llama_cpp_2, gbnf
// crate internal: GgufError, GenerateParams, InferenceEngine, GgufEngine

// From<GenerateParams> for llama_cpp_2::InferenceParams impl
// GgufEngine への InferenceEngine 実装:
//   - generate() — spawn_blocking + LlamaContext + infer
//   - generate_structured() — gbnf::convert + grammar + spawn_blocking + infer
//   ※ generate_stream と send_raw は含まない

// #[cfg(test)] mod tests:
//   - GenerateParams → InferenceParams 変換テスト 8件
//   - gbnf::convert テスト 4件（完全な gbnf 合わせ）
```

2. テストのみ先にコンパイルが通ることを確認（gbnf が未追加のため通らないことを確認 → 設計通り）
3. `[::STUB::]` マーカー4箇所が削除されていることを確認

## References

- RFC §4.2: 推論パラメータ — `From<GenerateParams>` 変換
- RFC §4.3: `generate()` 実装設計
- RFC §4.4: `generate_structured()` 実装設計（gbnf 統合）
- RFC ファイル別変更要約 (src/inference/generate.rs | [MODIFY])
- [llama-cpp-2 docs.rs](https://docs.rs/llama-cpp-2/latest/) — `InferenceParams`, `LlamaContext`, `LlamaContextParams`
- [gbnf docs.rs](https://docs.rs/gbnf/latest/gbnf/) — `gbnf::convert()` シグネチャ確認

## Summary

<!-- このチケットで達成することの簡潔な説明 -->

## Background

<!-- なぜこのチケットが必要か -->

## Scope

<!-- 何をするか -->

## Non-scope

<!-- 何をしないか -->

## Investigation

<!--
憶測や論理的な推論だけでは不十分である。ソースコードの解析、grep、解析調査用テストコードの作成、テストの実行、ログの確認などを通じて**物理的な証拠**を見つけ出し、ここに記録すること。

記録すべき証拠の例：
- エラーメッセージ、スタックトレース、テスト失敗の再現手順
- grep や検索で見つけた関連コードの該当箇所（ファイル名・行番号）
- 実際に確認した動作や期待との乖離
- 検証済みの仮説と反証された仮説

記載された証拠は後日 /plan-ticket が正確な計画を立てるための唯一の材料となる。
-->

## Test Plan

<!--
★★★ 重要: テスト計画はユニットテストの網羅性を最優先する ★★★

**基本方針**: ユニットテストでカバーできる範囲は全てユニットテストで検証する。
ユニットテストのみで検証できない部分（外部サービス結合、ハードウェア依存等）に
限り、E2Eテストまたは手動テストを計画する。「ユニットテスト不可能な項目」として
理由を明記したものだけが例外として認められる。

### ユニットテスト計画

- どの関数／モジュールに対してテストを書くか
- 正常系・異常系・境界値の各ケース
- モック・スタブが必要な外部依存
- カバレッジ目標（目安: 80%以上、クリティカルパスは90%以上）

### ユニットテスト不可能な項目（例外）

ユニットテストでは検証不可能な項目のみを、理由とともに列挙する。
例：
- 理由1: 外部APIとの結合（モックでは再現不可能な挙動がある）
- 理由2: ハードウェア依存の処理（実機が必要）
-->

## Boy Scout Rule — 翻訳可能性計画

<!--
このチケットで触るコードに対して、以下の観点で「来たときよりも美しく（翻訳可能に）」する計画を書く:

- 関数名/変数名が散文として読めるか
- 責務が混在している関数は分割すべきか
- ハードコード値を定数化すべきか
- コメントが「なぜ」を説明しているか
-->

## Acceptance Criteria

- [ ] 実装要件を満たしている
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0186-m6-6-inferencegeneraters-llama-cpp-2-gbnf/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0186-m6-6-inferencegeneraters-llama-cpp-2-gbnf/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0186-m6-6-inferencegeneraters-llama-cpp-2-gbnf/review.md（未作成、/review-ticket 全チェック通過後に作成）
