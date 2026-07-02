//! # test-oneshot — ワンショット推論テストバイナリ
//!
//! ggufrs crate のビルトインモデルを使用して、コマンドラインから
//! システムプロンプト・ユーザープロンプト・思考モードON/OFF を指定し、
//! ワンショット（非ストリーミング）推論を行うためのバイナリ。
//!
//! ## 実行方法
//!
//! ```bash
//! # 最小構成（システムプロンプトなし、思考モードOFF）
//! cargo run --bin test-oneshot -- --model=gemma4-e2b --prompt="こんにちは"
//!
//! # システムプロンプト指定
//! cargo run --bin test-oneshot -- \
//!   --model=gemma4-e2b \
//!   --system-prompt="あなたは親切なアシスタントです。" \
//!   --prompt="Rustの特徴を教えてください。"
//!
//! # 思考モードON
//! cargo run --bin test-oneshot -- \
//!   --model=qwen3.5-0.8b \
//!   --thinking \
//!   --prompt="2+2を計算してください。"
//!
//! # パラメータ指定
//! cargo run --bin test-oneshot -- \
//!   --model=gemma4-e2b \
//!   --temperature=0.8 \
//!   --max-tokens=1024 \
//!   --prompt="自己紹介してください。"
//! ```
//!
//! ## 利用可能モデル
//!
//! - `gemma4-e2b` — Gemma4 E2B（UQFF Q4K, ≈3.1GB）
//! - `gemma4-e4b` — Gemma4 E4B（UQFF Q4K, ≈5.0GB）
//! - `qwen3.5-0.8b` — Qwen3.5 0.8B（GGUF Q4_K_M, ≈600MB）
//! - `qwen3.5-2b` — Qwen3.5 2B（GGUF Q4_K_M, ≈1.2GB）

use std::time::Instant;

use anyhow::{anyhow, Context, Result};

pub use ggufrs::*;

// ── 定数 ──

/// デフォルトの温度パラメータ
///
/// 補正タスク向けに低めに設定する（test-run と同一値）。
const DEFAULT_TEMPERATURE: f32 = 0.3;

/// デフォルトの最大生成トークン数
const DEFAULT_MAX_TOKENS: u32 = 256;

/// 利用可能モデル一覧のヘルプ文字列
const AVAILABLE_MODELS_HELP: &str = "gemma4-e2b, gemma4-e4b, qwen3.5-0.8b, qwen3.5-2b";

/// 温度パラメータの最小値
const TEMPERATURE_MIN: f32 = 0.0;

/// 温度パラメータの最大値
const TEMPERATURE_MAX: f32 = 2.0;

// ── 型定義 ──

/// コマンドライン引数
struct CliArgs {
    /// モデル名（必須）
    model_name: String,
    /// システムプロンプト（省略可）
    system_prompt: Option<String>,
    /// ユーザープロンプト（必須）
    prompt: String,
    /// 温度パラメータ
    temperature: f32,
    /// 最大生成トークン数
    max_tokens: u32,
    /// 思考モード（true: ON, false: OFF）
    thinking: bool,
}

// ── 引数パース ──

