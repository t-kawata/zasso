---
merge-history: []
---

# RFC-X-001: OpenAI Responses API レスポンス逆変換パスの実装

**Status:** Proposed  
**Date:** 2026-07-02  
**Version:** 1.0  
**Parent RFC:** RFC-ROOT.md

---

## Abstract

anthropx の translate mode で `openai_wire_api = "responses"` を指定した場合、OpenAI Responses API からの非ストリーミングレスポンスが正しく Anthropic Messages 形式に逆変換されないバグを修正する。原因は `responses_to_anthropic()` が Responses API の **リクエスト→リクエスト** 変換関数であり、**レスポンス→レスポンス** 変換に使用できないことにある。本 RFC は欠落している `responses_response_to_anthropic()` 関数の設計と実装計画を定義する。

---

## Motivation

### 背景

anthropx の translate mode は3段階のパイプラインで構成される：

1. **リクエスト変換**: Anthropic Messages リクエスト → upstream 形式（Chat Completions / Responses）
2. **上流送信**: 変換後のリクエストを upstream API に送信
3. **レスポンス逆変換**: upstream のレスポンス → Anthropic Messages レスポンス

Chat Completions パスでは `anthropic_to_openai()`（リクエスト変換）+ `openai_response_to_anthropic_message()`（レスポンス逆変換）の正しい対称ペアが存在する。

Responses パスでは `anthropic_to_openai_responses()`（リクエスト変換）は正しく実装されているが、レスポンス逆変換に誤って `responses_to_anthropic()`（リクエスト→リクエスト変換）が使われている。

### 問題の現象

```bash
# anthropx 経由（translate + responses）— 空レスポンス
curl http://localhost:8888/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5.1-codex-mini",
    "messages": [{"role": "user", "content": "日本語は話せますか？"}]
  }'
# → {"messages":[],"model":"gpt-5.1-codex-mini","temperature":1.0,"tool_choice":{"type":"auto"}}
```

### 影響

- `openai_wire_api = "responses"` の全非ストリーミングリクエストが使用不可能
- ストリーミングパスは別の専用実装（`transform_responses_stream_to_anthropic`）により正しく動作
- `openai_wire_api = "chat_completions"` の全リクエストは正常動作

---

## Root Cause Analysis

### 呼び出し関係

```
translate.rs: handle_translate()
  → translate_non_stream()
    → anthropic_to_openai_responses()      # OK: Request→Responses Request
    → upstream POST /v1/responses           # OK: OpenAI 正常応答
    → responses_to_anthropic(&response_req) # BUG: ここが誤り
      → openai_to_anthropic()              # さらに誤り: Request→Request
```

### 3段階のエラー連鎖

| 段階 | ファイル | 行 | 問題 |
|------|----------|----|------|
| ① 呼び出し | `anthropx/translate.rs` | 414 | upstream の **レスポンス** を `TransformRequest` に包んで `responses_to_anthropic()` に渡している |
| ② パース | `llm-bridge-core/responses_to_anthropic.rs` | 89-95 | `parse_openai_responses_request_body()` が REQUEST スキーマ (`{model, input, instructions, ...}`) で JSON を解釈する。実際のレスポンスは `{id, object, status, output[], usage}` 形式。**`#[serde(deny_unknown_fields)]` がないため**、未知フィールド (`id`, `object`, `output`, `usage`) はサイレント無視。`input` は `None` で成功する |
| ③ 逆変換 | `llm-bridge-core/responses_to_anthropic.rs` | 156-168 | `input = None` → 空メッセージ `[]` → 合成 Chat Completions REQUEST `{messages: [], model: ...}`。最終段で `openai_to_anthropic()` を呼び **Anthropic REQUEST 形式** を生成。本来要求される Anthropic RESPONSE 形式（`id`, `type: "message"`, `role`, `content`, `stop_reason`, `usage` を含む）にはならない |

### 結果の構造比較

```text
誤出力（現在）:                          正しい出力（あるべき姿）:
{                                        {
  "messages": [],    ← Anthropic REQUEST    "id": "msg_proxy_...",
  "model": "...",                           "type": "message",
  "temperature": 1.0,                       "role": "assistant",
  "tool_choice": {"type": "auto"}           "model": "...",
}                                           "content": [
                                              {"type": "text", "text": "..."}
                                            ],
                                            "stop_reason": "end_turn",
                                            "stop_sequence": null,
                                            "usage": {
                                              "input_tokens": ...,
                                              "output_tokens": ...
                                            }
                                          }
```

### なぜ Chat Completions は動くのか

