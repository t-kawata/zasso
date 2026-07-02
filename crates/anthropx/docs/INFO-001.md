OpenAI Responses API の非ストリーミングレスポンスは、トップレベルで 20 以上のフィールドを持つ `Response` オブジェクトで、`background` や `billing` なども含めてかなりリッチな構造になっています。 現時点で公式が完全な JSON Schema を公開していないため、「完全に網羅したスキーマ」は推定を含みますが、公式リファレンスの例・テキストと周辺情報から、実務的に十分な型定義とパース戦略を組み立てる形になります。 [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)

以下では:

- 非ストリーミング `Response` オブジェクトのトップレベルフィールドと型
- `output[]` 内 item の主要バリアント構造
- `usage` / `status` / `incomplete_details` / `background` / `billing` などの振る舞い
- Codex 系モデルとの違い
- Rust/serde 前提の推奨パース戦略

を整理し、最後に TypeScript 近似のスキーマと Rust 向けの構造体案をファイル出力用として提示します。

***

## トップレベル Response オブジェクト

公式の `Create a model response` ドキュメントには、非ストリーミングの `Response` オブジェクト例が記載されています。 そこから確認できるフィールド（＋他ページで明示されるフィールド）を列挙すると、少なくとも次のようになります。 [developers.openai](https://developers.openai.com/api/docs/guides/migrate-to-responses)

- `id`: string（必須）  
- `object`: string（常に `"response"`）  
- `created_at`: number（UNIX 秒タイムスタンプ）  
- `status`: string（例: `"completed"`, `"in_progress"`, `"failed"`, `"cancelled"` など） [core42](https://www.core42.ai/compass/documentation/response-api-reference)
- `completed_at`: number | null（完了時刻。`status` が完了系でない場合 null） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `error`: object | null（標準的な OpenAI エラーオブジェクト） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `incomplete_details`: object | null（中断理由など） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `instructions`: string | null（レスポンス時点での system/dev message） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `max_output_tokens`: number | null（レスポンス側に反映された上限） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `model`: string（使用モデル ID。例: `"gpt-5.4"`） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)
- `output`: array of ResponseItem（下記） [developers.openai](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- `parallel_tool_calls`: boolean（並列ツール呼び出し許可） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)
- `previous_response_id`: string | null（前回レスポンス ID） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `reasoning`: object（`{ effort: string | null, summary: string | null, ... }`） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `store`: boolean（レスポンスを保存するか） [developers.openai](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- `temperature`: number（0–2） [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)
- `text`: object（`{ format: { type: "text" | "json_schema" | ... }, verbosity?: ... }`） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `tool_choice`: string またはオブジェクト（`"auto"`, `"none"`, 指定ツールなど） [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)
- `tools`: array（内訳は built-in / MCP / function 等の union） [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)
- `top_p`: number（0–1） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)
- `top_logprobs`: number | null（最大 N 個の logprobs 要求時） [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)  
- `truncation`: string（`"auto"` または `"disabled"`。deprecated） [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)
- `usage`: object（下記） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)
- `user`: string | null（deprecated。`safety_identifier` / `prompt_cache_key` への移行） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `metadata`: object（任意の key-value） [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)
- `background`: boolean（バックグラウンド実行フラグ） [community.openai](https://community.openai.com/t/all-background-tasks-on-responses-api-producing-completely-empty-output-array-across-all-prompts/1358411)
- `billing`: object | null（課金関連情報。コミュニティで追加が報告されている） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `service_tier`: string（`"auto"`, `"default"`, `"flex"`, `"priority"` 等） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)
- `prompt_cache_key`: string | null（プロンプトキャッシュ用 key） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `prompt_cache_retention`: `"in_memory"` | `"24h"` | null（プロンプトキャッシュ保持ポリシー） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  
- `safety_identifier`: string | null（ユーザ識別用ハッシュ） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)  

