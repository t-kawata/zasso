//! OpenAI 互換型 — Chat Completion API のリクエスト/レスポンス/SSE チャンク
//!
//! mistralrs が提供していた `ChatCompletionRequest` / `ChatCompletionResponse` 等の
//! OpenAI 互換型を、llama-cpp-2 移行後に自前で定義する。
//!
//! # 設計判断 (Q11/Q20)
//!
//! - 全標準フィールドを OpenAI API 仕様に準拠して実装する
//! - `#[derive(Serialize, Deserialize)]` で JSON 入出力をサポートする
//! - このモジュールは型定義のみを提供し、ハンドラでの使用は M6-9 で行う
//!
//! # 型一覧
//!
//! | 区分 | 型名 | 用途 |
//! |------|------|------|
//! | リクエスト | `ChatCompletionRequest` | チャット補完リクエスト |
//! | リクエスト | `ChatMessage` | メッセージ（role + content） |
//! | レスポンス | `ChatCompletionResponse` | 非ストリーミングレスポンス |
//! | レスポンス | `ChatResponseMessage` | レスポンス内のメッセージ |
//! | レスポンス | `Choice` | 生成結果の選択肢 |
//! | レスポンス | `Usage` | トークン使用量 |
//! | SSE | `ChatCompletionChunk` | ストリーミングチャンク |
//! | SSE | `ChunkChoice` | チャンク内の選択肢 |
//! | SSE | `Delta` | 差分メッセージ内容 |

use serde::{Deserialize, Serialize};

// ──────────────────────────────────────────────
//  リクエスト型
// ──────────────────────────────────────────────

/// OpenAI 互換 Chat Completion リクエスト
///
/// `messages` 以外のフィールドはすべて Optional であり、
/// サーバー側でデフォルト値が適用される。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    /// 使用するモデル識別子（省略時はサーバーのデフォルトモデル）
    pub model: Option<String>,
    /// 会話メッセージの配列
    pub messages: Vec<ChatMessage>,
    /// 生成のランダム性を制御する温度パラメータ（0.0〜2.0、デフォルト: 1.0）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// 確率分布の top-p フィルタリング（0.0〜1.0、デフォルト: 1.0）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    /// 生成する最大トークン数（デフォルト: モデル依存）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    /// ストリーミング出力を有効にするかどうか
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    /// 既出トピックへのペナルティ（-2.0〜2.0、デフォルト: 0.0）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,
    /// 既出トークンへのペナルティ（-2.0〜2.0、デフォルト: 0.0）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,
    /// 生成を停止するセクション区切り文字列の配列
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
}

/// 会話メッセージ（role（役割）と content（内容）の組）
///
/// role は "system" / "user" / "assistant" のいずれか。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    /// メッセージの役割（"system", "user", "assistant"）
    pub role: String,
    /// メッセージの内容
    pub content: String,
}

// ──────────────────────────────────────────────
//  レスポンス型（非ストリーミング）
// ──────────────────────────────────────────────

/// OpenAI 互換 Chat Completion レスポンス（非ストリーミング）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    /// レスポンスの一意識別子
    pub id: String,
    /// オブジェクト種別（常に "chat.completion"）
    pub object: String,
    /// 作成時刻（Unix エポック秒）
    pub created: i64,
    /// 使用したモデル識別子
    pub model: String,
    /// 生成結果の選択肢リスト
    pub choices: Vec<Choice>,
    /// トークン使用量（省略可）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
}

/// 生成結果の選択肢
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    /// 選択肢のインデックス
    pub index: u32,
    /// 生成されたメッセージ
    pub message: ChatResponseMessage,
    /// 終了理由（"stop", "length", "content_filter" 等）
    pub finish_reason: String,
}

/// レスポンス内のメッセージ
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponseMessage {
    /// メッセージの役割（通常 "assistant"）
    pub role: String,
    /// メッセージの内容
    pub content: String,
}

/// トークン使用量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    /// 入力（プロンプト）トークン数
    pub prompt_tokens: u32,
    /// 出力（生成）トークン数
    pub completion_tokens: u32,
    /// 合計トークン数
    pub total_tokens: u32,
}

// ──────────────────────────────────────────────
//  SSE チャンク型（ストリーミング）
// ──────────────────────────────────────────────

