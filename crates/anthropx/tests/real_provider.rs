//! # Real provider E2E integration tests (RFC §12)
//!
//! 実際の upstream provider に対して anthropx を中継してリクエストを送信し、
//! エンドツーエンドの動作を検証する。
//!
//! ## テスト対象
//!
//! - **transparent モード**: Anthropic 互換 API にそのまま中継（DeepSeek 等）
//! - **translate モード**: llm-bridge-core で OpenAI 形式に変換して送信（M3-5 実装後に有効化）
//!
//! ## 実行方法
//!
//! ```bash
//! # DeepSeek（Anthropic 互換）
//! DEEPSEEK_API_KEY=sk-... cargo test --test real_provider -- --nocapture
//! ```
//!
//! 環境変数:
//! - `DEEPSEEK_API_KEY` — DeepSeek API key（必須）
//! - `DEEPSEEK_BASE_URL` — DeepSeek API URL（省略時: https://api.deepseek.com）

use std::collections::BTreeMap;
use std::time::Instant;

use tokio_util::sync::CancellationToken;

use anthropx::app_state::AppState;
use anthropx::config::{AppConfig, ModelConfig, ProviderConfig};
use anthropx::http::router::build_router;

/// 環境変数から API key を読み取り、未設定なら案内して None を返す。
fn load_api_key() -> Option<String> {
    match std::env::var("DEEPSEEK_API_KEY") {
        Ok(key) if !key.is_empty() => Some(key),
        _ => {
            eprintln!("------------------------------------------------------------------------");
            eprintln!("  M4-4: Real provider tests SKIPPED");
            eprintln!("  Required env vars:");
            eprintln!(
                "    DEEPSEEK_API_KEY=sk-...             DeepSeek API key (anthropic-compatible)"
            );
            eprintln!(
                "    DEEPSEEK_BASE_URL=https://...       (optional, default: https://api.deepseek.com)"
            );
            eprintln!("  Run:");
            eprintln!("    DEEPSEEK_API_KEY=sk-... cargo test --test real_provider -- --nocapture");
            eprintln!("------------------------------------------------------------------------");
            None
        }
    }
}

/// テスト用の AppState を構築する（transparent モード）。
fn build_proxy_state(api_key: &str) -> AppState {
    let base_url = std::env::var("DEEPSEEK_BASE_URL")
        .unwrap_or_else(|_| "https://api.deepseek.com".to_string());

    let mut config = AppConfig::default();
    config.providers.insert(
        "deepseek".to_string(),
        ProviderConfig {
            transparent: true,
            base_url,
            api_keys: vec![api_key.to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: None,
            max_in_flight: Some(1),
            max_queue: Some(1),
            model_aliases: BTreeMap::new(),
            models: vec![ModelConfig {
                public: "deepseek-chat".to_string(),
                upstream: "deepseek-chat".to_string(),
                enabled: true,
                tags: vec![],
                max_tokens_cap: Some(256),
                aliases: vec![],
            }],
        },
    );

    let providers = anthropx::lifecycle::build_provider_clients(&config);

    AppState::new(config, providers, CancellationToken::new())
}

/// anthropx を中継して DeepSeek にリクエストを送信し、結果を詳細に表示する。
async fn run_transparent_test(provider: &str, model: &str, body: serde_json::Value) {
    let Some(api_key) = load_api_key() else {
        return;
    };

    let state = std::sync::Arc::new(build_proxy_state(&api_key));
    let router = build_router(state);
    let server = axum_test::TestServer::new(router);

    let start = Instant::now();
    let resp = server.post("/v1/messages").json(&body).await;
    let elapsed = start.elapsed();
    let code = resp.status_code().as_u16();
    let body_str = resp.text();

    println!("========================================");
    println!("  Test:     transparent {provider}/{model}");
    println!("  Status:   {code} {status}", status = resp.status_code());
    println!("  Elapsed:  {elapsed:.2?}");
    println!("  Body:");
    for line in body_str.lines() {
        println!("    {line}");
    }
    println!("========================================");

    assert_eq!(code, 200, "expected 200, got {code}\n  body: {body_str}");
}

// ---------------------------------------------------------------------------
// DeepSeek: transparent non-stream
// ---------------------------------------------------------------------------

/// DeepSeek（Anthropic 互換）に対して transparent non-stream の E2E テストを実行する。
///
/// このテストは integration-test feature が有効な場合のみ実行される。
/// CI ではこの feature を有効化しないため、実 API key が必要なテストはスキップされる。
#[tokio::test]
#[cfg_attr(not(feature = "integration-test"), ignore)]
async fn deepseek_transparent_non_stream() {
    run_transparent_test(
        "deepseek",
        "deepseek-chat",
        serde_json::json!({
            "model": "deepseek/deepseek-chat",
            "messages": [
                {"role": "user", "content": "Say hello in one word"}
            ],
            "max_tokens": 16
        }),
    )
    .await;
}