| パス | リクエスト変換 | レスポンス逆変換 | 結果 |
|------|---------------|-----------------|------|
| Chat Completions | `anthropic_to_openai()` | `openai_response_to_anthropic_message()` ✅ | 正常 |
| Responses | `anthropic_to_openai_responses()` ✅ | `responses_to_anthropic()` ❌ | 空レスポンス |

Chat Completions では Chat API のレスポンス形式（`choices[].message`）を直接パースする `openai_response_to_anthropic_message()` が存在する。Responses API には同等の関数が存在しない。

### ストリーミングパスが正常な理由

ストリーミングパスは別の専用実装パスを通る：

```
translate_stream()
  → anthropic_to_openai_responses()  # Request→Responses Request
  → upstream SSE stream
  → transform_chunk()
    → transform_stream_events()
      → transform_responses_stream_to_anthropic()  # Responses SSE→Anthropic SSE (正しい専用実装)
```

`transform_responses_stream_to_anthropic()`（`responses_to_anthropic_stream.rs`）は Responses SSE イベント（`response.created`, `response.output_item.added`, `response.output_text.delta`, `response.completed` 等）を Anthropic SSE イベントにマッピングする完全な実装を持っている。したがって **ストリーミングは修正不要**。

---

## Design

### D-1: 新関数 `responses_response_to_anthropic()` の追加

`llm-bridge-core` の `response_transforms.rs` に以下の新関数を追加する。

#### 関数シグネチャ

```rust
/// OpenAI Responses API レスポンスを Anthropic Messages レスポンスに変換する。
///
/// upstream から返された Responses API の非ストリーミングレスポンスボディ
/// （`output[]` 配列を含む）を解析し、Anthropic Messages 形式のレスポンス
/// （`id`, `type`, `role`, `content[]`, `stop_reason`, `usage` を含む）に
/// マッピングする。
///
/// # Errors
///
/// Returns `TransformError::InvalidFormat` if the response body cannot be parsed
/// or if required output item fields are missing.
pub fn responses_response_to_anthropic(
    req: &TransformRequest,
) -> Result<TransformResponse, TransformError>;
```

#### 入力と出力の構造対応

```text
Responses API RESPONSE                         Anthropic Messages RESPONSE
{                                               {
  "id": "resp_0115afc...",                        "id": "resp_0115afc...",
  "status": "completed",                          "type": "message",
  "model": "gpt-5.1-codex-mini",                  "role": "assistant",
  "output": [                                     "model": "gpt-5.1-codex-mini",
    {                                             "content": [
      "type": "reasoning",                  ────►   {
    },                                      optional  "type": "thinking",
    {                                                 "thinking": "...",
      "type": "message",                              "signature": "..."
      "role": "assistant",                    },    },
      "content": [                            ──►   {
        {"type": "output_text",                       "type": "text",
         "text": "はい、..."}                         "text": "はい、..."
      ]                                               }
    },                                            ],
    {                                               "stop_reason": "end_turn",
      "type": "function_call",              ──►     "stop_sequence": null,
      "call_id": "call_123",                        "usage": {
      "name": "get_weather",                          "input_tokens": 14,
      "arguments": "{\"loc\":\"NYC\"}"  ──►           "output_tokens": 48,
    }                             tool_use            ...
  ],                                                }
  "usage": {                                      }
    "input_tokens": 14,
    "output_tokens": 48,
    ...
  }
}
```

#### 処理ロジック詳細

**Step 1: ヘッダー処理**

`req.headers` から `authorization: Bearer <token>` を抽出し `x-api-key` に変換。`content-type: application/json` を設定。

**Step 2: ID と model**

- `id`: Responses の `id` をそのまま使用。なければ `"msg_proxy_{timestamp}"` を生成
- `model`: Responses の `model` を使用。なければ `"unknown"`

**Step 3: `output[]` → `content[]` マッピング**

`output` 配列の各 item を以下のルールで変換：

| Responses `output[].type` | Anthropic `content[]` ブロック | 補足 |
|---|---|---|
| `"message"` | `type: "text"` ブロック | `role` は `"assistant"` に固定。content 内の `output_text` の text を抽出 |
| `"reasoning"` | `type: "thinking"` ブロック（content が空でなければ）| summary または content からテキスト抽出。`signature` は `SYNTHETIC_THINKING_SIGNATURE` を使用 |
| `"function_call"` | `type: "tool_use"` ブロック | `call_id` → `id`, `name` → `name`, `arguments`（JSON文字列） → パースして `input` に設定 |
| `"function_call_output"` | スキップ | tool_result はリクエスト側の入力であり、レスポンスには出現しない |
| `"computer_call"`, `"browser_call"` 等 | スキップ（`tracing::debug` で lossy downgrade を記録） | Codex 固有の拡張 |

**Step 4: `status` → `stop_reason` マッピング**

