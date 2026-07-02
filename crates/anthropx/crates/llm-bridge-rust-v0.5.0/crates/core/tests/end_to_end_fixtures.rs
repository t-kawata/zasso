use std::collections::HashMap;

use bytes::Bytes;
use llm_bridge_core::{
    model::{ApiFormat, StreamState, TransformRequest, TransformResponse},
    stream::{events_to_sse, transform_stream_events},
    transform::{anthropic_to_openai, openai_response_to_anthropic_message},
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Fixture {
    name: String,
    mode: String,
    input: FixtureInput,
    expected: FixtureExpected,
}

#[derive(Debug, Deserialize)]
struct FixtureInput {
    #[serde(default)]
    anthropic_request: Option<FixtureRequest>,
    #[serde(default)]
    openai_request: Option<FixtureRequest>,
    #[serde(default)]
    upstream_response_body: Option<serde_json::Value>,
    #[serde(default)]
    upstream_events: Vec<FixtureEvent>,
}

#[derive(Debug, Deserialize)]
struct FixtureRequest {
    headers: HashMap<String, String>,
    path: String,
    body: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct FixtureEvent {
    raw_sse: String,
}

#[derive(Debug, Deserialize)]
struct FixtureExpected {
    openai_request_path: String,
    openai_request_body: serde_json::Value,
    #[serde(default)]
    anthropic_response_body: Option<serde_json::Value>,
    #[serde(default)]
    downstream_sse_contains: Vec<String>,
}

#[allow(clippy::disallowed_methods)] // sync #[test] context; fixture files are small
fn load_fixture(path: &str) -> Fixture {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let full_path = format!("{manifest_dir}/../../{path}");
    let content =
        std::fs::read_to_string(&full_path).unwrap_or_else(|e| panic!("{full_path}: {e}"));
    serde_json::from_str(&content).expect("fixture JSON parse")
}

fn assert_json_subset(actual: &serde_json::Value, expected: &serde_json::Value, name: &str) {
    match (actual, expected) {
        (serde_json::Value::Object(a), serde_json::Value::Object(e)) => {
            for (k, ev) in e {
                let av = a
                    .get(k)
                    .unwrap_or_else(|| panic!("missing key '{k}' in {name}"));
                assert_json_subset(av, ev, &format!("{name}.{k}"));
            }
        }
        (serde_json::Value::Array(a), serde_json::Value::Array(e)) => {
            assert_eq!(a.len(), e.len(), "array length mismatch in {name}");
            for (idx, (av, ev)) in a.iter().zip(e.iter()).enumerate() {
                assert_json_subset(av, ev, &format!("{name}[{idx}]"));
            }
        }
        (a, e) => assert_eq!(a, e, "value mismatch in {name}"),
    }
}

fn upstream_events_to_sse(events: &[FixtureEvent]) -> Vec<u8> {
    let mut out = Vec::new();
    for event in events {
        out.extend_from_slice(event.raw_sse.as_bytes());
        out.extend_from_slice(b"\n\n");
    }
    out
}

fn run_fixture(path: &str) {
    let fixture = load_fixture(path);
    let openai_request = if let Some(anthropic_request) = &fixture.input.anthropic_request {
        let anthropic_request = TransformRequest {
            headers: anthropic_request.headers.clone(),
            path: anthropic_request.path.clone(),
            body: Bytes::from(serde_json::to_vec(&anthropic_request.body).unwrap()),
        };

        anthropic_to_openai(&anthropic_request)
            .unwrap_or_else(|e| panic!("anthropic_to_openai failed for {}: {e}", fixture.name))
    } else if let Some(openai_request) = &fixture.input.openai_request {
        TransformResponse {
            headers: openai_request.headers.clone(),
            path: openai_request.path.clone(),
            body: Bytes::from(serde_json::to_vec(&openai_request.body).unwrap()),
            conversion_trail: vec![ApiFormat::OpenaiChat],
        }
    } else {
        panic!(
            "fixture {} must provide either input.anthropic_request or input.openai_request",
            fixture.name
        );
    };

    assert_eq!(openai_request.path, fixture.expected.openai_request_path);
    let openai_body: serde_json::Value = serde_json::from_slice(&openai_request.body).unwrap();
    assert_json_subset(
        &openai_body,
        &fixture.expected.openai_request_body,
        &format!("{}.openai_request_body", fixture.name),
    );

    match fixture.mode.as_str() {
        "non_stream" => {
            let upstream_body = fixture
                .input
                .upstream_response_body
                .as_ref()
                .unwrap_or_else(|| panic!("missing upstream_response_body in {}", fixture.name));
            let upstream_response = TransformRequest {
                headers: openai_request.headers.clone(),
                path: openai_request.path.clone(),
                body: Bytes::from(serde_json::to_vec(upstream_body).unwrap()),
            };
            let anthropic_response = openai_response_to_anthropic_message(&upstream_response)
                .unwrap_or_else(|e| {
                    panic!(
                        "openai_response_to_anthropic_message failed for {}: {e}",
                        fixture.name
                    )
                });
            let anthropic_body: serde_json::Value =
                serde_json::from_slice(&anthropic_response.body).unwrap();
            let expected = fixture.expected.anthropic_response_body.as_ref().unwrap();
            assert_json_subset(
                &anthropic_body,
                expected,
                &format!("{}.anthropic_response_body", fixture.name),
            );
        }
        "stream" => {
            let input_sse = upstream_events_to_sse(&fixture.input.upstream_events);
            let mut state = StreamState::default();
            let events = transform_stream_events(&input_sse, ApiFormat::OpenaiChat, &mut state)
                .unwrap_or_else(|e| {
                    panic!("transform_stream_events failed for {}: {e}", fixture.name)
                });
            let downstream_sse = String::from_utf8(events_to_sse(&events)).unwrap();
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
        other => panic!("unsupported fixture mode in {}: {other}", fixture.name),
    }
}

#[test]
fn test_e2e_non_stream_thinking_tool_use() {
    run_fixture(
        "fixtures/protocol-transform/end-to-end/anthropic-openai-non-stream-thinking-tool-use.json",
    );
}

#[test]
fn test_e2e_stream_thinking_tool_use() {
    run_fixture(
        "fixtures/protocol-transform/end-to-end/anthropic-openai-stream-thinking-tool-use.json",
    );
}

#[test]
fn test_e2e_real_log_stream_final_answer() {
    run_fixture("fixtures/protocol-transform/end-to-end/openai-real-log-stream-final-answer.json");
}
