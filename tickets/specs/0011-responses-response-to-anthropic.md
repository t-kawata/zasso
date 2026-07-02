---
ticket_id: 11
title: responses_response_to_anthropic
slug: responses-response-to-anthropic
status: made
created_at: 2026-07-02
updated_at: 2026-07-02
---
# responses_response_to_anthropic: Responses レスポンス→Anthropic レスポンス変換

**チケット**: P7-1  
**参照**: anthropx/RFC-X-001.md (§D-1)  
**親フェーズ**: llm-bridge-core: Responses レスポンス逆変換（純粋関数）

## Summary

`llm-bridge-core` の `response_transforms.rs` に、OpenAI Responses API からの非ストリーミングレスポンス（`output[]` 配列を含む）を Anthropic Messages 形式のレスポンス（`id`, `type: "message"`, `role`, `content[]`, `stop_reason`, `usage`）に変換する関数 `responses_response_to_anthropic()` を新規追加する。

## Background

### 問題

anthropx の translate mode で `openai_wire_api = "responses"` を指定すると、OpenAI Responses API からの非ストリーミングレスポンスが正しく Anthropic Messages 形式に逆変換されない。原因は、`translate.rs` の逆変換パス（L414）が誤って `responses_to_anthropic()`（リクエスト→リクエスト変換）をレスポンス逆変換に使用していることにある。

### エラー連鎖

1. `translate.rs: translate_non_stream()` が upstream の Responses API レスポンスボディを `TransformRequest` にラップ
2. `responses_to_anthropic()` は REQUEST スキーマ（`{model, input, instructions, ...}`）でパース。`#[serde(deny_unknown_fields)]` がないため、未知フィールド（`id`, `object`, `output`, `usage`）はサイレント無視される
3. `input = None` → 空メッセージ `[]` → 合成 Chat Completions REQUEST → Anthropic REQUEST 形式が生成される
4. 本来要求される Anthropic RESPONSE 形式（`id`, `type: "message"`, `content[]`, `stop_reason`, `usage`）にはならない

### 影響

- `openai_wire_api = "responses"` の全非ストリーミングリクエストが空レスポンスを返す
- ストリーミングパスは別実装（`transform_responses_stream_to_anthropic()`）で正しく動作しており修正不要
- `openai_wire_api = "chat_completions"` は `openai_response_to_anthropic_message()` で正常動作

## Scope

1. `response_transforms.rs` に `responses_response_to_anthropic()` 関数を追加（約140行）
2. `response_transforms.rs` に内部ヘルパー `map_responses_status_to_anthropic_stop_reason()` を追加
3. Responses API レスポンスのパース用構造体 `ResponsesResponseBody`, `ResponsesOutputItem` 等を定義
4. `transform/mod.rs` の re-export に `responses_response_to_anthropic` を追加（※本チケットでは関数実装のみ。re-exportはP7-2）

### 関数シグネチャ

```rust
pub fn responses_response_to_anthropic(
    req: &TransformRequest,
) -> Result<TransformResponse, TransformError>;
```

### 処理ロジック（7 Step）

**Step 1: ヘッダー処理** — `authorization: Bearer <token>` → `x-api-key` 変換、`content-type: application/json`

**Step 2: ID と model** — `id` がなければ `"msg_proxy_{timestamp}"`、`model` がなければ `"unknown"`

**Step 3: `output[]` → `content[]` マッピング**
| Responses `output[].type` | Anthropic `content[]` ブロック |
|---|---|
| `"message"` | `type: "text"` ブロック（output_text の text 抽出、role は "assistant" 固定）|
| `"reasoning"` | `type: "thinking"` ブロック（content が空でなければ、signature は `SYNTHETIC_THINKING_SIGNATURE`）|
| `"function_call"` | `type: "tool_use"` ブロック（call_id→id, name→name, arguments→input）|
| `"function_call_output"` | スキップ（リクエスト側入力でありレスポンスに含まれない）|
| `"computer_call"` 等 | スキップ（`tracing::debug` で lossy downgrade 記録）|

**Step 4: `status` → `stop_reason` マッピング**
| status | incomplete_details.reason | Anthropic stop_reason |
|---|---|---|
| `"completed"` | — | `"end_turn"` |
| `"incomplete"` | `"max_output_tokens"` | `"max_tokens"` |
| `"incomplete"` | `"content_filter"` | `"content_filter"` |
| `"incomplete"` | その他/不明 | `"max_tokens"` |
| `"failed"` | — | None（エラー扱い）|

**Step 5: `usage` マッピング** — `input_tokens` / `output_tokens` を直接マッピング。`cache_read_input_tokens` は Responses の `input_tokens_details.cached_tokens` から。`cache_creation_input_tokens` は常に 0。

