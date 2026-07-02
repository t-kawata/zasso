// 离线验证 CLI 工具 — 为 Python 验证脚本提供协议转换接口
//
// 用法:
//   cargo run --example validate-cli -- transform-request --direction anthropic-to-openai <
// input.json   cargo run --example validate-cli -- transform-stream --direction openai-to-anthropic
// < frames.txt

use std::{
    collections::HashMap,
    io::{self, Read, Write},
};

use bytes::Bytes;
use llm_bridge_core::{
    model::{ApiFormat, StreamState, TransformRequest},
    transform::{
        anthropic_to_openai, anthropic_to_openai_responses, openai_to_anthropic,
        responses_to_anthropic, responses_to_openai,
    },
};

fn main() {
    let mut args = std::env::args().skip(1);
    let subcommand = args.next().unwrap_or_else(|| {
        eprintln!("expected subcommand: transform-request or transform-stream");
        std::process::exit(2);
    });

    match subcommand.as_str() {
        "transform-request" => cmd_transform_request(&mut args),
        "transform-stream" => cmd_transform_stream(&mut args),
        other => {
            eprintln!("unknown subcommand: {other}");
            std::process::exit(2);
        }
    }
}

fn parse_direction(args: &mut impl Iterator<Item = String>) -> String {
    let mut direction = String::new();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--direction" => {
                direction = args.next().unwrap_or_else(|| {
                    eprintln!("--direction requires a value");
                    std::process::exit(2);
                });
            }
            other => {
                eprintln!("unknown flag: {other}");
                std::process::exit(2);
            }
        }
    }
    if direction.is_empty() {
        eprintln!("--direction is required");
        std::process::exit(2);
    }
    direction
}

fn cmd_transform_request(args: &mut impl Iterator<Item = String>) {
    let direction = parse_direction(args);

    let mut stdin_data = String::new();
    io::stdin()
        .read_to_string(&mut stdin_data)
        .unwrap_or_else(|e| {
            eprintln!("failed to read stdin: {e}");
            std::process::exit(1);
        });

    let input: serde_json::Value = match serde_json::from_str(&stdin_data) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("invalid JSON input: {e}");
            std::process::exit(1);
        }
    };

    let headers: HashMap<String, String> = input["headers"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string()))
                .collect()
        })
        .unwrap_or_default();

    let path = input["path"].as_str().unwrap_or("").to_string();
    let body_bytes = Bytes::from(serde_json::to_vec(&input["body"]).unwrap_or_default());

    let req = TransformRequest {
        headers,
        path,
        body: body_bytes,
    };

    let result = match direction.as_str() {
        "anthropic-to-openai" => anthropic_to_openai(&req),
        "openai-to-anthropic" => openai_to_anthropic(&req),
        "anthropic-to-responses" => anthropic_to_openai_responses(&req),
        "responses-to-anthropic" => responses_to_anthropic(&req),
        "responses-to-openai" => responses_to_openai(&req),
        other => {
            eprintln!("unsupported direction: {other}");
            std::process::exit(2);
        }
    };

    match result {
        Ok(resp) => {
            let output = serde_json::json!({
                "headers": resp.headers,
                "path": resp.path,
                "body": serde_json::from_slice::<serde_json::Value>(&resp.body).unwrap_or(serde_json::Value::Null),
            });
            serde_json::to_writer(io::stdout(), &output).unwrap_or_else(|e| {
                eprintln!("failed to write output: {e}");
                std::process::exit(1);
            });
        }
        Err(e) => {
            eprintln!("transform error: {e}");
            std::process::exit(1);
        }
    }
}

fn cmd_transform_stream(args: &mut impl Iterator<Item = String>) {
    let direction = parse_direction(args);

    let mut stdin_data = Vec::new();
    io::stdin()
        .read_to_end(&mut stdin_data)
        .unwrap_or_else(|e| {
            eprintln!("failed to read stdin: {e}");
            std::process::exit(1);
        });

    let source = match direction.as_str() {
        "openai-to-anthropic" | "openai-chat-to-responses" => ApiFormat::OpenaiChat,
        "anthropic-to-openai" | "anthropic-to-responses" => ApiFormat::AnthropicMessages,
        "responses-to-anthropic" => ApiFormat::OpenaiResponses,
        other => {
            eprintln!("unsupported direction: {other}");
            std::process::exit(2);
        }
    };

    let target = match direction.as_str() {
        "anthropic-to-openai" => "openai",
        "openai-to-anthropic" | "responses-to-anthropic" => "anthropic",
        "anthropic-to-responses" | "openai-chat-to-responses" => "responses",
        _ => unreachable!(),
    };

    let mut state = StreamState::default();

    let output: Result<Vec<u8>, _> = match target {
        "openai" => {
            llm_bridge_core::stream::transform_stream_to_openai_sse(&stdin_data, source, &mut state)
        }
        "anthropic" => llm_bridge_core::stream::transform_stream_to_anthropic_sse(
            &stdin_data,
            source,
            &mut state,
        ),
        "responses" => llm_bridge_core::stream::transform_stream_to_openai_responses_sse(
            &stdin_data,
            source,
            &mut state,
        ),
        _ => unreachable!(),
    };

    match output {
        Ok(bytes) => {
            io::stdout().write_all(&bytes).unwrap_or_else(|e| {
                eprintln!("failed to write output: {e}");
                std::process::exit(1);
            });
        }
        Err(e) => {
            eprintln!("transform error: {e}");
            std::process::exit(1);
        }
    }
}