`background` / `billing` は公式の “body parameters” やコミュニティディスカッションから存在が確認されており、Responses API 専用の追加フィールドになっています。 [docs.langflow](https://docs.langflow.org/api-openai-responses)

***

## output 配列内の item type

Responses API では `output` は “Items labeled output” とされており、各 item は `type` によって variant が分かれる union 構造です。 [datacamp](https://www.datacamp.com/tutorial/openai-responses-api)

代表的なバリアント（非ストリーミング / text中心の場合）:

### message item

例は公式サンプルに記載されています。 [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)

```json
{
  "type": "message",
  "id": "msg_...",
  "status": "completed",
  "role": "assistant",
  "content": [
    {
      "type": "output_text",
      "text": "In a peaceful grove ...",
      "annotations": []
    }
  ]
}
```

- `type`: `"message"`  
- `id`: string  
- `status`: string（`"completed"` 等）  
- `role`: `"assistant" | "user" | "system"`（通常 output 側は `"assistant"`）  
- `content`: array of content blocks  
  - `type`: `"output_text"`（ほか、input 系では `"input_text"`, `"input_image"` 等） [datacamp](https://www.datacamp.com/tutorial/openai-responses-api)
  - `text`: string（または structured output の JSON string） [hexdocs](https://hexdocs.pm/openai_responses/0.3.2/structured_output.html)
  - `annotations`: array（ハイライトやメタ情報）

### reasoning item

ドキュメント的には “reasoning item outputs” として扱われ、`include` に `reasoning.encrypted_content` を指定すると暗号化版が出てくることが示唆されています。 [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)

構造は完全には公開されていませんが、少なくとも:

- `type`: `"reasoning"`  
- `id`: string  
- `status`: string  
- `content`: array（`{ type: "reasoning_output" | "reasoning_content" | ... }` のようなサブタイプ）  
- `encrypted_content`: string | null（`include` の設定に応じて付与） [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)  

### tool call 系 item

Responses は built‑in tool / MCP / function calling を統合しているため、以下のような item 型が存在すると明示されています。 [datacamp](https://www.datacamp.com/tutorial/openai-responses-api)

- `type: "tool_call"` / `"code_interpreter_call"` / `"file_search_call"` / `"web_search_call"` / `"computer_call"` など  
  - それぞれ `tool` / `name` / `arguments` / `outputs` 等を持つ  
  - 例えば `web_search_call` は `action` 以下に `sources` を含み得る（`include` で制御） [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)
  - `code_interpreter_call` は `outputs` にファイル生成結果や stdout 等を持つ [datacamp](https://www.datacamp.com/tutorial/openai-responses-api)

`function_call` / `function_call_output` に相当するものは、「custom tools」として function calling を統合しており、項目としては `tool_call` の一種という扱いになっています。 [datacamp](https://www.datacamp.com/tutorial/openai-responses-api)

### その他の potential variants

OpenAI 内部/SDK ドキュメントや他社互換実装（UCloud, gateway 等）で言及される type もあります。 [ucloud-global](https://www.ucloud-global.com/en/docs/modelverse/modelverse/text_api/response_api)

- `input_text`, `input_image`（入力 items）  
- `file_search_result` 等、中間 item  
- `message.input_image`, `message.output_text.logprobs` は `include` で出し分けるパスとして明記されている。 [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)

Rust 側では、まず “最低限必要な variant + catch-all” を定義し、未知の `type` に対しては汎用 `serde_json::Value` にフォールバックする設計が現実的です。

***

## usage オブジェクト

公式例から見えるフィールド: [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)

```json
"usage": {
  "input_tokens": 36,
  "input_tokens_details": {
    "cached_tokens": 0
  },
  "output_tokens": 87,
  "output_tokens_details": {
    "reasoning_tokens": 0
  },
  "total_tokens": 123
}
```

- `input_tokens`: number  
- `input_tokens_details`: object（少なくとも `cached_tokens`）  
- `output_tokens`: number  
- `output_tokens_details`: object（少なくとも `reasoning_tokens`）  
- `total_tokens`: number  

一部のドキュメントでは、追加の詳細フィールド（`audio_tokens`, `image_tokens` など）が今後追加され得る旨が示されているため、usage は「他フィールド追加を前提に拡張される」領域とみなすのが妥当です。 [learn.microsoft](https://learn.microsoft.com/en-us/answers/questions/5578889/azure-open-ai-responses-api-with-structured-output)

***

## status の取りうる値

Responses の status は、背景処理やキャンセル API と合わせて説明されています。 [community.openai](https://community.openai.com/t/all-background-tasks-on-responses-api-producing-completely-empty-output-array-across-all-prompts/1358411)

- 確認できる値:
  - `"completed"`（正常完了） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)
  - `"in_progress"`（非同期/背景処理中） [core42](https://www.core42.ai/compass/documentation/response-api-reference)
  - `"failed"`（エラー） [core42](https://www.core42.ai/compass/documentation/response-api-reference)
  - `"cancelled"`（`/responses/{id}/cancel` などでキャンセル） [core42](https://www.core42.ai/compass/documentation/response-api-reference)

Azure / 他プロバイダの互換実装も同様の値を採用しており、OpenAI 側もこのセットをベースに拡張していると考えられます。 [learn.microsoft](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)

***

## incomplete_details の構造

公式の例では常に `null` ですが、Streaming Events ドキュメントや Azure 側で、「タイムアウト・ユーザキャンセル・トークン上限超過」といった理由を `incomplete_details` に入れるパターンが言及されています。 [learn.microsoft](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)

一般的には:

```json
"incomplete_details": {
  "reason": "max_output_tokens",
  "error": {
    "code": "...",
    "message": "...",
    "type": "..."
  }
}
```

のように、少なくとも:

- `reason`: string（`"max_output_tokens"`, `"timeout"`, `"cancelled"` など）  
- `error`: object（標準エラーオブジェクトを内包）

を含むと考えられます。 ここも将来的な拡張余地があるため、厳密に型を固定するより `serde_json::Value` で保持する方が安全です。 [learn.microsoft](https://learn.microsoft.com/en-us/answers/questions/5578889/azure-open-ai-responses-api-with-structured-output)

***

## background フィールド

`background` は request body のパラメータとして公式に記載され、その値が Response オブジェクトにも含まれることが、API リファレンスや他プロバイダの互換実装から確認できます。 [docs.langflow](https://docs.langflow.org/api-openai-responses)

- 型: boolean  
- 役割:
  - リクエスト body で `background: true` の場合、レスポンスを非同期/背景処理として扱い、`/responses/{id}` でポーリングするワークフローを前提にする。 [core42](https://www.core42.ai/compass/documentation/response-api-reference)
  - このとき Response オブジェクトは `status: "in_progress"` で返りうる。 [community.openai](https://community.openai.com/t/all-background-tasks-on-responses-api-producing-completely-empty-output-array-across-all-prompts/1358411)

コミュニティの報告では、`background` フィールドが `Response` のトップレベルに追加され、古いスキーマでは `unknown field "background"` を引き起こしているケースが見られます。 [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)

***

## billing フィールド

公式ドキュメントではまだ明示されていませんが、OpenAI フォーラムで `billing` フィールドの追加が報告されており、Responses API の Response オブジェクトに含まれています。 [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)

- 型: object（nullable）  
- 用途:
  - レスポンスが無料枠/プロモーション/特定の billing プランに属するかを示す  
  - 「この応答は課金対象か？」を直接解釈するためのメタ情報（例: `free: true` / `plan: "promo"` など） [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)

正確なキー構造は公開されていないため、現時点では `serde_json::Value` で保持するのが妥当です。 [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)

***

## モデル差異（gpt-5.1-codex-mini 等）

Codex 系モデル（`gpt-5.1-codex-mini` 等）は Responses API を通じて提供され、`background` / `billing` / `reasoning` などのフィールドを同様に持つとされています。 [docs.aimlapi](https://docs.aimlapi.com/api-references/text-models-llm/openai/gpt-5-1-codex-mini)

- ドキュメント・周辺実装から見える点:
  - Codex 系でも `background` サポート（長時間コード実行や background job を想定） [docs.aimlapi](https://docs.aimlapi.com/api-references/text-models-llm/openai/gpt-5-1-codex-mini)
  - `billing` は Responses API レベルのフィールドであり、特定モデル専用ではない。 [docs.aimlapi](https://docs.aimlapi.com/api-references/text-models-llm/openai/gpt-5-1-codex-mini)
  - `reasoning` は `gpt‑5` / `o*` 系専用と明言されているが、Codex でも将来的に `reasoning` を持つ可能性あり。 [note](https://note.com/aicu/n/n100d5a47f56c)

現時点で「Codex 専用のトップレベルフィールド（`tool_usage` 等）」は公式には確認できておらず、ツール使用に関する情報は `output` 内の tool call item および `usage` を通じて提供される設計です。 [docs.aimlapi](https://docs.aimlapi.com/api-references/text-models-llm/openai/gpt-5-1-codex-mini)

***

## 安定性・互換性と serde 戦略

### 文書化されている “安定” フィールド

OpenAI の API リファレンスでは「後方互換性のポリシー」として、既存フィールドの削除/意味変更は慎重に行うとしつつ、新フィールドの追加については通知なしに行うことがあると明言しています。 [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)

Responses API は特に:

- `id`, `object`, `created_at`, `status`, `model`, `output`, `usage` といったコアフィールドは安定。 [developers.openai](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- `background`, `billing`, `prompt_cache_*`, `service_tier`, `reasoning` などは比較的新しいフィールドで、追加/形状変更の可能性が高い。 [developers.openai](https://developers.openai.com/api/docs/guides/migrate-to-responses)

### deny_unknown_fields vs default

OpenAI 自身や他プロバイダ（Azure, UCloud, gateway 等）の事例を見ても、Responses API は比較的頻繁にフィールド追加が行われていることが分かります。 [docs.getbifrost](https://docs.getbifrost.ai/providers/supported-providers/openai)

- `billing` のように「後から追加されたフィールド」によって既存クライアントが壊れている報告が既にある。 [community.openai](https://community.openai.com/t/responses-api-new-field-in-return-billing-answering-was-it-free/1362011)
- structured outputs の schema 互換性も「突然 stricter validation が有効になった」等のケースがあり、仕様の変化頻度は高い。 [hexdocs](https://hexdocs.pm/openai_responses/0.3.2/structured_output.html)

この前提から:

- トップレベル `Response` で `#[serde(deny_unknown_fields)]` を使うのは実務上かなり危険  
- 特に `ResponsesResponseBody` のような “中核” 型では、新フィールド追加で毎回 panic / error になる可能性が高い  

現実的な方針として:

1. **安定フィールドだけを別 struct に切り出して `deny_unknown_fields`**  
   - 例:  
     - `CoreResponse`（`id`, `status`, `model`, `output`, `usage`, `error` など）のみ  
     - それ以外は `extra: serde_json::Map<String, Value>` で受ける  
   - ただし serde でこれをやるには `#[serde(flatten)]` を使った “extra bag” を併用する必要がある。

2. **トップレベルは unknown を許容し、個別のサブオブジェクトでのみ `deny_unknown_fields`**  
   - 例えば `usage`, `reasoning`, `message` 等、構造が比較的安定しているサブ部分に対してのみ厳格にする。  
   - `ResponsesResponseBody` 自体には `deny_unknown_fields` を付けず、新フィールドは無視。

3. **観測ログから新フィールドを適宜追加しつつ、unknown はログだけ出して無視**  
   - 既存 unknown フィールドを `log::warn!` 等で可視化しつつ、実行を失敗させない。  
   - 本番運用では “破壊的変更がない限りは走り続ける” を優先。

OpenAI の互換性方針（特に “新しいフィールドの追加はいつでもあり得る”）を考えると、トップレベルに `deny_unknown_fields` を付けるのは推奨できません。 [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)

***

## Rust 向けの構造体案（ResponsesResponseBody の改訂）

あなたの現行定義:

```rust
struct ResponsesResponseBody {
    id: Option<String>,
    status: Option<String>,
    model: Option<String>,
    output: Option<Vec<serde_json::Value>>,
    usage: Option<ResponsesResponseUsage>,
    incomplete_details: Option<serde_json::Value>,
}
```

を、最低限互換性を確保しつつ拡張するとしたら、例えば:

```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize, Serialize)]
pub struct ResponsesResponseBody {
    pub id: String,
    pub object: Option<String>,
    pub created_at: Option<i64>,
    pub status: String,
    pub completed_at: Option<i64>,
    pub error: Option<Value>,
    pub incomplete_details: Option<Value>,
    pub instructions: Option<String>,
    pub max_output_tokens: Option<u32>,
    pub model: String,
    pub output: Vec<ResponseItem>,
    pub parallel_tool_calls: Option<bool>,
    pub previous_response_id: Option<String>,
    pub reasoning: Option<ResponseReasoning>,
    pub store: Option<bool>,
    pub temperature: Option<f32>,
    pub text: Option<ResponseTextConfig>,
    pub tool_choice: Option<Value>, // union が複雑なので一旦 Value
    pub tools: Option<Vec<Value>>,  // 同上
    pub top_p: Option<f32>,
    pub top_logprobs: Option<u32>,
    pub truncation: Option<String>,
    pub usage: Option<ResponsesResponseUsage>,
    pub user: Option<String>,
    pub metadata: Option<Value>,
    pub background: Option<bool>,
    pub billing: Option<Value>,
    pub service_tier: Option<String>,
    pub prompt_cache_key: Option<String>,
    pub prompt_cache_retention: Option<String>,
    pub safety_identifier: Option<String>,

    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ResponsesResponseUsage {
    pub input_tokens: Option<u64>,
    pub input_tokens_details: Option<Value>,
    pub output_tokens: Option<u64>,
    pub output_tokens_details: Option<Value>,
    pub total_tokens: Option<u64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ResponseItem {
    Message(ResponseMessageItem),
    Reasoning(ResponseReasoningItem),
    // 他ツール系は必要に応じて追加。
    #[serde(other)]
    Other(Value),
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ResponseMessageItem {
    pub id: Option<String>,
    pub status: Option<String>,
    pub role: Option<String>,
    pub content: Vec<MessageContent>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageContent {
    OutputText {
        text: String,
        annotations: Option<Vec<Value>>,
    },
    #[serde(other)]
    Other(Value),
}

// Reasoning / TextConfig も必要なら構造化。
#[derive(Debug, Deserialize, Serialize)]
pub struct ResponseReasoning {
    pub effort: Option<String>,
    pub summary: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ResponseTextConfig {
    pub format: Value,  // { type: "text" | "json_schema", ... }
    pub verbosity: Option<String>,
}
```

ポイント:

- **`background` と `billing` を明示的に追加**（型は `bool` / `Value`） [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)
- トップレベルに `#[serde(flatten)] extra` を持たせ、「未知フィールドを落とさずに保持」  
- `ResponseItem` を `tag = "type"` の enum にして `message` 等を型安全に扱いつつ、未知 type は `Other(Value)` に落とす  
- `deny_unknown_fields` は一切付けない（打鍵を抑えたいなら、サブタイプにだけ付ける）

***

## TypeScript 近似の JSON スキーマ例（ファイル出力用）

実際に “完全な JSON Schema” を OpenAI が公開していないため、以下は **現時点の公式例＋周辺ドキュメントから構成した近似スキーマ** になります。 [developers.openai](https://developers.openai.com/api/docs/guides/migrate-to-responses)

```ts
export interface Response {
  id: string;
  object: "response";
  created_at: number;
  status: "completed" | "in_progress" | "failed" | "cancelled" | string;
  completed_at: number | null;
  error: ResponseError | null;
  incomplete_details?: any | null;
  instructions?: string | null;
  max_output_tokens?: number | null;
  model: string;
  output: ResponseItem[];
  parallel_tool_calls?: boolean;
  previous_response_id?: string | null;
  reasoning?: ResponseReasoning | null;
  store?: boolean;
  temperature?: number;
  text?: ResponseTextConfig;
  tool_choice?: any;
  tools?: any[];
  top_p?: number;
  top_logprobs?: number;
  truncation?: "auto" | "disabled" | string;
  usage?: ResponseUsage;
  user?: string | null;
  metadata?: Record<string, any>;
  background?: boolean;
  billing?: any;
  service_tier?: "auto" | "default" | "flex" | "priority" | string;
  prompt_cache_key?: string | null;
  prompt_cache_retention?: "in_memory" | "24h" | string | null;
  safety_identifier?: string | null;
}

export interface ResponseUsage {
  input_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    [k: string]: any;
  };
  output_tokens: number;
  output_tokens_details?: {
    reasoning_tokens?: number;
    [k: string]: any;
  };
  total_tokens: number;
}

export type ResponseItem =
  | ResponseMessageItem
  | ResponseReasoningItem
  | ResponseToolCallItem
  | { type: string; [k: string]: any };

export interface ResponseMessageItem {
  type: "message";
  id: string;
  status: string;
  role: "assistant" | "user" | "system" | string;
  content: MessageContent[];
}

export type MessageContent =
  | {
      type: "output_text";
      text: string;
      annotations?: any[];
    }
  | {
      type: string;
      [k: string]: any;
    };

export interface ResponseReasoning {
  effort?: string | null;
  summary?: string | null;
  context?: string | null;
  generate_summary?: boolean | null;
  [k: string]: any;
}

export interface ResponseReasoningItem {
  type: "reasoning";
  id: string;
  status: string;
  content: any[];
}

export interface ResponseTextConfig {
  format: {
    type: "text" | "json_schema" | string;
    [k: string]: any;
  };
  verbosity?: string;
}

export interface ResponseToolCallItem {
  type:
    | "tool_call"
    | "code_interpreter_call"
    | "file_search_call"
    | "web_search_call"
    | "computer_call"
    | string;
  id?: string;
  status?: string;
  name?: string;
  arguments?: any;
  outputs?: any[];
  [k: string]: any;
}

export interface ResponseError {
  code?: string | null;
  message?: string;
  type?: string;
  param?: string | null;
  [k: string]: any;
}
```

この程度の “拡張可能な” 型定義を採用し、実際のログから観測されたフィールドを追っていくのが現実的です。

***

## 推奨パース戦略まとめ

あなたのユースケース（anthropx の LLM プロキシで Responses→Anthropic Messages 変換）を前提にすると:

1. **トップレベル struct には `deny_unknown_fields` を付けない**  
   - `background` / `billing` 等が今後も増えるため、ここを落とすとまた同じエラーになります。 [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)

2. **変換に必要なフィールドだけ “強型＋必須” にする**  
   - `id`, `status`, `model`, `output`, `usage` など。  
   - それ以外は `Option` + `serde_json::Value` / `String` にして、変換ロジックで必要なものだけ読む。

3. **未知フィールドをログに流す hook を入れる**  
   - 例えば `#[serde(flatten)] extra` を持たせ、`if !extra.is_empty() { log::debug!(...) }` のように観測。  
   - 重大な変更は “未知フィールド + おかしな status/error” として検知しうる。

4. **内部的には “core struct + extra” パターンに分離**  
   - `struct CoreResponse { id, status, model, output, usage, error }` に `deny_unknown_fields`  
   - `struct ResponsesResponseBody { #[serde(flatten)] core: CoreResponse, #[serde(flatten)] extra: Map<String, Value> }`  
   - これにより「コア部が壊れていないか」は検出しつつ、新フィールド追加には耐える。

5. **model-specific behavior はレスポンスではなく request 側で分岐**  
   - Codex 系特有フィールドに依存しない限り、Responses レベルでは同一 struct で扱う。  
   - もし Codex 固有の extension を見つけたら `billing_codex` 等として Optional に足す。

この方針なら、「安定版として文書化された必須フィールドのみ厳格に扱い、追加フィールドは無視またはログ」という、あなたが書いているバランスに近い形を Rust/serde で自然に実装できます。 [developers.openai](https://developers.openai.com/api/reference/resources/responses/methods/create/)

***

ここまでを踏まえて、実際に `ResponsesResponseBody` の Rust 定義案（および TypeScript 型）をファイルとして書き出す形でまとめたいのですが、最終的に欲しいフォーマットはどれが良いでしょうか？（例: `responses_response_body.ts`, `responses_response_body.json` スキーマ, あるいは `responses_response_body.rs`）