**Step 6: Anthropic レスポンス JSON 構築** — `openai_response_to_anthropic_message()` と同一構造

**Step 7: 変換経路記録** — `conversion_trail: vec![ApiFormat::OpenaiResponses, ApiFormat::AnthropicMessages]`

## Non-scope

- ストリーミングパスの修正（P8-1 スコープ外、別実装で動作中）
- `translate.rs` の呼び出し差し替え（P8-1 で対応）
- `mod.rs` の re-export 追加（P7-2 で対応）
- 既存 `responses_to_anthropic()` 関数の削除（引き続きリクエスト変換として有効）
- テスト追加（P9-1 で対応）
- 全体的なリファクタリング

## Investigation

### ソースコード調査結果

#### 現状の誤った呼び出しパス

```text
translate.rs: handle_translate()
  → translate_non_stream()
    → anthropic_to_openai_responses()        # OK: Request→Responses Request
    → upstream POST /v1/responses            # OK: OpenAI 正常応答
    → responses_to_anthropic(&response_req)  # BUG: 行414
      → openai_to_anthropic()               # さらに誤り: Request→Request
```

**証拠**:
- `anthropx/src/provider/translate.rs` L410-419 — `LlmApiFormat::OpenaiResponses => responses_to_anthropic(&response_req)` の誤った呼び出し
- `llm-bridge-core/transform/responses_to_anthropic.rs` L89-95 — `parse_openai_responses_request_body()` が REQUEST スキーマでパース
- 実際の Responses API レスポンス形式は `{id, object, status, output[], usage}` であり、REQUEST スキーマ（`{model, input, instructions, ...}`）と非互換

#### 正しい実装パターン（参照）

| パターン | 場所 | 行 |
|---|---|---|
| `openai_response_to_anthropic_message()` | `response_transforms.rs` | L357-473 |
| `anthropic_response_to_responses_response()` | `response_transforms.rs` | L259-343 |
| `responses_content_to_text()` | `responses_to_anthropic.rs` | L581-595 |
| `response_content_part_to_text()` | `responses_to_anthropic.rs` | L597-606 |
| `SYNTHETIC_THINKING_SIGNATURE` | `shared.rs` | — |

### 参照ファイル

| ファイル | 役割 |
|---|---|
| `crates/core/src/transform/response_transforms.rs` | **実装対象**: 新関数追加 |
| `crates/core/src/transform/responses_to_anthropic.rs` | 再利用可能ヘルパー |
| `crates/core/src/transform/anthropic_to_responses.rs` | 逆方向パターン参照 |
| `crates/core/src/transform/mod.rs` | re-export（P7-2） |
| `crates/core/src/transform/shared.rs` | SYNTHETIC_THINKING_SIGNATURE |
| `crates/core/src/model.rs` | ApiFormat, TransformRequest, TransformError 等 |
| `fixtures/protocol-transform/responses-to-anthropic/` | 既存 fixture（ストリーミング用） |
| `anthropx/src/provider/translate.rs` | 呼び出し元（P8-1） |

### 実装のポイント

- `openai_response_to_anthropic_message()` と同じ「レスポンス→レスポンス」パターンに従う
- Responses API の `output[]` 配列は要素順序が保証される（reasoning → message → function_call の順）
- `responses_content_to_text()` と `response_content_part_to_text()` は `responses_to_anthropic.rs` の pub(crate) 関数として既存。`response_transforms.rs` からの呼び出しには再公開または移動が必要（P7-2/P9-1 との調整）
- `#[serde(deny_unknown_fields)]` を使用してサイレント無視を防止
- Responses API の `function_call.arguments` は JSON 文字列として渡され、Anthropic `tool_use.input` は JSON オブジェクトとして設定する

## Test Plan

### ユニットテスト計画

**対象関数**: `responses_response_to_anthropic()`, `map_responses_status_to_anthropic_stop_reason()`

**テストケース**:

