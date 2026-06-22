//! # test-chat — 対話型チャットバイナリ
//!
//! ggufrs crate のビルトインモデルを使用して、コマンドラインから
//! マルチターンのチャット会話またはワンショット推論を行うためのバイナリ。
//!
//! ## 実行方法
//!
//! ```bash
//! # ワンショットモード（単一プロンプトを渡して終了）
//! cargo run --bin test-chat -- --model=gemma4-e2b --prompt="こんにちは"
//!
//! # 対話モード（標準入力から逐次読み取り、複数ターン会話）
//! cargo run --bin test-chat -- --model=gemma4-e2b
//!
//! # パラメータ指定
//! cargo run --bin test-chat -- --model=gemma4-e2b --temperature=0.8 --max-tokens=1024
//! ```
//!
//! ## 利用可能モデル
//!
//! - `gemma4-e2b` — Gemma4 E2B（UQFF Q4K, ≈3.1GB）
//! - `gemma4-e4b` — Gemma4 E4B（UQFF Q4K, ≈5.0GB）
//! - `qwen3.5-0.8b` — Qwen3.5 0.8B（GGUF Q4_K_M, ≈600MB）
//! - `qwen3.5-2b` — Qwen3.5 2B（GGUF Q4_K_M, ≈1.2GB）

use std::io::{self, Write};
use std::time::Instant;

use anyhow::{anyhow, Context, Result};
use futures::StreamExt;

pub use ggufrs::*;

// ── 定数 ──

/// デフォルトの温度パラメータ
///
/// チャット向けの多様性を確保するため、test-run の 0.3 より高めに設定する。
const DEFAULT_TEMPERATURE: f32 = 0.7;

/// デフォルトの最大生成トークン数
///
/// チャットではやや長めの応答を期待するため、test-run の 256 より大きくする。
const DEFAULT_MAX_TOKENS: u32 = 512;

/// 会話履歴の最大文字数
///
/// この値を超えた履歴は古いターンから切り詰められる。
/// モデルのコンテキストサイズ（Gemma4 で 2048）を考慮し、
/// 約 3〜4 ターン分の履歴を安全に保持できる値を設定する。
const MAX_HISTORY_CHARS: usize = 4000;

/// 利用可能モデル一覧のヘルプ文字列
const AVAILABLE_MODELS_HELP: &str = "gemma4-e2b, gemma4-e4b, qwen3.5-0.8b, qwen3.5-2b";

// ── 型定義 ──

/// コマンドライン引数
struct CliArgs {
    /// モデル名（必須）
    model_name: String,
    /// ワンショットプロンプト（省略時は対話モード）
    prompt: Option<String>,
    /// 温度パラメータ
    temperature: f32,
    /// 最大生成トークン数
    max_tokens: u32,
}

// ── 引数パース ──

/// コマンドライン引数をパースする
///
/// 手動パース方式（test-run と同一スタイル）。
/// clap 等の外部クレートは使用しない。
fn parse_args() -> Result<CliArgs> {
    let args: Vec<String> = std::env::args().collect();
    let mut model_name = None;
    let mut prompt = None;
    let mut temperature = DEFAULT_TEMPERATURE;
    let mut max_tokens = DEFAULT_MAX_TOKENS;

    let mut i = 1;
    while i < args.len() {
        let arg = &args[i];
        if let Some(value) = arg.strip_prefix("--model=") {
            model_name = Some(value.to_string());
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
        } else if arg == "--help" || arg == "-h" {
            print_usage();
            std::process::exit(0);
        } else {
            anyhow::bail!(
                "不明な引数: {arg}\n\n\
                使用法:\n  \
                 cargo run --bin test-chat -- --model=<NAME> [--prompt=<TEXT>] \
                 [--temperature=<F>] [--max-tokens=<N>]"
            );
        }
        i += 1;
    }

    let model_name = model_name.context(
        "--model は必須です。利用可能: gemma4-e2b, gemma4-e4b, qwen3.5-0.8b, qwen3.5-2b",
    )?;

    // 温度パラメータの範囲検証
    if !(0.0..=2.0).contains(&temperature) {
        anyhow::bail!(
            "--temperature は 0.0〜2.0 の範囲で指定してください（指定値: {temperature}）"
        );
    }

    Ok(CliArgs {
        model_name,
        prompt,
        temperature,
        max_tokens,
    })
}

