//! Stream module tests.

#![allow(clippy::module_inception)] // file is tests.rs, included as mod tests; inner mod tests is conventional

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use crate::{
        model::{ApiFormat, StopReason, StreamDelta, StreamEvent, StreamState, Usage},
        stream::{
            SYNTHETIC_THINKING_SIGNATURE, events_to_sse, parse_sse_frames, transform_stream_events,
            transform_stream_to_openai_responses_sse, transform_stream_to_openai_sse,
        },
    };

    // -----------------------------------------------------------------------
    // SSE parser tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_sse_openai_style() {
        let input = b"data: {\"choices\":[]}\n\ndata: [DONE]\n\n";
        let frames = parse_sse_frames(input);
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].data, "{\"choices\":[]}");
        assert_eq!(frames[1].data, "[DONE]");
    }

    #[test]
    fn test_parse_sse_with_event() {
        let input = b"event: ping\ndata: hello\n\n";
        let frames = parse_sse_frames(input);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].event.as_deref(), Some("ping"));
        assert_eq!(frames[0].data, "hello");
    }

    #[test]
    fn test_parse_sse_skip_comments() {
        let input = b":keepalive\ndata: hello\n\n";
        let frames = parse_sse_frames(input);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].data, "hello");
    }

    #[test]
    fn test_parse_sse_data_with_space() {
        let input = b"data: {\"a\":1}\n\n";
        let frames = parse_sse_frames(input);
        assert_eq!(frames[0].data, "{\"a\":1}");
    }

    // -----------------------------------------------------------------------
    // OpenAI stream tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_openai_stream_text() {
        let input = b"data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n\
                      data: {\"choices\":[{\"delta\":{\"content\":\"lo\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":2}}\n\n\
                      data: [DONE]\n\n";

        let mut state = StreamState::default();
        let events = transform_stream_events(input, ApiFormat::OpenaiChat, &mut state).unwrap();

        assert_eq!(events.len(), 7);
        assert!(matches!(&events[0], StreamEvent::MessageStart { .. }));
        assert!(matches!(&events[1], StreamEvent::ContentBlockStart { .. }));
        assert!(
            matches!(&events[2], StreamEvent::ContentBlockDelta { delta: StreamDelta::Text { text }, .. } if text == "Hel")
        );
        assert!(
            matches!(&events[3], StreamEvent::ContentBlockDelta { delta: StreamDelta::Text { text }, .. } if text == "lo")
        );
        assert!(matches!(&events[4], StreamEvent::ContentBlockStop { .. }));
        assert!(matches!(
            &events[5],
            StreamEvent::MessageDelta {
                stop_reason: Some(StopReason::EndTurn),
                ..
            }
        ));
        assert!(matches!(&events[6], StreamEvent::MessageStop));
    }

    #[test]
    fn test_openai_stream_tool_call() {
        let input = b"data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_123\",\"function\":{\"name\":\"get_weather\",\"arguments\":\"\"}}]}}]}\n\n\
                      data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"city\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":20,\"completion_tokens\":6}}\n\n\
                      data: [DONE]\n\n";

        let mut state = StreamState::default();
        let events = transform_stream_events(input, ApiFormat::OpenaiChat, &mut state).unwrap();

        assert_eq!(events.len(), 6);

        assert!(matches!(&events[0], StreamEvent::MessageStart { .. }));
        assert!(
            matches!(&events[1], StreamEvent::ContentBlockStart { content_block: crate::model::ContentBlock::ToolUse { name, .. }, .. } if name == "get_weather")
        );
        assert!(
            matches!(&events[2], StreamEvent::ContentBlockDelta { delta: StreamDelta::InputJson { partial_json }, .. } if partial_json == "{\"city\"}")
        );
        assert!(matches!(&events[3], StreamEvent::ContentBlockStop { .. }));
        assert!(matches!(
            &events[4],
            StreamEvent::MessageDelta {
                stop_reason: Some(StopReason::ToolUse),
                ..
            }
        ));
        assert!(matches!(&events[5], StreamEvent::MessageStop));
    }

    #[test]
    fn test_openai_stream_text_incremental_calls_only_stop_once() {
        let mut state = StreamState::default();

        let first = transform_stream_events(
            b"data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n",
            ApiFormat::OpenaiChat,
            &mut state,
        )
        .unwrap();
        assert_eq!(first.len(), 3);
        assert!(matches!(&first[0], StreamEvent::MessageStart { .. }));
        assert!(matches!(&first[1], StreamEvent::ContentBlockStart { .. }));
        assert!(
            matches!(&first[2], StreamEvent::ContentBlockDelta { delta: StreamDelta::Text { text }, .. } if text == "Hel")
        );

        let second = transform_stream_events(
            b"data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":2}}\n\n",
            ApiFormat::OpenaiChat,
            &mut state,
        )
        .unwrap();
        assert_eq!(second.len(), 1);
        assert!(
            matches!(&second[0], StreamEvent::ContentBlockDelta { delta: StreamDelta::Text { text }, .. } if text == "lo")
        );

        let third = transform_stream_events(b"data: [DONE]\n\n", ApiFormat::OpenaiChat, &mut state)
            .unwrap();
        assert_eq!(third.len(), 3);
        assert!(matches!(&third[0], StreamEvent::ContentBlockStop { .. }));
        assert!(
            matches!(&third[1], StreamEvent::MessageDelta { stop_reason: Some(StopReason::EndTurn), usage, .. } if usage.input_tokens == 12 && usage.output_tokens == 2)
        );
        assert!(matches!(&third[2], StreamEvent::MessageStop));

        let after_finish =
            transform_stream_events(b"data: [DONE]\n\n", ApiFormat::OpenaiChat, &mut state)
                .unwrap();
        assert!(after_finish.is_empty());
    }

    #[test]
    fn test_openai_stream_reasoning_content_maps_to_thinking_block() {
        let input = b"data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"Let me think.\"}}]}\n\n\
                      data: {\"choices\":[{\"delta\":{\"content\":\"Final answer\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":18,\"completion_tokens\":4}}\n\n\
                      data: [DONE]\n\n";

        let mut state = StreamState::default();
        let events = transform_stream_events(input, ApiFormat::OpenaiChat, &mut state).unwrap();

        assert_eq!(events.len(), 10);
        assert!(matches!(&events[0], StreamEvent::MessageStart { .. }));
        assert!(matches!(
            &events[1],
            StreamEvent::ContentBlockStart {
                index: 0,
                content_block: crate::model::ContentBlock::Thinking { .. },
            }
        ));
        assert!(matches!(
            &events[2],
            StreamEvent::ContentBlockDelta {
                index: 0,
                delta: StreamDelta::Thinking { thinking },
            } if thinking == "Let me think."
        ));
        assert!(matches!(
            &events[3],
            StreamEvent::ContentBlockDelta {
                index: 0,
                delta: StreamDelta::Signature { signature },
            } if signature == SYNTHETIC_THINKING_SIGNATURE
        ));
        assert!(matches!(
            &events[4],
            StreamEvent::ContentBlockStop { index: 0 }
        ));
        assert!(matches!(
            &events[5],
            StreamEvent::ContentBlockStart {
                index: 1,
                content_block: crate::model::ContentBlock::Text { .. },
            }
        ));
        assert!(matches!(
            &events[6],
            StreamEvent::ContentBlockDelta {
                index: 1,
                delta: StreamDelta::Text { text },
            } if text == "Final answer"
        ));
        assert!(matches!(
            &events[7],
            StreamEvent::ContentBlockStop { index: 1 }
        ));
        assert!(matches!(
            &events[8],
            StreamEvent::MessageDelta {
                stop_reason: Some(StopReason::EndTurn),
                usage,
                ..
            } if usage.input_tokens == 18 && usage.output_tokens == 4
        ));
        assert!(matches!(&events[9], StreamEvent::MessageStop));
    }

    #[test]
    fn test_openai_stream_text_then_tool_call_uses_sequential_block_indices() {
        let input = b"data: {\"choices\":[{\"delta\":{\"content\":\"I'll check.\"}}]}\n\n\
                      data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_123\",\"function\":{\"name\":\"get_weather\",\"arguments\":\"{\\\"city\\\":\\\"Paris\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":20,\"completion_tokens\":6}}\n\n\
                      data: [DONE]\n\n";

        let mut state = StreamState::default();
        let events = transform_stream_events(input, ApiFormat::OpenaiChat, &mut state).unwrap();

        assert!(matches!(
            &events[1],
            StreamEvent::ContentBlockStart { index: 0, .. }
        ));
        assert!(matches!(
            &events[2],
            StreamEvent::ContentBlockDelta { index: 0, .. }
        ));
        assert!(matches!(
            &events[3],
            StreamEvent::ContentBlockStop { index: 0 }
        ));
        assert!(matches!(
            &events[4],
            StreamEvent::ContentBlockStart {
                index: 1,
                content_block: crate::model::ContentBlock::ToolUse { name, .. },
            } if name == "get_weather"
        ));
        assert!(matches!(
            &events[5],
            StreamEvent::ContentBlockDelta {
                index: 1,
                delta: StreamDelta::InputJson { partial_json },
            } if partial_json == "{\"city\":\"Paris\"}"
        ));
    }

    #[test]
    fn test_events_to_sse_serializes_thinking_and_signature_deltas() {
        let sse = String::from_utf8(events_to_sse(&[
            StreamEvent::ContentBlockDelta {
                index: 0,
                delta: StreamDelta::Thinking {
                    thinking: "analysis".to_string(),
                },
            },
            StreamEvent::ContentBlockDelta {
                index: 0,
                delta: StreamDelta::Signature {
                    signature: "sig".to_string(),
                },
            },
        ]))
        .unwrap();

        assert!(sse.contains("\"type\":\"thinking_delta\""));
        assert!(sse.contains("\"thinking\":\"analysis\""));
        assert!(sse.contains("\"type\":\"signature_delta\""));
        assert!(sse.contains("\"signature\":\"sig\""));
    }

    #[test]
    fn test_openai_stream_done_without_content_still_emits_message_lifecycle() {
        let input = b"data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":0}}\n\n\
                      data: [DONE]\n\n";

        let mut state = StreamState::default();
        let events = transform_stream_events(input, ApiFormat::OpenaiChat, &mut state).unwrap();

        assert_eq!(events.len(), 3);
        assert!(matches!(&events[0], StreamEvent::MessageStart { .. }));
        assert!(matches!(
            &events[1],
            StreamEvent::MessageDelta {
                stop_reason: Some(StopReason::EndTurn),
                usage,
                ..
            } if usage.input_tokens == 12 && usage.output_tokens == 0
        ));
        assert!(matches!(&events[2], StreamEvent::MessageStop));
    }

    #[test]
    fn test_anthropic_stream_to_openai_text() {
        let input = b"event: message_start\n\
data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_123\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"qwen-plus-anthropic\",\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":12,\"output_tokens\":0}}}\n\n\
event: content_block_start\n\
data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hel\"}}\n\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"lo\"}}\n\n\
event: content_block_stop\n\
data: {\"type\":\"content_block_stop\",\"index\":0}\n\n\
event: message_delta\n\
data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":2}}\n\n\
event: message_stop\n\
data: {\"type\":\"message_stop\"}\n\n";

        let mut state = StreamState::default();
        let sse = transform_stream_to_openai_sse(input, ApiFormat::AnthropicMessages, &mut state)
            .unwrap();
        let text = String::from_utf8(sse).unwrap();

        assert!(text.contains("\"object\":\"chat.completion.chunk\""));
        assert!(text.contains("\"role\":\"assistant\""));
        assert!(text.contains("\"content\":\"Hel\""));
        assert!(text.contains("\"content\":\"lo\""));
        assert!(text.contains("\"finish_reason\":\"stop\""));
        assert!(text.contains("\"prompt_tokens\":12"));
        assert!(text.contains("\"completion_tokens\":2"));
        assert!(text.contains("data: [DONE]"));
    }

    #[test]
    fn test_anthropic_stream_to_openai_thinking_and_tool_use() {
        let input = b"event: message_start\n\
data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_456\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"qwen-plus-anthropic\",\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":20,\"output_tokens\":0}}}\n\n\
event: content_block_start\n\
data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}\n\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"Let me think.\"}}\n\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"sig\"}}\n\n\
event: content_block_stop\n\
data: {\"type\":\"content_block_stop\",\"index\":0}\n\n\
event: content_block_start\n\
data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_123\",\"name\":\"get_weather\",\"input\":{}}}\n\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"city\\\":\\\"Paris\\\"}\"}}\n\n\
event: content_block_stop\n\
data: {\"type\":\"content_block_stop\",\"index\":1}\n\n\
event: message_delta\n\
data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":6}}\n\n\
event: message_stop\n\
data: {\"type\":\"message_stop\"}\n\n";

        let mut state = StreamState::default();
        let sse = transform_stream_to_openai_sse(input, ApiFormat::AnthropicMessages, &mut state)
            .unwrap();
        let text = String::from_utf8(sse).unwrap();

        assert!(text.contains("\"reasoning_content\":\"Let me think.\""));
        assert!(text.contains("\"id\":\"toolu_123\""));
        assert!(text.contains("\"name\":\"get_weather\""));
        assert!(text.contains("\"arguments\":\"{\\\"city\\\":\\\"Paris\\\"}\""));
        assert!(text.contains("\"finish_reason\":\"tool_calls\""));
        assert!(text.contains("data: [DONE]"));
    }

    // -----------------------------------------------------------------------
    // SSE output tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_events_to_sse_message_start() {
        let events = vec![StreamEvent::MessageStart {
            role: "assistant".to_string(),
            message_id: "msg_test".to_string(),
            model: "test-model".to_string(),
            usage: Usage::default(),
        }];

        let sse = events_to_sse(&events);
        let text = String::from_utf8_lossy(&sse);
        assert!(text.contains("event: message_start"));
        let payload = text
            .lines()
            .find_map(|line| line.strip_prefix("data: "))
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .unwrap();
        assert_eq!(payload["type"], "message_start");
        assert_eq!(payload["message"]["id"], "msg_test");
        assert_eq!(payload["message"]["type"], "message");
        assert_eq!(payload["message"]["model"], "test-model");
    }

    #[test]
    fn test_events_to_sse_full_sequence() {
        let events = vec![
            StreamEvent::MessageStart {
                role: "assistant".to_string(),
                message_id: "msg_test".to_string(),
                model: "test-model".to_string(),
                usage: Usage::default(),
            },
            StreamEvent::ContentBlockStart {
                index: 0,
                content_block: crate::model::ContentBlock::Text {
                    text: String::new(),
                },
            },
            StreamEvent::ContentBlockDelta {
                index: 0,
                delta: StreamDelta::Text {
                    text: "Hello".to_string(),
                },
            },
            StreamEvent::ContentBlockStop { index: 0 },
            StreamEvent::MessageDelta {
                stop_reason: Some(StopReason::EndTurn),
                stop_sequence: None,
                usage: Usage {
                    input_tokens: 10,
                    output_tokens: 5,
                    ..Default::default()
                },
            },
            StreamEvent::MessageStop,
        ];

        let sse = events_to_sse(&events);
        let text = String::from_utf8_lossy(&sse);
        assert!(text.contains("event: message_start"));
        assert!(text.contains("event: content_block_start"));
        assert!(text.contains("event: content_block_delta"));
        assert!(text.contains("event: content_block_stop"));
        assert!(text.contains("event: message_delta"));
        assert!(text.contains("event: message_stop"));
        assert!(text.contains("\"type\":\"message_start\""));
        assert!(text.contains("\"type\":\"content_block_delta\""));
        assert!(text.contains("\"type\":\"message_stop\""));
    }

    #[test]
    fn test_events_to_sse_input_json_delta_and_error_shape() {
        let events = vec![
            StreamEvent::ContentBlockDelta {
                index: 1,
                delta: StreamDelta::InputJson {
                    partial_json: "{\"city\":\"Par".to_string(),
                },
            },
            StreamEvent::Error {
                error_type: "overloaded_error".to_string(),
                message: "Overloaded".to_string(),
            },
        ];

        let sse = events_to_sse(&events);
        let text = String::from_utf8_lossy(&sse);
        let payloads: Vec<Value> = text
            .lines()
            .filter_map(|line| line.strip_prefix("data: "))
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .collect();

        assert_eq!(payloads[0]["type"], "content_block_delta");
        assert_eq!(payloads[0]["delta"]["type"], "input_json_delta");
        assert_eq!(payloads[0]["delta"]["partial_json"], "{\"city\":\"Par");
        assert_eq!(payloads[1]["type"], "error");
        assert_eq!(payloads[1]["error"]["type"], "overloaded_error");
        assert_eq!(payloads[1]["error"]["message"], "Overloaded");
    }

    // -----------------------------------------------------------------------
    // Fixture-based tests
    // -----------------------------------------------------------------------

    #[derive(Debug, serde::Deserialize)]
    struct Fixture {
        name: String,
        mode: String,
        input: FixtureInput,
        expected: FixtureExpected,
    }

    #[derive(Debug, serde::Deserialize)]
    struct FixtureInput {
        events: Vec<FixtureEvent>,
    }

    #[derive(Debug, serde::Deserialize)]
    struct FixtureEvent {
        raw_sse: String,
    }

    #[derive(Debug, serde::Deserialize)]
    struct FixtureExpected {
        events: Vec<Value>,
    }

    #[derive(Debug, serde::Deserialize)]
    struct OpenAiSseFixture {
        name: String,
        mode: String,
        input: FixtureInput,
        expected: OpenAiSseExpected,
    }

    #[derive(Debug, serde::Deserialize)]
    struct OpenAiSseExpected {
        downstream_sse_contains: Vec<String>,
    }

    #[allow(clippy::disallowed_methods)] // sync #[test] context; fixture files are small
    fn load_fixture(path: &str) -> Fixture {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let full_path = format!("{manifest_dir}/../../{path}");
        let content = std::fs::read_to_string(&full_path)
            .unwrap_or_else(|e| panic!("fixture file {full_path}: {e}"));
        serde_json::from_str(&content).expect("fixture JSON")
    }

    #[allow(clippy::disallowed_methods)] // sync #[test] context; fixture files are small
    fn load_openai_sse_fixture(path: &str) -> OpenAiSseFixture {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let full_path = format!("{manifest_dir}/../../{path}");
        let content = std::fs::read_to_string(&full_path)
            .unwrap_or_else(|e| panic!("fixture file {full_path}: {e}"));
        serde_json::from_str(&content).expect("fixture JSON")
    }

    fn fixture_events_to_sse(events: &[FixtureEvent]) -> Vec<u8> {
        let mut out = Vec::new();
        for e in events {
            out.extend_from_slice(e.raw_sse.as_bytes());
            out.extend_from_slice(b"\n\n");
        }
        out
    }

    #[test]
    fn test_fixture_openai_stream_text() {
        let fixture =
            load_fixture("fixtures/protocol-transform/openai-to-anthropic/stream-text.json");
        assert_eq!(fixture.mode, "stream");

        let input_sse = fixture_events_to_sse(&fixture.input.events);
        let mut state = StreamState::default();
        let events =
            transform_stream_events(&input_sse, ApiFormat::OpenaiChat, &mut state).unwrap();

        assert_eq!(
            events.len(),
            fixture.expected.events.len(),
            "event count mismatch for {}",
            fixture.name
        );

        for (i, (event, expected)) in events
            .iter()
            .zip(fixture.expected.events.iter())
            .enumerate()
        {
            let expected_type = expected.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let actual_type = stream_event_type(event);
            assert_eq!(
                actual_type, expected_type,
                "event[{}] type mismatch in {}: got {actual_type}, expected {expected_type}",
                i, fixture.name
            );
        }
    }

    #[test]
    fn test_fixture_openai_stream_tool_call() {
        let fixture =
            load_fixture("fixtures/protocol-transform/openai-to-anthropic/stream-tool-call.json");
        assert_eq!(fixture.mode, "stream");

        let input_sse = fixture_events_to_sse(&fixture.input.events);
        let mut state = StreamState::default();
        let events =
            transform_stream_events(&input_sse, ApiFormat::OpenaiChat, &mut state).unwrap();

        assert_eq!(
            events.len(),
            fixture.expected.events.len(),
            "event count mismatch for {}",
            fixture.name
        );

        for (i, (event, expected)) in events
            .iter()
            .zip(fixture.expected.events.iter())
            .enumerate()
        {
            let expected_type = expected.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let actual_type = stream_event_type(event);
            assert_eq!(
                actual_type, expected_type,
                "event[{}] type mismatch in {}: got {actual_type}, expected {expected_type}",
                i, fixture.name
            );
        }
    }

    #[test]
    fn test_fixture_anthropic_to_openai_stream_text() {
        let fixture = load_openai_sse_fixture(
            "fixtures/protocol-transform/anthropic-to-openai/stream-text.json",
        );
        assert_eq!(fixture.mode, "stream");

        let input_sse = fixture_events_to_sse(&fixture.input.events);
        let mut state = StreamState::default();
        let downstream_sse = String::from_utf8(
            transform_stream_to_openai_sse(&input_sse, ApiFormat::AnthropicMessages, &mut state)
                .unwrap(),
        )
        .unwrap();

        for expected in &fixture.expected.downstream_sse_contains {
            assert!(
                downstream_sse.contains(expected),
                "missing downstream SSE fragment in {}: {}\n---\n{}",
                fixture.name,
                expected,
                downstream_sse
            );
        }
    }

    #[test]
    fn test_fixture_anthropic_to_openai_stream_tool_use() {
        let fixture = load_openai_sse_fixture(
            "fixtures/protocol-transform/anthropic-to-openai/stream-tool-use.json",
        );
        assert_eq!(fixture.mode, "stream");

        let input_sse = fixture_events_to_sse(&fixture.input.events);
        let mut state = StreamState::default();
        let downstream_sse = String::from_utf8(
            transform_stream_to_openai_sse(&input_sse, ApiFormat::AnthropicMessages, &mut state)
                .unwrap(),
        )
        .unwrap();

        for expected in &fixture.expected.downstream_sse_contains {
            assert!(
                downstream_sse.contains(expected),
                "missing downstream SSE fragment in {}: {}\n---\n{}",
                fixture.name,
                expected,
                downstream_sse
            );
        }
    }

    #[test]
    fn test_fixture_anthropic_to_openai_responses_stream_tool_use() {
        let fixture = load_openai_sse_fixture(
            "fixtures/protocol-transform/anthropic-to-openai/stream-responses-tool-use.json",
        );
        assert_eq!(fixture.mode, "stream");

        let input_sse = fixture_events_to_sse(&fixture.input.events);
        let mut state = StreamState::default();
        let downstream_sse = String::from_utf8(
            transform_stream_to_openai_responses_sse(
                &input_sse,
                ApiFormat::AnthropicMessages,
                &mut state,
            )
            .unwrap(),
        )
        .unwrap();

        for expected in &fixture.expected.downstream_sse_contains {
            assert!(
                downstream_sse.contains(expected),
                "missing downstream SSE fragment in {}: {}\n---\n{}",
                fixture.name,
                expected,
                downstream_sse
            );
        }
    }

    fn stream_event_type(event: &StreamEvent) -> &'static str {
        match event {
            StreamEvent::MessageStart { .. } => "message_start",
            StreamEvent::ContentBlockStart { .. } => "content_block_start",
            StreamEvent::ContentBlockDelta { .. } => "content_block_delta",
            StreamEvent::ContentBlockStop { .. } => "content_block_stop",
            StreamEvent::MessageDelta { .. } => "message_delta",
            StreamEvent::MessageStop => "message_stop",
            StreamEvent::Error { .. } => "error",
        }
    }

    // -----------------------------------------------------------------------
    // Responses API SSE → Anthropic SSE streaming tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_responses_stream_to_anthropic_text_message() {
        // Simulates a complete Responses API text streaming sequence.
        let input = b"event: response.created\n\
data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_123\",\"model\":\"gpt-4o\"}}\n\n\
event: response.output_item.added\n\
data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"content_index\":0,\"item\":{\"type\":\"message\",\"role\":\"assistant\"}}\n\n\
event: response.output_text.delta\n\
data: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"Hel\"}\n\n\
event: response.output_text.delta\n\
data: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"lo\"}\n\n\
event: response.output_text.done\n\
data: {\"type\":\"response.output_text.done\",\"output_index\":0,\"content_index\":0,\"text\":\"Hello\"}\n\n\
event: response.output_item.done\n\
data: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":{\"type\":\"message\",\"role\":\"assistant\"}}\n\n\
event: response.completed\n\
data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_123\",\"model\":\"gpt-4o\",\"usage\":{\"input_tokens\":10,\"output_tokens\":2}},\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"Hello\"}]}]}\n\n";

        let mut state = StreamState::default();
        let events =
            transform_stream_events(input, ApiFormat::OpenaiResponses, &mut state).unwrap();

        // Expected: message_start, content_block_start, 2x content_block_delta, content_block_stop,
        // message_delta, message_stop
        assert_eq!(events.len(), 7);
        assert!(
            matches!(&events[0], StreamEvent::MessageStart { message_id, .. } if message_id == "resp_123")
        );
        assert!(matches!(
            &events[1],
            StreamEvent::ContentBlockStart {
                index: 0,
                content_block: crate::model::ContentBlock::Text { .. },
                ..
            }
        ));
        assert!(
            matches!(&events[2], StreamEvent::ContentBlockDelta { delta: StreamDelta::Text { text }, .. } if text == "Hel")
        );
        assert!(
            matches!(&events[3], StreamEvent::ContentBlockDelta { delta: StreamDelta::Text { text }, .. } if text == "lo")
        );
        assert!(matches!(
            &events[4],
            StreamEvent::ContentBlockStop { index: 0 }
        ));
        assert!(matches!(
            &events[5],
            StreamEvent::MessageDelta {
                stop_reason: Some(StopReason::EndTurn),
                usage,
                ..
            } if usage.output_tokens == 2
        ));
        assert!(matches!(&events[6], StreamEvent::MessageStop));
    }

    #[test]
    fn test_responses_stream_to_anthropic_reasoning_maps_to_thinking() {
        let input = b"event: response.created\n\
data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_r1\",\"model\":\"gpt-4o\"}}\n\n\
event: response.output_item.added\n\
data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"content_index\":0,\"item\":{\"type\":\"message\",\"role\":\"assistant\"}}\n\n\
event: response.reasoning_text.delta\n\
data: {\"type\":\"response.reasoning_text.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"Let me think.\"}\n\n\
event: response.reasoning_text.done\n\
data: {\"type\":\"response.reasoning_text.done\",\"output_index\":0,\"content_index\":0,\"text\":\"Let me think.\"}\n\n\
event: response.output_item.added\n\
data: {\"type\":\"response.output_item.added\",\"output_index\":1,\"content_index\":0,\"item\":{\"type\":\"message\",\"role\":\"assistant\"}}\n\n\
event: response.output_text.delta\n\
data: {\"type\":\"response.output_text.delta\",\"output_index\":1,\"content_index\":0,\"delta\":\"Done.\"}\n\n\
event: response.output_text.done\n\
data: {\"type\":\"response.output_text.done\",\"output_index\":1,\"content_index\":0,\"text\":\"Done.\"}\n\n\
event: response.output_item.done\n\
data: {\"type\":\"response.output_item.done\",\"output_index\":1,\"item\":{\"type\":\"message\"}}\n\n\
event: response.completed\n\
data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_r1\",\"usage\":{\"input_tokens\":5,\"output_tokens\":3}}}\n\n";

        let mut state = StreamState::default();
        let events =
            transform_stream_events(input, ApiFormat::OpenaiResponses, &mut state).unwrap();

        // message_start, content_block_start(text), content_block_start(thinking),
        // thinking_delta, content_block_stop(thinking), content_block_start(text),
        // text_delta, content_block_stop(text), message_delta, message_stop
        assert_eq!(events.len(), 10);
        assert!(matches!(&events[0], StreamEvent::MessageStart { .. }));
        // First output_item.added creates a text content_block_start (index 0)
        assert!(matches!(
            &events[1],
            StreamEvent::ContentBlockStart {
                index: 0,
                content_block: crate::model::ContentBlock::Text { .. },
            }
        ));
        // reasoning_text.delta auto-creates a thinking content_block_start (index 1)
        assert!(matches!(
            &events[2],
            StreamEvent::ContentBlockStart {
                index: 1,
                content_block: crate::model::ContentBlock::Thinking { .. },
            }
        ));
        assert!(matches!(
            &events[3],
            StreamEvent::ContentBlockDelta {
                index: 1,
                delta: StreamDelta::Thinking { thinking },
            } if thinking == "Let me think."
        ));
        // Second output_item.added creates a text content_block_start (index 2)
        assert!(matches!(
            &events[5],
            StreamEvent::ContentBlockStart {
                index: 2,
                content_block: crate::model::ContentBlock::Text { .. },
            }
        ));
        assert!(
            matches!(&events[6], StreamEvent::ContentBlockDelta { delta: StreamDelta::Text { text }, .. } if text == "Done.")
        );
    }

    #[test]
    fn test_responses_stream_to_anthropic_function_call_maps_to_tool_use() {
        let input = b"event: response.created\n\
data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_tc1\",\"model\":\"gpt-4o\"}}\n\n\
event: response.output_item.added\n\
data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"content_index\":0,\"item\":{\"type\":\"function_call\",\"call_id\":\"fc_123\",\"name\":\"get_weather\",\"arguments\":\"\"}}\n\n\
event: response.function_call_arguments.delta\n\
data: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"{\\\"city\\\"\"}\n\n\
event: response.function_call_arguments.done\n\
data: {\"type\":\"response.function_call_arguments.done\",\"output_index\":0,\"content_index\":0,\"arguments\":\"{\\\"city\\\":\\\"Paris\\\"}\"}\n\n\
event: response.output_item.done\n\
data: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":{\"type\":\"function_call\"}}\n\n\
event: response.completed\n\
data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_tc1\",\"usage\":{\"input_tokens\":8,\"output_tokens\":5}}}\n\n";

        let mut state = StreamState::default();
        let events =
            transform_stream_events(input, ApiFormat::OpenaiResponses, &mut state).unwrap();

        // message_start, content_block_start(tool_use), input_json_delta, content_block_stop,
        // message_delta, message_stop
        assert_eq!(events.len(), 6);
        assert!(matches!(&events[0], StreamEvent::MessageStart { .. }));
        assert!(
            matches!(&events[1], StreamEvent::ContentBlockStart { content_block: crate::model::ContentBlock::ToolUse { id, name, .. }, .. } if id == "fc_123" && name == "get_weather")
        );
        assert!(
            matches!(&events[2], StreamEvent::ContentBlockDelta { delta: StreamDelta::InputJson { partial_json }, .. } if partial_json == "{\"city\"")
        );
        assert!(matches!(
            &events[3],
            StreamEvent::ContentBlockStop { index: 0 }
        ));
        assert!(matches!(
            &events[4],
            StreamEvent::MessageDelta {
                stop_reason: Some(StopReason::EndTurn),
                ..
            }
        ));
        assert!(matches!(&events[5], StreamEvent::MessageStop));
    }

    #[test]
    fn test_responses_stream_to_anthropic_incomplete_maps_to_max_tokens() {
        let input = b"event: response.created\n\
data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_inc1\",\"model\":\"gpt-4o\"}}\n\n\
event: response.output_item.added\n\
data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"content_index\":0,\"item\":{\"type\":\"message\"}}\n\n\
event: response.output_text.delta\n\
data: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"Cut of\"}\n\n\
event: response.incomplete\n\
data: {\"type\":\"response.incomplete\",\"response\":{\"id\":\"resp_inc1\",\"usage\":{\"input_tokens\":1,\"output_tokens\":1}},\"incomplete_details\":{\"reason\":\"max_tokens\"}}\n\n";

        let mut state = StreamState::default();
        let events =
            transform_stream_events(input, ApiFormat::OpenaiResponses, &mut state).unwrap();

        assert!(matches!(
            events
                .iter()
                .rev()
                .find(|e| matches!(e, StreamEvent::MessageDelta { .. })),
            Some(StreamEvent::MessageDelta {
                stop_reason: Some(StopReason::MaxTokens),
                ..
            })
        ));
    }

    #[test]
    fn test_responses_stream_to_anthropic_error_event() {
        let input = b"event: error\n\
data: {\"type\":\"error\",\"code\":\"rate_limit\",\"message\":\"Rate limit exceeded\"}\n\n";

        let mut state = StreamState::default();
        let events =
            transform_stream_events(input, ApiFormat::OpenaiResponses, &mut state).unwrap();

        assert_eq!(events.len(), 1);
        assert!(
            matches!(&events[0], StreamEvent::Error { error_type, message } if error_type == "rate_limit" && message == "Rate limit exceeded")
        );
    }

    #[test]
    fn test_responses_stream_to_anthropic_state_finished_after_completed() {
        let input = b"event: response.created\n\
data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_fin\",\"model\":\"gpt-4o\"}}\n\n\
event: response.completed\n\
data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_fin\"}}\n\n";

        let mut state = StreamState::default();
        let _ = transform_stream_events(input, ApiFormat::OpenaiResponses, &mut state).unwrap();
        assert!(state.finished);

        // Calling again after finished should return empty.
        let more = transform_stream_events(input, ApiFormat::OpenaiResponses, &mut state).unwrap();
        assert!(more.is_empty());
    }

    // -----------------------------------------------------------------------
    // Responses SSE → Anthropic SSE fixture tests
    // -----------------------------------------------------------------------

    #[derive(Debug, serde::Deserialize)]
    struct ResponsesAnthropicSseFixture {
        name: String,
        mode: String,
        input: FixtureInput,
        expected: ResponsesAnthropicSseExpected,
    }

    #[derive(Debug, serde::Deserialize)]
    struct ResponsesAnthropicSseExpected {
        downstream_sse_contains: Vec<String>,
    }

    #[allow(clippy::disallowed_methods)] // sync #[test] context; fixture files are small
    fn load_responses_anthropic_sse_fixture(path: &str) -> ResponsesAnthropicSseFixture {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let full_path = format!("{manifest_dir}/../../{path}");
        let content = std::fs::read_to_string(&full_path)
            .unwrap_or_else(|e| panic!("fixture file {full_path}: {e}"));
        serde_json::from_str(&content).expect("fixture JSON")
    }

    #[test]
    fn test_fixture_responses_to_anthropic_stream_text() {
        let fixture = load_responses_anthropic_sse_fixture(
            "fixtures/protocol-transform/responses-to-anthropic/stream-text.json",
        );
        assert_eq!(fixture.mode, "stream");

        let input_sse = fixture_events_to_sse(&fixture.input.events);
        let mut state = StreamState::default();
        let downstream_sse = String::from_utf8(
            transform_stream_events(&input_sse, ApiFormat::OpenaiResponses, &mut state)
                .unwrap()
                .into_iter()
                .flat_map(|ev| events_to_sse(&[ev]))
                .collect::<Vec<u8>>(),
        )
        .unwrap();

        for expected in &fixture.expected.downstream_sse_contains {
            assert!(
                downstream_sse.contains(expected),
                "missing downstream SSE fragment in {}: {}\n---\n{}",
                fixture.name,
                expected,
                downstream_sse
            );
        }
    }

    #[test]
    fn test_fixture_responses_to_anthropic_stream_tool_use() {
        let fixture = load_responses_anthropic_sse_fixture(
            "fixtures/protocol-transform/responses-to-anthropic/stream-tool-use.json",
        );
        assert_eq!(fixture.mode, "stream");

        let input_sse = fixture_events_to_sse(&fixture.input.events);
        let mut state = StreamState::default();
        let downstream_sse = String::from_utf8(
            transform_stream_events(&input_sse, ApiFormat::OpenaiResponses, &mut state)
                .unwrap()
                .into_iter()
                .flat_map(|ev| events_to_sse(&[ev]))
                .collect::<Vec<u8>>(),
        )
        .unwrap();

        for expected in &fixture.expected.downstream_sse_contains {
            assert!(
                downstream_sse.contains(expected),
                "missing downstream SSE fragment in {}: {}\n---\n{}",
                fixture.name,
                expected,
                downstream_sse
            );
        }
    }

    // Internal accumulator for OpenAI tool call fragments (original dead code preserved).
    #[derive(Debug, Default)]
    #[allow(dead_code)]
    struct OpenAiToolCallAccum {
        args: String,
    }

    // -----------------------------------------------------------------------
    // Spec 92: Cache & Reasoning Token Fields — TDD streaming tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_anthropic_stream_to_openai_includes_cache_read_input_tokens() {
        let input = b"event: message_start\n\
data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_123\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"qwen-plus-anthropic\",\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":100,\"output_tokens\":0,\"cache_read_input_tokens\":50,\"cache_creation_input_tokens\":30}}}\n\n\
event: content_block_start\n\
data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n\
event: content_block_delta\n\
data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n\
event: content_block_stop\n\
data: {\"type\":\"content_block_stop\",\"index\":0}\n\n\
event: message_delta\n\
data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":20}}\n\n\
event: message_stop\n\
data: {\"type\":\"message_stop\"}\n\n";

        let mut state = StreamState::default();
        let sse = transform_stream_to_openai_sse(input, ApiFormat::AnthropicMessages, &mut state)
            .unwrap();
        let text = String::from_utf8(sse).unwrap();

        assert!(
            text.contains("\"cached_tokens\":50"),
            "expected cached_tokens: 50 in OpenAI output, got:\n{}",
            text
        );
    }

    #[test]
    fn test_openai_stream_to_anthropic_includes_cache_and_reasoning_tokens() {
        let input = b"data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n\
                      data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":20,\"prompt_tokens_details\":{\"cached_tokens\":80},\"completion_tokens_details\":{\"reasoning_tokens\":10}}}\n\n\
                      data: [DONE]\n\n";

        let mut state = StreamState::default();
        let events = transform_stream_events(input, ApiFormat::OpenaiChat, &mut state).unwrap();

        let message_delta = events
            .iter()
            .find(|e| matches!(e, StreamEvent::MessageDelta { .. }))
            .expect("should have message_delta");
        let StreamEvent::MessageDelta { usage, .. } = message_delta else {
            unreachable!()
        };
        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 20);
        assert_eq!(usage.cached_tokens, 80);
        assert_eq!(usage.reasoning_tokens, 10);
    }
}