| 番号 | 分類 | ケース名 | 内容 |
|---|---|---|---|
| 1 | 正常系 | basic_text_response | 基本的な Responses レスポンス（reasoning + message + output_text）→ Anthropic レスポンス変換 |
| 2 | 正常系 | function_call_in_output | function_call を含むレスポンス → tool_use ブロック変換 |
| 3 | 正常系 | multiple_function_calls | 複数の function_call → 複数の tool_use ブロック |
| 4 | 異常系 | status_failed | status=failed のレスポンス → エラー Return |
| 5 | 境界値 | empty_output | output が空配列 → 空 content のレスポンス |
| 6 | 境界値 | incomplete_max_output_tokens | status=incomplete + reason=max_output_tokens → stop_reason= max_tokens |
| 7 | 境界値 | incomplete_content_filter | status=incomplete + reason=content_filter → stop_reason= content_filter |
| 8 | 境界値 | no_reasoning_block | reasoning ブロックがない場合 → thinking ブロックなし |
| 9 | 境界値 | missing_fields | id/model/usage 欠落 → デフォルト値補完 |
| 10 | 異常系 | invalid_json_body | JSON としてパース不可能な body → InvalidFormat エラー |
| 11 | 異常系 | missing_model_name | model フィールドが空 → デフォルト値補完（エラーにはしない） |
| 12 | 正常系 | usage_with_cached_tokens | input_tokens_details.cached_tokens → cache_read_input_tokens マッピング |
| 13 | 正常系 | status_completed_no_stop_sequence | completed 時の stop_sequence が null であること |
| 14 | 正常系 | header_bearer_token | authorization: Bearer → x-api-key 変換 |

**使用パターン**: `openai_response_to_anthropic_message()` のテストパターン（tests.rs L839-現在）を参考に、`TransformRequest` 構築 → 関数呼び出し → `TransformResponse` の各フィールド検証

**カバレッジ目標**: 95%（クリティカルパス）

### ユニットテスト不可能な項目（例外）

なし。純粋関数であるため全てユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

### 新規コードの翻訳可能性方針

1. **関数名**: `responses_response_to_anthropic` は「Responses レスポンスを Anthropic 形式に変換する」と読める動詞句
2. **内部ヘルパー分割**: レスポンスパース、content ブロック構築、stop_reason マッピング、usage マッピングをそれぞれ独立した関数に分割
3. **ハードコード値の定数化**: デフォルトモデル名 `"unknown"`、デフォルトIDプレフィックス `"msg_proxy_"` 等を名前付き定数として `response_transforms.rs` 先頭に定義
4. **翻訳可能性の観点**:
   - 関数本体はコメントなしで「Step 1: ヘッダー処理 → Step 2: ID/model → Step 3: output マッピング → ...」と読めること
   - match 式の各 arm が「この Response type の場合は〜する」と日本語に逐語訳できること
   - 中間変数名は `output_items`, `content_blocks`, `responses_usage` 等ドメイン概念を表現すること

### 既存コードの改善範囲

- 本チケットのスコープ外だが、`responses_to_anthropic.rs` の `parse_openai_responses_request_body()` に `#[serde(deny_unknown_fields)]` を付与することで同種のバグを予防できる。P7-1 の実装時に新規パース構造体では必ず付与する。
- fixture ファイルは `fixtures/protocol-transform/responses-to-anthropic/` にレスポンス用（非ストリーム）fixture を追加する余地がある。P9-1 で検討。

## Acceptance Criteria

- [x] `responses_response_to_anthropic()` が `response_transforms.rs` に実装されている
- [x] Responses API の全 output item type（message, reasoning, function_call, function_call_output, computer_call 等）が正しくマッピングされる
- [x] status → stop_reason マッピングが全ケース（completed, incomplete, failed, 未知）をカバーしている
- [x] usage マッピングが正しく（cache_read, cache_creation 含む）
- [x] 変換経路（conversion_trail）が正しく `[OpenaiResponses, AnthropicMessages]` に設定される
- [x] 空 output, フィールド欠落等の境界ケースでパニックせずエラーまたは妥当なデフォルト値で動作する
- [x] `openai_response_to_anthropic_message()` と同一の Anthropic レスポンス構造を生成する
- [x] 翻訳可能性の検証が通っている

## Notes

### 依存関係

| チケット | 関係 | 内容 |
|---|---|---|
| P7-2 | 後続 | 本関数の `mod.rs` re-export 追加 |
| P8-1 | 後続 | translate.rs 呼び出し差し替え |
| P9-1 | 後続 | テスト追加 |
| RFC-X-001-CORE | 親 | parentOmissionId |

### 実装上の注意

- `response_transforms.rs` は `#![allow(clippy::too_many_lines)]` が付与されているため、clippy pedantic の large_enum_variant / many_lines 警告を抑制する必要はない
- `responses_content_to_text()` と `response_content_part_to_text()` は `responses_to_anthropic.rs` で `pub(crate)` として宣言されており、`response_transforms.rs` からは同一クレート内なので直接呼び出し可能
- ただし現状これらの関数は別モジュールにあり、`response_transforms.rs` で `use super::responses_to_anthropic::...` する必要がある。モジュール間の循環依存に注意

### 成果物の保存先

- **計画**: scope[], testVerification[], testExceptions[], notes フィールド
- **実装サマリ**: changes[], notes フィールド
- **レビュー報告書**: instrumentation, notes, rfcDiscrepancies[] フィールド