/// コマンドライン引数をパースする
///
/// 手動パース方式（test-chat / test-run と同一スタイル）。
/// clap 等の外部クレートは使用しない。
fn parse_args() -> Result<CliArgs> {
    let args: Vec<String> = std::env::args().collect();
    let mut model_name = None;
    let mut system_prompt = None;
    let mut prompt = None;
    let mut temperature = DEFAULT_TEMPERATURE;
    let mut max_tokens = DEFAULT_MAX_TOKENS;
    let mut thinking = false;

    let mut i = 1;
    while i < args.len() {
        let arg = &args[i];
        if let Some(value) = arg.strip_prefix("--model=") {
            model_name = Some(value.to_string());
        } else if let Some(value) = arg.strip_prefix("--system-prompt=") {
            system_prompt = Some(value.to_string());
        } else if let Some(value) = arg.strip_prefix("--prompt=") {
            prompt = Some(value.to_string());
        } else if let Some(value) = arg.strip_prefix("--temperature=") {
            temperature = value
                .parse::<f32>()
                .context("--temperature は数値で指定してください")?;
        } else if let Some(value) = arg.strip_prefix("--max-tokens=") {
            max_tokens = value
                .parse::<u32>()
                .context("--max-tokens は数値で指定してください")?;
        } else if arg == "--thinking" {
            thinking = true;
        } else if arg == "--no-thinking" {
            thinking = false;
        } else if arg == "--help" || arg == "-h" {
            print_usage();
            std::process::exit(0);
        } else {
            anyhow::bail!(
                "不明な引数: {arg}\n\n\
                使用法:\n  \
                 cargo run --bin test-oneshot -- --model=<NAME> --prompt=<TEXT> \
                 [--system-prompt=<TEXT>] [--temperature=<F>] [--max-tokens=<N>] \
                 [--thinking | --no-thinking]"
            );
        }
        i += 1;
    }

    let model_name = model_name.context(
        "--model は必須です。利用可能: gemma4-e2b, gemma4-e4b, qwen3.5-0.8b, qwen3.5-2b",
    )?;

    let prompt = prompt.context("--prompt は必須です")?;

    // 温度パラメータの範囲検証
    if !(TEMPERATURE_MIN..=TEMPERATURE_MAX).contains(&temperature) {
        anyhow::bail!(
            "--temperature は {TEMPERATURE_MIN}〜{TEMPERATURE_MAX} の範囲で指定してください\
             （指定値: {temperature}）"
        );
    }

    Ok(CliArgs {
        model_name,
        system_prompt,
        prompt,
        temperature,
        max_tokens,
        thinking,
    })
}

/// 使用方法を表示する
fn print_usage() {
    eprintln!("ワンショット推論テストバイナリ — ggufrs ビルトインモデルを使用した単発推論");
    eprintln!();
    eprintln!("使用法:");
    eprintln!("  cargo run --bin test-oneshot -- --model=<NAME> --prompt=<TEXT> [オプション]");
    eprintln!();
    eprintln!("必須引数:");
    eprintln!("  --model=<NAME>        モデル名");
    eprintln!("  --prompt=<TEXT>       ユーザープロンプト");
    eprintln!();
    eprintln!("オプション引数:");
    eprintln!("  --system-prompt=<TEXT> システムプロンプト（デフォルト: なし）");
    eprintln!(
        "  --temperature=<F>     温度パラメータ（デフォルト: \
         {DEFAULT_TEMPERATURE}, 範囲: {TEMPERATURE_MIN}-{TEMPERATURE_MAX}）"
    );
    eprintln!(
        "  --max-tokens=<N>      最大生成トークン数（デフォルト: \
         {DEFAULT_MAX_TOKENS}）"
    );
    eprintln!("  --thinking            思考モードON（デフォルト: OFF）");
    eprintln!("  --no-thinking         思考モードOFF");
    eprintln!("  --help, -h            このメッセージを表示");
    eprintln!();
    eprintln!("利用可能モデル: {AVAILABLE_MODELS_HELP}");
}

// ── モデル名解決 ──

/// モデル名から ModelConfig を解決する
///
/// 文字列は大文字小文字を区別しない。未知のモデル名には None を返す。
fn resolve_model_config(name: &str) -> Option<ModelConfig> {
    match name.to_lowercase().as_str() {
        "gemma4-e2b" => Some(ModelConfig::gemma4_e2b()),
        "gemma4-e4b" => Some(ModelConfig::gemma4_e4b()),
        "qwen3.5-0.8b" => Some(ModelConfig::qwen3_5_0_8b()),
        "qwen3.5-2b" => Some(ModelConfig::qwen3_5_2b()),
        _ => None,
    }
}

// ── プロンプト組み立て ──

