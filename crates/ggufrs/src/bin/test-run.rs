//! # test-run — 目視確認用バイナリ
//!
//! ggufrs crate の機能を手動で確認するためのバイナリ。
//! コマンドライン引数で実行するパターンを選択できる。
//!
//! ## 実行方法
//!
//! ```bash
//! # 全パターン実行
//! cargo run --bin test-run
//!
//! # 特定パターンのみ実行
//! cargo run --bin test-run -- 1
//! cargo run --bin test-run -- 1 2
//! ```
//!
//! ## パターン一覧
//!
//! 1. Structured Output（JSON Schema 制約付き生成）
//! 2. Text Generation（通常テキスト生成）
//! 3. Streaming Generation（ストリーミング生成）

use std::io::Write;
use std::time::Instant;

use anyhow::Result;
use futures::StreamExt;

pub use ggufrs::*;

/// セパレーター線とラベルを表示する
fn print_separator(title: &str) {
    println!("\n{}", "=".repeat(60));
    println!("  {title}");
    println!("{}", "=".repeat(60));
}

/// 経過時間をミリ秒単位で表示する
fn print_elapsed(label: &str, start: Instant) {
    let elapsed = start.elapsed();
    println!("  ⏱ {label}: {}.{:03}秒",
        elapsed.as_secs(),
        elapsed.subsec_millis());
}

/// 実行するパターンをコマンドライン引数から読み取る
///
/// 引数なし → 全パターン実行
/// 引数あり → 指定された番号のパターンのみ実行（例: `1`, `1 3`）
fn parse_patterns() -> Vec<u32> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() <= 1 {
        return vec![1, 2, 3];
    }
    args[1..]
        .iter()
        .filter_map(|a| a.parse::<u32>().ok())
        .filter(|&n| n >= 1 && n <= 3)
        .collect()
}

/// パターン1: Structured Output（JSON Schema 拘束付き生成）
async fn run_pattern1(engine: &ggufrs::GgufEngine) -> (bool, std::time::Duration) {
    print_separator("Pattern 1: Structured Output (JSON Schema)");
    let start = Instant::now();

    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "corrected_text": {"type": "string"},
            "was_modified": {"type": "boolean"},
            "correction_notes": {"type": "string"}
        },
        "required": ["corrected_text", "was_modified", "correction_notes"]
    });

    let ok = match engine
        .generate_structured(
            "gemma4-e2b",
            "きのうのごうどうをていしゅつしました",
            GenerateParams {
                temperature: Some(0.1),
                max_tokens: Some(128),
                // [::STUB::] M6-5: enable_thinking 削除。M6-13 の本改修時に復元判断。
                ..GenerateParams::default()
            },
            schema,
        )
        .await
    {
        Ok(value) => {
            println!("  Result: {value:#}");
            true
        }
        Err(e) => {
            eprintln!("  FAIL: {e}");
            false
        }
    };
    let elapsed = start.elapsed();
    print_elapsed("Pattern 1", start);
    (ok, elapsed)
}

/// パターン2: 通常テキスト生成
async fn run_pattern2(engine: &ggufrs::GgufEngine) -> (bool, std::time::Duration) {
    print_separator("Pattern 2: Text Generation");
    let start = Instant::now();

    let ok = match engine
        .generate(
            "gemma4-e2b",
            "Rustの所有権システムについて簡単に説明してください。",
            GenerateParams {
                temperature: Some(0.3),
                max_tokens: Some(256),
                // [::STUB::] M6-5: enable_thinking 削除。M6-13 の本改修時に復元判断。
                ..GenerateParams::default()
            },
        )
        .await
    {
        Ok(text) => {
            println!("  {text}");
            true
        }
        Err(e) => {
            eprintln!("  FAIL: {e}");
            false
        }
    };
    let elapsed = start.elapsed();
    print_elapsed("Pattern 2", start);
    (ok, elapsed)
}

/// パターン3: ストリーミング生成
async fn run_pattern3(engine: &ggufrs::GgufEngine) -> (bool, std::time::Duration) {
    print_separator("Pattern 3: Streaming Generation");
    let start = Instant::now();

    let ok = match engine
        .generate_stream(
            "gemma4-e2b",
            "あなたの名前を教えてください。短く自己紹介してください。",
            GenerateParams {
                temperature: Some(0.5),
                max_tokens: Some(128),
                // [::STUB::] M6-5: enable_thinking 削除。M6-13 の本改修時に復元判断。
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
                        let _ = std::io::stdout().flush();
                    }
                    Err(e) => {
                        eprintln!("\n  Stream error: {e}");
                        break;
                    }
                }
            }
            println!();
            true
        }
        Err(e) => {
            eprintln!("  FAIL: {e}");
            false
        }
    };
    let elapsed = start.elapsed();
    print_elapsed("Pattern 3", start);
    (ok, elapsed)
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let patterns = parse_patterns();
    if patterns.is_empty() {
        eprintln!("Usage: cargo run --bin test-run [1|2|3 ...]");
        std::process::exit(1);
    }

    // ----------------------------------------------------------------
    // GgufEngine 初期化（CPU-Only, Gemma4 E2B）
    // ----------------------------------------------------------------
    print_separator("Initializing GgufEngine");

    let config = GgufConfig {
        models: vec![ModelConfig::gemma4_e2b()],
        server: ServerConfig {
            bind: "127.0.0.1:0".parse()?,
            models: vec!["gemma4-e2b".into()],
            auto_start_server: false,
        },
        gpu: GpuConfig {
            provider: GpuProvider::Cpu,
            cpu_only: true,
        },
    };

    let engine = GgufEngine::new(config).await?;
    println!("✓ GgufEngine initialized successfully");
    println!("  Model: Gemma4 E2B (UQFF Q4K, ~3.1GB)");

    // 選択されたパターンを実行する
    let mut results: Vec<(u32, bool, std::time::Duration)> = Vec::new();

    for &pattern in &patterns {
        let (ok, elapsed) = match pattern {
            1 => run_pattern1(&engine).await,
            2 => run_pattern2(&engine).await,
            3 => run_pattern3(&engine).await,
            _ => unreachable!(),
        };
        results.push((pattern, ok, elapsed));
    }

    // ----------------------------------------------------------------
    // サマリー表示
    // ----------------------------------------------------------------
    print_separator("Summary");
    for (pattern, ok, elapsed) in &results {
        let label = match pattern {
            1 => "Pattern 1 (Structured Output)",
            2 => "Pattern 2 (Text Generation)",
            3 => "Pattern 3 (Streaming)",
            _ => unreachable!(),
        };
        println!(
            "  {:<35} {}  ({}ms)",
            label,
            if *ok { "PASS" } else { "FAIL" },
            elapsed.as_millis(),
        );
    }
    println!();

    Ok(())
}
