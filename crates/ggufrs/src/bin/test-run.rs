//! # test-run — 目視確認用バイナリ
//!
//! ggufrs crate の機能を手動で確認するためのバイナリ。
//! 3パターンの推論を順次実行し、結果とサマリーを表示する。
//!
//! ## 実行方法
//!
//! ```bash
//! cargo run --bin test-run
//! ```
//!
//! ## 実行パターン
//!
//! 1. Structured Output（JSON Schema 制約付き生成）
//! 2. Text Generation（通常テキスト生成）
//! 3. Streaming Generation（ストリーミング生成）

use std::io::Write;

use anyhow::Result;
use futures::StreamExt;

pub use ggufrs::*;

/// セパレーター線とラベルを表示する
fn print_separator(title: &str) {
    println!("\n{}", "=".repeat(60));
    println!("  {title}");
    println!("{}", "=".repeat(60));
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    // ----------------------------------------------------------------
    // GgufEngine 初期化（CPU-Only, Qwen3.5-0.8B + Qwen3.5-2B）
    // ----------------------------------------------------------------
    print_separator("Initializing GgufEngine");

    let config = GgufConfig {
        models: vec![ModelConfig::qwen3_5_0_8b(), ModelConfig::qwen3_5_2b()],
        server: ServerConfig {
            bind: "127.0.0.1:0".parse()?,
            models: vec!["qwen3.5-0.8b".into(), "qwen3.5-2b".into()],
            auto_start_server: false,
        },
        gpu: GpuConfig {
            provider: GpuProvider::Cpu,
            cpu_only: true,
        },
    };

    let engine = GgufEngine::new(config).await?;
    println!("✓ GgufEngine initialized successfully");
    println!("  0.8B model: Qwen3.5-0.8B-Q4_K_M");
    println!("  2B model:   Qwen3.5-2B-Q4_K_M");

    // 3パターンの成否を記録する
    let mut pattern1_ok = false;
    let mut pattern2_ok = false;
    let mut pattern3_ok = false;

    // ----------------------------------------------------------------
    // パターン1: Structured Output（JSON Schema 拘束付き生成）
    // ----------------------------------------------------------------
    print_separator("Pattern 1: Structured Output (JSON Schema)");

    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "corrected_text": {"type": "string"},
            "was_modified": {"type": "boolean"},
            "correction_notes": {"type": "string"}
        },
        "required": ["corrected_text", "was_modified", "correction_notes"]
    });

    match engine
        .generate_structured(
            "qwen3.5-0.8b",
            "きのうのごうどうをていしゅつしました",
            GenerateParams::default(),
            schema,
        )
        .await
    {
        Ok(value) => {
            println!("  Result: {value:#}");
            pattern1_ok = true;
        }
        Err(e) => {
            eprintln!("  FAIL: {e}");
        }
    }

    // ----------------------------------------------------------------
    // パターン2: 通常テキスト生成
    // ----------------------------------------------------------------
    print_separator("Pattern 2: Text Generation");

    match engine
        .generate(
            "qwen3.5-0.8b",
            "Rustの所有権システムについて簡単に説明してください。",
            GenerateParams {
                temperature: Some(0.3),
                max_tokens: Some(512),
                ..GenerateParams::default()
            },
        )
        .await
    {
        Ok(text) => {
            println!("  {text}");
            pattern2_ok = true;
        }
        Err(e) => {
            eprintln!("  FAIL: {e}");
        }
    }

    // ----------------------------------------------------------------
    // パターン3: ストリーミング生成
    // ----------------------------------------------------------------
    print_separator("Pattern 3: Streaming Generation");

    match engine
        .generate_stream(
            "qwen3.5-0.8b",
            "あなたの名前を教えてください。短く自己紹介してください。",
            GenerateParams {
                temperature: Some(0.5),
                max_tokens: Some(256),
                ..GenerateParams::default()
            },
        )
        .await
    {
        Ok(mut stream) => {
            print!("  ");
            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(text) => {
                        print!("{text}");
                        std::io::stdout().flush()?;
                    }
                    Err(e) => {
                        eprintln!("\n  Stream error: {e}");
                        break;
                    }
                }
            }
            println!();
            pattern3_ok = true;
        }
        Err(e) => {
            eprintln!("  FAIL: {e}");
        }
    }

    // ----------------------------------------------------------------
    // サマリー表示
    // ----------------------------------------------------------------
    print_separator("Summary");
    println!(
        "  Pattern 1 (Structured Output):  {}",
        if pattern1_ok { "PASS" } else { "FAIL" }
    );
    println!(
        "  Pattern 2 (Text Generation):    {}",
        if pattern2_ok { "PASS" } else { "FAIL" }
    );
    println!(
        "  Pattern 3 (Streaming):          {}",
        if pattern3_ok { "PASS" } else { "FAIL" }
    );
    println!();

    Ok(())
}