/// プロンプトを組み立てる
///
/// システムプロンプトとユーザープロンプトを、モデルが理解しやすい
/// `System: ...\n\nUser: ...\n\nAssistant: ` 形式に整形する。
/// 思考モード制御は `GenerateParams.enable_thinking` で推論エンジンが自動処理するため、
/// 本関数は純粋なプロンプト整形に専念する。
/// プロンプトの書式を変更する際は、test-chat の `User: ...\n\nAssistant: ` 形式との
/// 互換性を維持すること。
fn build_prompt(system_prompt: &Option<String>, user_prompt: &str) -> String {
    // システムプロンプトを構成する部品を収集する
    let mut parts: Vec<&str> = Vec::new();

    // システムプロンプトが指定されていれば追加する
    if let Some(sp) = system_prompt {
        if !sp.is_empty() {
            parts.push(sp);
        }
    }

    // システム部 (System:) とユーザー部 (User:) を組み立てる
    if parts.is_empty() {
        // システムプロンプトなし: test-chat 互換の形式
        format!("User: {user_prompt}\n\nAssistant: ")
    } else {
        let system_text = parts.join("\n");
        format!("System: {system_text}\n\nUser: {user_prompt}\n\nAssistant: ")
    }
}

/// 推論結果を表示する
///
/// 生成テキストは stdout、診断情報（経過時間・統計）は stderr に出力する。
/// 日本語テキストは平均 1.5〜2.5 chars/token 程度。
/// ここでは保守的に 4 chars = 1 token として推定する。
fn display_result(text: &str, duration: std::time::Duration) {
    // 生成テキストを stdout に出力
    println!("{text}");

    // 診断情報を stderr に出力
    let char_count = text.chars().count();
    let secs = duration.as_secs_f64();
    eprint!(
        "  ⏱ {}.{:03}秒",
        duration.as_secs(),
        duration.subsec_millis()
    );
    if secs > 0.0 && char_count > 0 {
        let est_tokens = (char_count as f64 / 4.0).ceil();
        let tps = est_tokens / secs;
        eprintln!(" / 📊 {char_count}文字 / {est_tokens:.0}トークン / {tps:.1} TPS");
    } else {
        eprintln!();
    }
}

// ── エントリポイント ──

#[tokio::main]
async fn main() -> Result<()> {
    // 1. コマンドライン引数をパースする
    let args = parse_args()?;

    // 2. モデル名から ModelConfig を解決する
    let model_config = resolve_model_config(&args.model_name).ok_or_else(|| {
        anyhow!(
            "未知のモデル名です: {}\n利用可能: {}",
            args.model_name,
            AVAILABLE_MODELS_HELP
        )
    })?;

    eprintln!("test-oneshot を初期化中...");

    // 3. GgufEngine を初期化する
    let config = GgufConfig {
        models: vec![model_config],
        server: ServerConfig {
            bind: "127.0.0.1:0".parse()?,
            models: vec![args.model_name.clone()],
            auto_start_server: false,
        },
        gpu: GpuConfig {
            provider: GpuProvider::Cpu,
            cpu_only: true,
        },
    };

    let engine = GgufEngine::new(config).await?;
    eprintln!("✓ 初期化完了");

    // 4. プロンプトを組み立てる
    //
    // 思考モード制御は GenerateParams.enable_thinking で
    // 推論エンジン（run_inference_blocking）が自動処理する。
    let prompt = build_prompt(&args.system_prompt, &args.prompt);

    eprintln!("モデル: {}", args.model_name);
    if let Some(sp) = &args.system_prompt {
        eprintln!("システムプロンプト: {sp}");
    }
    eprintln!("思考モード: {}", if args.thinking { "ON" } else { "OFF" });
    eprintln!("ユーザープロンプト: {}", args.prompt);
    eprintln!("---");

    // 5. 非ストリーミング推論を実行する
    //
    // enable_thinking を明示的に設定し、推論エンジンに制御を委譲する。
    let params = GenerateParams {
        temperature: Some(args.temperature),
        max_tokens: Some(args.max_tokens),
        enable_thinking: Some(args.thinking),
        ..GenerateParams::default()
    };

    let start = Instant::now();
    let response = engine.generate(&args.model_name, &prompt, params).await?;
    let duration = start.elapsed();

    eprintln!("---");

    // 6. 結果を表示する
    display_result(&response, duration);

    Ok(())
}

