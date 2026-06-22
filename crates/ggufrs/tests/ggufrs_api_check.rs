//! ggufrs 公開API確認テスト
//!
//! lib.rs から server::types の型が正しく再公開されていることを確認する。
//! このファイルがコンパイル可能であること自体が、公開APIの正常性を示す。
//!
//! # mistralrs 型の非公開確認（手動）
//!
//! 以下の行は mistralrs の型が crate 外からアクセス不可能になったことを確認するためのもので、
//! コンパイルエラーになることが期待されるためコメントアウトしている。
//! 意図的にコメントを外して cargo check を実行し、エラーになることを確認すること。
//!
//! ```ignore
//! // use ggufrs::mistralrs::Model;   // → error[E0432]: unresolved import
//! // use ggufrs::Constraint;          // → error[E0432]: unresolved import
//! // use ggufrs::SamplingParams;      // → error[E0432]: unresolved import
//! // use ggufrs::RequestBuilder;      // → error[E0432]: unresolved import
//! ```

use ggufrs::server::types::ChatCompletionRequest;
use ggufrs::server::types::ChatCompletionResponse;
use ggufrs::server::types::ChatMessage;
use ggufrs::server::types::ChatResponseMessage;
use ggufrs::server::types::Choice;
use ggufrs::server::types::Usage;
use ggufrs::server::types::ChatCompletionChunk;
use ggufrs::server::types::ChunkChoice;
use ggufrs::server::types::Delta;

/// server::types の全公開型が ggufrs クレートからアクセス可能であることを確認する
#[test]
fn test_all_api_types_accessible() {
    // ChatCompletionRequest — 最小構成のデシリアライズ
    let req: ChatCompletionRequest = serde_json::from_str(
        r#"{"messages": [{"role": "user", "content": "Hi"}]}"#,
    )
    .unwrap();
    assert!(req.model.is_none());
    assert_eq!(req.messages.len(), 1);

    // ChatMessage
    let msg = ChatMessage {
        role: "user".into(),
        content: "Hello".into(),
    };
    assert_eq!(msg.role, "user");

    // Choice + ChatResponseMessage
    let choice = Choice {
        index: 0,
        message: ChatResponseMessage {
            role: "assistant".into(),
            content: "Hi!".into(),
        },
        finish_reason: "stop".into(),
    };
    assert_eq!(choice.finish_reason, "stop");

    // Usage
    let usage = Usage {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
    };
    assert_eq!(usage.total_tokens, 15);

    // ChatCompletionResponse
    let resp = ChatCompletionResponse {
        id: "test-id".into(),
        object: "chat.completion".into(),
        created: 1718000000,
        model: "test".into(),
        choices: vec![choice],
        usage: Some(usage),
    };
    assert_eq!(resp.object, "chat.completion");
    assert!(resp.usage.is_some());

    // Delta
    let delta = Delta {
        role: Some("assistant".into()),
        content: Some("Hello".into()),
    };
    assert!(delta.role.is_some());

    // ChunkChoice
    let chunk_choice = ChunkChoice {
        index: 0,
        delta,
        finish_reason: None,
    };
    assert!(chunk_choice.finish_reason.is_none());

    // ChatCompletionChunk
    let chunk = ChatCompletionChunk {
        id: "test-chunk-id".into(),
        object: "chat.completion.chunk".into(),
        created: 1718000000,
        model: "test".into(),
        choices: vec![chunk_choice],
    };
    assert_eq!(chunk.object, "chat.completion.chunk");
}