```rust
fn map_responses_status_to_anthropic_stop_reason(
    status: &str,
    incomplete_details: Option<&serde_json::Value>,
) -> Option<&'static str> {
    match status {
        "completed" => Some("end_turn"),
        "incomplete" => {
            // incomplete_details から reason を抽出
            match reason {
                Some("max_output_tokens") => Some("max_tokens"),
                Some("content_filter") => Some("content_filter"),
                _ => Some("max_tokens"),  // 未知の理由は安全側に倒す
            }
        }
        "failed" => None,  // エラーレスポンスは upstream エラーとして扱う
        _ => Some("end_turn"),
    }
}
```

逆方向（`anthropic_stop_reason_to_responses_status`）は `response_transforms.rs` に**既存**（L857-873）。

**Step 5: `usage` マッピング**

```text
Responses usage                          Anthropic usage
{                                        {
  "input_tokens": 14,             ────►    "input_tokens": 14,
  "output_tokens": 48,                     "output_tokens": 48,
  "input_tokens_details": {                "cache_read_input_tokens": N,
    "cached_tokens": N                     "cache_creation_input_tokens": 0
  },                                     }
  "output_tokens_details": {
    "reasoning_tokens": R               注: reasoning_tokens は
  }                                     cache_creation_input_tokens に
}                                        マッピングせず常に 0
```

**Step 6: Anthropic レスポンス JSON 構築**

`openai_response_to_anthropic_message()` の出力形式（`response_transforms.rs` L442-461）と同一の構造を生成：

```json
{
  "id": "...",
  "type": "message",
  "role": "assistant",
  "model": "...",
  "content": [...],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": ...,
    "output_tokens": ...,
    "cache_read_input_tokens": ...,
    "cache_creation_input_tokens": 0
  }
}
```

**Step 7: 変換経路記録**

```rust
conversion_trail: vec![ApiFormat::OpenaiResponses, ApiFormat::AnthropicMessages],
```

#### 実装パターン参照

既存の実装パターンとして以下を参考にする：

- `openai_response_to_anthropic_message()`（`response_transforms.rs` L357-473）— 全く同じ「レスポンス→レスポンス」パターン
- `anthropic_response_to_responses_response()`（`response_transforms.rs` L259-343）— 逆方向の「output 配列構築」ロジック（実装の参考にはなるが直接は再利用しない）

#### 再利用可能な既存ヘルパー

| ヘルパー | 場所 | 利用方法 |
|----------|------|---------|
| `responses_content_to_text()` | `responses_to_anthropic.rs` L581 | Responses content ブロックからテキスト抽出 | 
| `response_content_part_to_text()` | `responses_to_anthropic.rs` L597 | content パートテキスト抽出 |
| `SYNTHETIC_THINKING_SIGNATURE` | `shared.rs` | thinking ブロックの署名 |

### D-2: `mod.rs` re-export 追加

`llm-bridge-core/crates/core/src/transform/mod.rs` の `response_transforms` re-export ブロックに追加：

```rust
pub use response_transforms::{
    anthropic_response_to_openai_response, anthropic_response_to_responses_response,
    openai_response_to_anthropic_message,
    responses_response_to_anthropic,  // ← 追加
};
```

### D-3: `translate.rs` 呼び出し差し替え

`anthropx/src/provider/translate.rs` の逆変換分岐（L410-419）を修正：

```rust
// 現状（L414）:
LlmApiFormat::OpenaiResponses => responses_to_anthropic(&response_req),

// 修正後:
LlmApiFormat::OpenaiResponses => responses_response_to_anthropic(&response_req),
```

合わせて import に追加：

```rust
// llm_bridge_core::transform::{
//     anthropic_to_openai, anthropic_to_openai_responses, openai_response_to_anthropic_message,
//     responses_response_to_anthropic,  // ← 追加（responses_to_anthropic は削除しなくてもよい）
// };
```

**注記**: `responses_to_anthropic` は Responses リクエスト→Anthropic リクエスト変換として引き続き有効であり、import から削除する必要はない。ただしこの関数はレスポンス変換にはもう使われなくなる。

### D-4: テストレスポンスボディ

テスト用の Responses API レスポンスボディ（ユーザーの実際の curl 結果から）：

```json
{
  "id": "resp_0115aedfc4f97d40...",
  "object": "response",
  "created_at": 1782958969,
  "status": "completed",
  "model": "gpt-5.1-codex-mini",
  "output": [
    {
      "id": "rs_0115aedfc4f97d40...",
      "type": "reasoning",
      "content": [],
      "summary": []
    },
    {
      "id": "msg_0115aedfc4f97d40...",
      "type": "message",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "はい、日本語でお手伝いできますよ。",
          "annotations": []
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 14,
    "output_tokens": 48,
    "total_tokens": 62
  }
}
```