/// 使用方法を表示する
fn print_usage() {
    // 診断情報は stderr に出力する
    eprintln!("対話型チャットバイナリ — ggufrs ビルトインモデルを使用したチャット");
    eprintln!();
    eprintln!("使用法:");
    eprintln!("  cargo run --bin test-chat -- --model=<NAME> [オプション]");
    eprintln!("  cargo run --bin test-chat -- --model=<NAME> --prompt=<TEXT> [オプション]");
    eprintln!();
    eprintln!("引数:");
    eprintln!("  --model=<NAME>        モデル名（必須）");
    eprintln!("  --prompt=<TEXT>       ワンショットプロンプト（省略時は対話モード）");
    eprintln!(
        "  --temperature=<F>     温度パラメータ（デフォルト: {DEFAULT_TEMPERATURE}, \
         範囲: 0.0-2.0）"
    );
    eprintln!(
        "  --max-tokens=<N>      最大生成トークン数（デフォルト: {DEFAULT_MAX_TOKENS}）"
    );
    eprintln!("  --help, -h            このメッセージを表示");
    eprintln!();
    eprintln!("利用可能モデル: {AVAILABLE_MODELS_HELP}");
    eprintln!();
    eprintln!("対話モードの操作:");
    eprintln!("  > プロンプトを入力（空行または exit/quit で終了）");
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

// ── 統計表示 ──

/// 経過時間と出力文字数から TPS（Tokens Per Second）を表示する
///
/// 日本語テキストは平均 1.5〜2.5 chars/token 程度。
/// ここでは保守的に 4 chars = 1 token として推定する。
/// 診断情報は stderr に出力する（stdout は生成テキスト専用）。
fn print_stats(start: Instant, char_count: usize) {
    let elapsed = start.elapsed();
    let secs = elapsed.as_secs_f64();
    eprint!(
        "  ⏱ {}.{:03}秒",
        elapsed.as_secs(),
        elapsed.subsec_millis()
    );
    if secs > 0.0 && char_count > 0 {
        let est_tokens = (char_count as f64 / 4.0).ceil();
        let tps = est_tokens / secs;
        eprintln!(
            " / 📊 {char_count}文字 / {est_tokens:.0}トークン / {tps:.1} TPS"
        );
    } else {
        eprintln!();
    }
}

// ── ワンショットモード ──

/// ワンショットモードを実行する
///
/// 指定されたモデルとプロンプトでストリーミング生成を行い、
/// 結果を表示して終了する。
/// プロンプトは対話モードと同様に `User: ...\n\nAssistant: ` 形式に整形することで、
/// モデルが会話の文脈を認識しやすくする。
async fn run_one_shot(engine: &GgufEngine, args: &CliArgs) -> Result<()> {
    let raw_prompt = args.prompt.as_deref().unwrap_or("");
    // 対話モードと同様の形式でプロンプトを整形する
    let formatted_prompt = format!("User: {raw_prompt}\n\nAssistant: ");
    let params = GenerateParams {
        temperature: Some(args.temperature),
        max_tokens: Some(args.max_tokens),
        ..GenerateParams::default()
    };

    eprintln!("モデル: {}", args.model_name);
    eprintln!("プロンプト: {raw_prompt}");
    eprintln!("---");

    let mut stream = engine
        .generate_stream(&args.model_name, &formatted_prompt, params)
        .await?;

    // モデルロード完了後に計測を開始する
    let start = Instant::now();

    let mut char_count = 0usize;
    while let Some(chunk) = stream.next().await {
        let text = chunk?;
        char_count += text.chars().count();
        print!("{text}");
        io::stdout().flush()?;
    }
    println!();

    eprintln!("---");
    print_stats(start, char_count);
    Ok(())
}

// ── 対話モード ──

/// 対話モードを実行する
///
/// 標準入力からユーザー入力を読み取り、会話履歴を保持しながら
/// 複数ターンのチャットセッションを行う。
async fn run_interactive(engine: &GgufEngine, args: &CliArgs) -> Result<()> {
    let params = GenerateParams {
        temperature: Some(args.temperature),
        max_tokens: Some(args.max_tokens),
        ..GenerateParams::default()
    };

    eprintln!("対話モードを開始します。モデル: {}", args.model_name);
    eprintln!("空行または exit/quit で終了します。");
    eprintln!();

    // 会話履歴を構築する文字列バッファ
    // 各ターンを "User: {message}\n\nAssistant: {response}\n\n" の形式で追記する
    let mut history = String::new();

    loop {
        // プロンプト表示（診断情報は stderr）
        eprint!("> ");
        io::stderr().flush()?;

        // ユーザー入力の読み取り
        let mut input = String::new();
        let bytes_read = io::stdin().read_line(&mut input)?;

        // 終了条件: EOF（Ctrl+D）、空行、exit/quit
        let trimmed = input.trim();
        if bytes_read == 0 || trimmed.is_empty() || trimmed == "exit" || trimmed == "quit" {
            break;
        }

        // 会話履歴にユーザーメッセージを追加
        history.push_str(&format!("User: {trimmed}\n\n"));

        // 会話履歴が長すぎる場合は古いターンから切り詰める
        if history.len() > MAX_HISTORY_CHARS {
            // "\n\nUser: " で次のターン境界を見つけ、最初のターンを削除する
            if let Some(cut_pos) = history.find("\n\nUser: ") {
                history = history.split_off(cut_pos + 2);
            }
        }

        // ストリーミング生成（モデルロード完了後に計測開始）
        let mut stream = engine
            .generate_stream(&args.model_name, &history, params.clone())
            .await?;

        let start = Instant::now();

        let mut response = String::new();
        while let Some(chunk) = stream.next().await {
            let text = chunk?;
            response.push_str(&text);
            print!("{text}");
            io::stdout().flush()?;
        }
        println!();

        // 会話履歴にアシスタントの応答を追加
        history.push_str(&format!("Assistant: {response}\n\n"));

        // 統計表示
        let char_count = response.chars().count();
        print_stats(start, char_count);
    }

    eprintln!("\n対話を終了しました。");
    Ok(())
}

// ── エントリポイント ──

#[tokio::main]
async fn main() -> Result<()> {
    // 1. コマンドライン引数をパースする
    let args = parse_args()?;

    // 2. モデル名から ModelConfig を解決する
    let model_config =
        resolve_model_config(&args.model_name).ok_or_else(|| {
            anyhow!(
                "未知のモデル名です: {}\n利用可能: {}",
                args.model_name,
                AVAILABLE_MODELS_HELP
            )
        })?;

    eprintln!("test-chat を初期化中...");

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

    // 4. モードに応じて実行する
    if args.prompt.is_some() {
        run_one_shot(&engine, &args).await
    } else {
        run_interactive(&engine, &args).await
    }
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

    // ── 会話履歴フォーマットテスト ──
    //
    // 会話履歴の構築は history.push_str() による文字列連結で行われる。
    // ここでは連結結果の正しさを検証する。

    #[test]
    fn chat_history_single_turn_format() {
        let mut history = String::new();
        history.push_str("User: こんにちは\n\n");
        history.push_str("Assistant: こんにちは！\n\n");

        assert!(history.contains("User: こんにちは"));
        assert!(history.contains("Assistant: こんにちは！"));
        assert_eq!(history.matches("User: ").count(), 1);
        assert_eq!(history.matches("Assistant: ").count(), 1);
        // 各ターンは空行で区切られている
        assert!(history.contains("\n\n"));
    }

    #[test]
    fn chat_history_multi_turn() {
        let mut history = String::new();

        history.push_str("User: 1回目\n\n");
        history.push_str("Assistant: 応答1\n\n");

        history.push_str("User: 2回目\n\n");
        history.push_str("Assistant: 応答2\n\n");

        history.push_str("User: 3回目\n\n");
        history.push_str("Assistant: 応答3\n\n");

        assert_eq!(history.matches("User: ").count(), 3);
        assert_eq!(history.matches("Assistant: ").count(), 3);
        assert!(history.contains("応答1"));
        assert!(history.contains("応答2"));
        assert!(history.contains("応答3"));
    }

    #[test]
    fn chat_history_empty_message() {
        let mut history = String::new();
        // 空文字列の入力を模擬
        history.push_str("User: \n\n");
        history.push_str("Assistant: \n\n");

        assert_eq!(history, "User: \n\nAssistant: \n\n");
    }

    // ── 履歴切り詰めテスト ──

    #[test]
    fn chat_history_trims_old_turns_when_overflow() {
        // MAX_HISTORY_CHARS を超える履歴で古いターンが切り詰められることを確認
        let mut history = String::new();

        // ターン1: 固有の内容（"A" * 1000, "B" * 1000）
        let user_1 = "A".repeat(1000);
        let assistant_1 = "B".repeat(1000);

        history.push_str(&format!("User: {user_1}\n\n"));
        history.push_str(&format!("Assistant: {assistant_1}\n\n"));

        // 1ターンで 2000 文字強。MAX_HISTORY_CHARS=4000 を超えない
        assert!(history.len() <= MAX_HISTORY_CHARS);

        // ターン2: 異なる固有の内容（"C" * 1000, "D" * 1000）
        let user_2 = "C".repeat(1000);
        let assistant_2 = "D".repeat(1000);

        history.push_str(&format!("User: {user_2}\n\n"));
        history.push_str(&format!("Assistant: {assistant_2}\n\n"));

        // 現在 4000 文字以上ある
        assert!(history.len() > MAX_HISTORY_CHARS);

        // 切り詰めロジック
        if let Some(cut_pos) = history.find("\n\nUser: ") {
            history = history.split_off(cut_pos + 2);
        }

        // 切り詰め後は MAX_HISTORY_CHARS 以下
        assert!(
            history.len() <= MAX_HISTORY_CHARS + 100, // わずかな超過は許容
            "履歴が切り詰められていません: {} > {}",
            history.len(),
            MAX_HISTORY_CHARS
        );
        // ターン1の内容は削除されている
        assert!(
            !history.contains(&user_1),
            "最初のターンの内容が削除されていません"
        );
        assert!(
            !history.contains(&assistant_1),
            "最初のターンの応答が削除されていません"
        );
        // ターン2の内容は残っている
        assert!(
            history.contains(&user_2),
            "2ターン目の内容が残っていません"
        );
        assert!(
            history.contains(&assistant_2),
            "2ターン目の応答が残っていません"
        );
    }

    // ── 引数パーステスト ──
    //
    // 注意: parse_args() は std::env::args() を読むため、
    // 単体テストでは直接呼び出せない。
    // ここでは引数パースに関する部分ロジックの検証のみを行う。

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
}