// ── テスト ──

#[cfg(test)]
mod tests {
    use super::*;

    // ── モデル名解決テスト ──

    #[test]
    fn resolve_model_name_gemma4_e2b() {
        let config = resolve_model_config("gemma4-e2b");
        assert!(config.is_some());
        assert_eq!(config.unwrap().name, "gemma4-e2b");
    }

    #[test]
    fn resolve_model_name_gemma4_e4b() {
        let config = resolve_model_config("gemma4-e4b");
        assert!(config.is_some());
        assert_eq!(config.unwrap().name, "gemma4-e4b");
    }

    #[test]
    fn resolve_model_name_qwen3_5_0_8b() {
        let config = resolve_model_config("qwen3.5-0.8b");
        assert!(config.is_some());
        assert_eq!(config.unwrap().name, "qwen3.5-0.8b");
    }

    #[test]
    fn resolve_model_name_qwen3_5_2b() {
        let config = resolve_model_config("qwen3.5-2b");
        assert!(config.is_some());
        assert_eq!(config.unwrap().name, "qwen3.5-2b");
    }

    #[test]
    fn resolve_model_name_case_insensitive_upper() {
        let config = resolve_model_config("GEMMA4-E2B");
        assert!(config.is_some());
        assert_eq!(config.unwrap().name, "gemma4-e2b");
    }

    #[test]
    fn resolve_model_name_case_insensitive_mixed() {
        let config = resolve_model_config("Gemma4-E2b");
        assert!(config.is_some());
        assert_eq!(config.unwrap().name, "gemma4-e2b");
    }

    #[test]
    fn resolve_model_name_unknown_returns_none() {
        assert!(resolve_model_config("unknown-model").is_none());
    }

    #[test]
    fn resolve_model_name_empty_returns_none() {
        assert!(resolve_model_config("").is_none());
    }

    #[test]
    fn resolve_model_config_is_idempotent() {
        let first = resolve_model_config("gemma4-e2b");
        let second = resolve_model_config("gemma4-e2b");
        assert_eq!(
            first.unwrap().name,
            second.unwrap().name,
            "同一モデル名の解決はべき等であるべき"
        );
    }

    #[test]
    fn qwen3_5_0_8b_has_correct_name() {
        let config = resolve_model_config("qwen3.5-0.8b");
        assert_eq!(config.unwrap().name, "qwen3.5-0.8b");
    }

    #[test]
    fn qwen3_5_2b_has_correct_name() {
        let config = resolve_model_config("qwen3.5-2b");
        assert_eq!(config.unwrap().name, "qwen3.5-2b");
    }

    // ── プロンプト組み立てテスト ──
    //
    // build_prompt() は純粋なプロンプト整形関数。
    // 思考モード制御は GenerateParams.enable_thinking 経由で
    // 推論エンジンが処理するため、本関数のテストでは書式のみを検証する。

    #[test]
    fn build_prompt_with_system() {
        let system = Some("あなたは親切なアシスタントです。".to_string());
        let prompt = build_prompt(&system, "こんにちは");
        assert_eq!(
            prompt,
            "System: あなたは親切なアシスタントです。\n\nUser: こんにちは\n\nAssistant: "
        );
    }

    #[test]
    fn build_prompt_without_system() {
        let prompt = build_prompt(&None, "こんにちは");
        assert_eq!(prompt, "User: こんにちは\n\nAssistant: ");
    }

    #[test]
    fn build_prompt_empty_system() {
        let system = Some(String::new());
        let prompt = build_prompt(&system, "こんにちは");
        // 空文字列のシステムプロンプトはシステムプロンプトなし扱い
        assert_eq!(prompt, "User: こんにちは\n\nAssistant: ");
    }

    // ── 定数検証テスト ──

    #[test]
    fn default_temperature_is_within_range() {
        assert!(
            (TEMPERATURE_MIN..=TEMPERATURE_MAX).contains(&DEFAULT_TEMPERATURE),
            "デフォルト温度 {DEFAULT_TEMPERATURE} は範囲外"
        );
    }
}