#### テストカバレッジ

| # | テストケース | 内容 |
|---|-------------|------|
| 1 | 基本レスポンス | 上記のJSONを入力として正しいAnthropicレスポンスを生成する |
| 2 | thinking 欠落 | reasoning ブロックがない場合の動作確認 |
| 3 | tool_use 含む | function_call ブロックを含むレスポンスの変換確認 |
| 4 | 空出力 | output が空配列の場合の動作確認 |
| 5 | エラーレスポンス | status="failed" の場合の動作確認 |
| 6 | incomplete + max_output_tokens | status="incomplete" で reason が max_output_tokens の場合の stop_reason 確認 |
| 7 | 無効 JSON | パースエラーの確認 |
| 8 | usage 欠落 | usage フィールドがない場合のデフォルト値確認 |

### D-5: 変更しないもの

以下のコンポーネントは変更しない（確認済みで正常動作）：

| コンポーネント | 理由 |
|--------------|------|
| `anthropic_to_openai_responses()` | リクエスト変換は正しい |
| `responses_to_anthropic()` | リクエスト→リクエスト変換として引き続き有効 |
| `transform_responses_stream_to_anthropic()` | ストリーミングは正しい専用実装を持つ |
| `translate_stream()` | ストリーミングパス全体 |
| URL 構築ロジック（translate.rs L355-360） | `base_url.trim_end_matches("/v1") + openai_req.path` で正しい |
| `anthropx/Cargo.toml` | llm-bridge-core の依存バージョン変更不要（インターフェース互換） |

---

## Implementation Plan

### Layer 1: llm-bridge-core 修正（依存ライブラリ側）

| # | ファイル | 変更内容 | 見積もり行数 |
|---|----------|---------|------------|
| P1 | `.../transform/response_transforms.rs` | `responses_response_to_anthropic()` 追加、`map_responses_status_to_anthropic_stop_reason()` 追加 | ~140行 |
| P2 | `.../transform/mod.rs` | re-export に追加 | 1行 |
| P3 | `.../transform/tests.rs` | Responses レスポンス→Anthropic レスポンスのテスト追加 | ~120行 |

### Layer 2: anthropx 修正（利用側）

| # | ファイル | 変更内容 | 見積もり行数 |
|---|----------|---------|------------|
| Q1 | `src/provider/translate.rs` | import + 分岐差し替え | 2行 |

### 推定作業規模

- 新規コード: ~140行（主要実装）+ ~120行（テスト）= ~260行
- 修正する既存コード: 3行（mod.rs + translate.rs）
- 全テスト（201件）が引き続きパスすること

### 危険度評価

| リスク | レベル | 対策 |
|--------|--------|------|
| Responses API 形式の将来変更への脆弱性 | Low | 未知フィールドは serde(default) + deny_unknown_fields なしで安全に無視 |
| 既存のストリーミングパスへの影響 | None | 別コードパスのため影響なし |
| chat_completions パスへの影響 | None | 分岐が異なるため影響なし |
| llm-bridge-core の public API 後方互換性 | Low | 新関数追加のみ。既存関数の変更なし |

### 動作検証手順

```bash
# 1. llm-bridge-core のテスト
cd crates/llm-bridge-rust-v0.5.0 && cargo test

# 2. anthropx のコンパイル確認
cd crates/anthropx && cargo check --features server

# 3. anthropx のテスト
cd crates/anthropx && cargo test --lib

# 4. 実際の動作確認（translate + responses）
RUST_LOG=debug ./target/release/anthropx -c settings.toml
# 別ターミナル:
curl -s http://localhost:8888/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5.1-codex-mini",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }' | jq
# 期待: {"id": "resp_...", "type": "message", "content": [{"type": "text", "text": "..."}], ...}
```

---

## References

- `RFC-ROOT.md` — 親RFC、全体アーキテクチャ定義
- `OMISSIONS-001.md` — 前回の実装漏れ是正チケット
- `anthropx/src/provider/translate.rs` — translate エントリポイント（修正対象）
- `llm-bridge-rust-v0.5.0/crates/core/src/transform/response_transforms.rs` — 新関数追加先
- `llm-bridge-rust-v0.5.0/crates/core/src/transform/mod.rs` — re-export（修正対象）
- `llm-bridge-rust-v0.5.0/crates/core/src/transform/responses_to_anthropic.rs` — 再利用ヘルパー
- `llm-bridge-rust-v0.5.0/crates/core/src/stream/responses_to_anthropic_stream.rs` — ストリーミング参考実装
- `llm-bridge-rust-v0.5.0/crates/core/src/transform/tests.rs` — テスト（追加対象）