/// OpenAI 互換 SSE チャンク（ストリーミング用）
///
/// `POST /v1/chat/completions` の `stream: true` 時に
/// `data: {...}` 形式で逐次送信される。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionChunk {
    /// チャンクの一意識別子（全チャンクで同一）
    pub id: String,
    /// オブジェクト種別（常に "chat.completion.chunk"）
    pub object: String,
    /// 作成時刻（Unix エポック秒）
    pub created: i64,
    /// 使用したモデル識別子
    pub model: String,
    /// チャンク内の選択肢リスト
    pub choices: Vec<ChunkChoice>,
}

/// チャンク内の選択肢
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkChoice {
    /// 選択肢のインデックス
    pub index: u32,
    /// トークン単位の差分内容
    pub delta: Delta,
    /// 終了理由（最終チャンクのみ設定、それ以外は None）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

/// ストリーミングの差分メッセージ内容
///
/// 最初のチャンクでは role が設定され、2回目以降は content のみが
/// 逐次設定される。終端チャンクでは両方とも None になりうる。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delta {
    /// メッセージの役割（初回チャンクのみ設定）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    /// トークン単位の生成内容（逐次追加）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

// ──────────────────────────────────────────────
//  テスト
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── 正常系: ChatCompletionRequest ──

    /// 最小構成（model + messages のみ）のリクエストがラウンドトリップする
    #[test]
    fn test_roundtrip_request_minimal() {
        let json = r#"{
            "model": "qwen3.5-0.8b",
            "messages": [
                {"role": "user", "content": "Hello"}
            ]
        }"#;

        let req: ChatCompletionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.model.as_deref(), Some("qwen3.5-0.8b"));
        assert_eq!(req.messages.len(), 1);
        assert_eq!(req.messages[0].role, "user");
        assert_eq!(req.messages[0].content, "Hello");

        // 再シリアライズして一致することを確認
        let serialized = serde_json::to_string(&req).unwrap();
        let req2: ChatCompletionRequest = serde_json::from_str(&serialized).unwrap();
        assert_eq!(req.model, req2.model);
        assert_eq!(req.messages.len(), req2.messages.len());
    }

    /// 全オプションフィールドを含むリクエストの各フィールドが正しく読み取れる
    #[test]
    fn test_deserialize_request_full_fields() {
        let json = r#"{
            "model": "gemma4-e2b",
            "messages": [
                {"role": "system", "content": "You are helpful."},
                {"role": "user", "content": "Tell me a story."}
            ],
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 256,
            "stream": true,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.2,
            "stop": ["\n", "STOP"]
        }"#;

        let req: ChatCompletionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.model.as_deref(), Some("gemma4-e2b"));
        assert_eq!(req.messages.len(), 2);
        assert!((req.temperature.unwrap() - 0.7).abs() < f32::EPSILON);
        assert!((req.top_p.unwrap() - 0.9).abs() < f32::EPSILON);
        assert_eq!(req.max_tokens, Some(256));
        assert_eq!(req.stream, Some(true));
        assert!((req.presence_penalty.unwrap() - 0.1).abs() < f32::EPSILON);
        assert!((req.frequency_penalty.unwrap() - 0.2).abs() < f32::EPSILON);
        assert_eq!(req.stop, Some(vec!["\n".to_string(), "STOP".to_string()]));
    }

    // ── 正常系: ChatCompletionResponse ──

    /// OpenAI 形式のレスポンス JSON がラウンドトリップする
    #[test]
    fn test_roundtrip_response() {
        let json = r#"{
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1718000000,
            "model": "qwen3.5-0.8b",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "Hello!"
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15
            }
        }"#;

        let resp: ChatCompletionResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.id, "chatcmpl-123");
        assert_eq!(resp.object, "chat.completion");
        assert_eq!(resp.created, 1718000000);
        assert_eq!(resp.choices.len(), 1);
        assert_eq!(resp.choices[0].message.content, "Hello!");
        assert_eq!(resp.choices[0].finish_reason, "stop");

        let usage = resp.usage.as_ref().unwrap();
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 5);
        assert_eq!(usage.total_tokens, 15);

        // ラウンドトリップ確認
        let serialized = serde_json::to_string(&resp).unwrap();
        let resp2: ChatCompletionResponse = serde_json::from_str(&serialized).unwrap();
        assert_eq!(resp.id, resp2.id);
        assert_eq!(resp.choices.len(), resp2.choices.len());
    }

    /// finish_reason の値が正しく読み取れる
    #[test]
    fn test_choice_finish_reason() {
        let json = r#"{
            "index": 0,
            "message": {"role": "assistant", "content": "Bye!"},
            "finish_reason": "length"
        }"#;
        let choice: Choice = serde_json::from_str(json).unwrap();
        assert_eq!(choice.finish_reason, "length");
    }

    /// Usage の各トークン数が正しく読み取れる
    #[test]
    fn test_usage_tokens() {
        let json = r#"{"prompt_tokens": 50, "completion_tokens": 100, "total_tokens": 150}"#;
        let usage: Usage = serde_json::from_str(json).unwrap();
        assert_eq!(usage.prompt_tokens, 50);
        assert_eq!(usage.completion_tokens, 100);
        assert_eq!(usage.total_tokens, 150);
    }

    // ── 正常系: SSE チャンク ──

    /// SSE チャンクの JSON がラウンドトリップする
    #[test]
    fn test_roundtrip_chunk() {
        let json = r#"{
            "id": "chatcmpl-123",
            "object": "chat.completion.chunk",
            "created": 1718000000,
            "model": "qwen3.5-0.8b",
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "role": "assistant",
                        "content": "Hello"
                    },
                    "finish_reason": null
                }
            ]
        }"#;

        let chunk: ChatCompletionChunk = serde_json::from_str(json).unwrap();
        assert_eq!(chunk.object, "chat.completion.chunk");
        assert_eq!(chunk.choices[0].delta.role.as_deref(), Some("assistant"));
        assert_eq!(chunk.choices[0].delta.content.as_deref(), Some("Hello"));
        assert!(chunk.choices[0].finish_reason.is_none());

        // ラウンドトリップ確認
        let serialized = serde_json::to_string(&chunk).unwrap();
        let chunk2: ChatCompletionChunk = serde_json::from_str(&serialized).unwrap();
        assert_eq!(chunk.id, chunk2.id);
        assert_eq!(chunk.choices.len(), chunk2.choices.len());
    }

    /// Delta の role と content が Optional として正しく読み取れる
    #[test]
    fn test_delta_optional_fields() {
        // content のみの Delta（2回目以降のチャンク）
        let json = r#"{"content": " world"}"#;
        let delta: Delta = serde_json::from_str(json).unwrap();
        assert!(delta.role.is_none());
        assert_eq!(delta.content.as_deref(), Some(" world"));

        // 空の Delta（終端チャンク）
        let json = r#"{}"#;
        let delta: Delta = serde_json::from_str(json).unwrap();
        assert!(delta.role.is_none());
        assert!(delta.content.is_none());
    }

    // ── 異常系 ──

    /// messages フィールドがないリクエストはデシリアライズに失敗する
    #[test]
    fn test_rejects_missing_messages() {
        let json = r#"{"model": "test"}"#;
        let result: Result<ChatCompletionRequest, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    /// 不正な JSON はデシリアライズに失敗する
    #[test]
    fn test_rejects_invalid_json() {
        // 空文字列
        let result: Result<ChatCompletionRequest, _> = serde_json::from_str("");
        assert!(result.is_err());

        // 配列（オブジェクトではない）
        let result: Result<ChatCompletionRequest, _> = serde_json::from_str("[]");
        assert!(result.is_err());
    }

    // ── 境界値 ──

    /// 空配列の messages が許容される
    #[test]
    fn test_empty_messages_allowed() {
        let json = r#"{"model": "test", "messages": []}"#;
        let req: ChatCompletionRequest = serde_json::from_str(json).unwrap();
        assert!(req.messages.is_empty());
    }

    /// 全オプションフィールドが省略された場合、デフォルトで None になる
    #[test]
    fn test_all_optionals_default_to_none() {
        let json = r#"{"messages": [{"role": "user", "content": "Hi"}]}"#;
        let req: ChatCompletionRequest = serde_json::from_str(json).unwrap();
        assert!(req.model.is_none());
        assert!(req.temperature.is_none());
        assert!(req.top_p.is_none());
        assert!(req.max_tokens.is_none());
        assert!(req.stream.is_none());
        assert!(req.presence_penalty.is_none());
        assert!(req.frequency_penalty.is_none());
        assert!(req.stop.is_none());
    }

    /// max_tokens: 0 が許容される（0 は「制限なし」を意味する）
    #[test]
    fn test_max_tokens_zero_allowed() {
        let json = r#"{"messages": [{"role": "user", "content": "Hi"}], "max_tokens": 0}"#;
        let req: ChatCompletionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.max_tokens, Some(0));
    }
}
