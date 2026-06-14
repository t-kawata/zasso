//! voiput test-run — 開発用デモツール
//!
//! M8-4 時点: テスト実行 → Voiput 構築 → ホットキー待機の3段階構成。
//!
//! # 使用方法
//!
//! ```bash
//! cargo run --bin test-run                             # デフォルト (os, ja)
//! cargo run --bin test-run -- --engine openai --openai-key=sk-xxx  # OpenAI
//! cargo run --bin test-run -- --locale en              # 英語ロケール
//! cargo run --bin test-run -- --audio-verify           # 音声再生確認
//! ```

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use voiput::{
    apply_replaces, get_tokenizer, init, is_worthy_to_run_asr, play_commit_sound, play_ready_sound,
};
use voiput::{
    InputMode, InternalResampler, LocaleCode, OpenAiConfig, OpenAIBackend,
    PostCorrectionBackend, PostCorrectionConfig, ProcessorOutput, PunctuationMachine,
    SignalFilterConfig, SincResampler, SttEngine, VadModelPaths, VoiputConfig,
};
use voiput::{PostCorrectionProcessor, SttModelType};
use voiput::{
    VadProcessor, VadProcessorConfig, VadProcessorType, Voiput, SILERO_VAD_WINDOW_SIZE,
    TEN_VAD_WINDOW_SIZE, VAD_SAMPLE_RATE,
};

// ============================================================================
// CLI 引数
// ============================================================================

/// CLI 引数で指定された設定
struct CliArgs {
    /// 使用エンジン（os / openai）
    engine: SttEngine,
    /// 言語ロケール
    locale: LocaleCode,
    /// OpenAI API キー（--engine openai の場合に使用）
    openai_key: Option<String>,
    /// OpenAI API ベース URL
    base_url: String,
}

/// CLI 引数をパースする。
///
/// 第1引数が `--audio-verify` の場合は None を返し、呼び出し元で特別処理する。
fn parse_args() -> Option<CliArgs> {
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;

    // 特別モードは早期リターン
    if args.len() > 1 && args[1] == "--audio-verify" {
        return None;
    }

    let mut engine = SttEngine::Os;
    let mut locale = LocaleCode::Ja;
    let mut openai_key: Option<String> = None;
    let mut base_url = "https://api.openai.com/v1".to_string();

    while i < args.len() {
        match args[i].as_str() {
            "--engine" => {
                i += 1;
                if i < args.len() {
                    engine = match args[i].as_str() {
                        "openai" => SttEngine::OpenAI,
                        _ => SttEngine::Os,
                    };
                }
            }
            "--locale" => {
                i += 1;
                if i < args.len() {
                    locale = match args[i].as_str() {
                        "en" => LocaleCode::En,
                        _ => LocaleCode::Ja,
                    };
                }
            }
            "--openai-key" => {
                i += 1;
                if i < args.len() {
                    openai_key = Some(args[i].clone());
                }
            }
            "--base-url" => {
                i += 1;
                if i < args.len() {
                    base_url = args[i].clone();
                }
            }
            // --openai-key=xxx 形式と --base-url=xxx 形式にも対応
            s if s.starts_with("--openai-key=") => {
                openai_key = Some(s.trim_start_matches("--openai-key=").to_string());
            }
            s if s.starts_with("--base-url=") => {
                base_url = s.trim_start_matches("--base-url=").to_string();
            }
            _ => {}
        }
        i += 1;
    }

    Some(CliArgs {
        engine,
        locale,
        openai_key,
        base_url,
    })
}

struct MockPostCorrectBackend;

/// モデルファイルの絶対パスを返す（CARGO_MANIFEST_DIR からの相対パスを解決）
fn model_path(name: &str) -> String {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    format!("{}/models/{}", manifest_dir, name)
}

#[async_trait::async_trait]
impl PostCorrectionBackend for MockPostCorrectBackend {
    async fn post_correct(&self, text: &str) -> anyhow::Result<String> {
        Ok(format!("[OK] {}", text))
    }
}

fn main() {
    // ロガー初期化（RUST_LOG 環境変数で制御、例: RUST_LOG=info）
    let _ = env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("warn"),
    )
    .try_init();

    // ── Phase 1: CLI 引数解析 ──
    let args = match parse_args() {
        Some(a) => a,
        None => {
            // --audio-verify モード
            audio_verify();
            return;
        }
    };

    // --openai-key は必須（エンジン非依存で PostCorrection に使用）
    if args.openai_key.is_none() {
        eprintln!("❌ --openai-key は必須です（事後補正 (PostCorrection) に使用）");
        eprintln!("  使用例: cargo run --bin test-run -- --engine os --openai-key=sk-xxxxx");
        eprintln!("  または: cargo run --bin test-run -- --engine openai --openai-key=sk-xxxxx");
        std::process::exit(1);
    }

    println!("========================================");
    println!("  voiput test-run");
    println!("  engine: {:?}, locale: {:?}", args.engine, args.locale);
    println!("========================================");
    println!();

    // ── Phase 2: 全テスト実行 ──
    if !run_all_tests(&args) {
        eprintln!("\n❌ テスト失敗: exit(1)");
        std::process::exit(1);
    }

    println!("✅ 全テスト通過");
    println!();

    // ── Phase 3: Voiput 構築 + ホットキー待機 ──
    println!("=== 音声認識モード ===");
    println!("🔊 Option/Alt ダブルタップで録音開始（Ctrl+C で終了）");
    println!();

    let config = build_voiput_config(&args);
    let mut voiput = match Voiput::new(config) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("❌ Voiput::new() 失敗: {}", e);
            std::process::exit(1);
        }
    };

    voiput.enable_hotkeys();

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("❌ Tokio ランタイム作成失敗: {}", e);
            std::process::exit(1);
        }
    };

    rt.block_on(async {
        use tokio::time::{timeout, Duration};

        // イベントループ（薄い表示層）
        // next_event() がブロックするとホットキーが処理できないため、
        // 100ms のタイムアウトでポーリングし、ホットキーイベントを優先処理する。
        let mut post_correction_active = false;
        loop {
            // ホットキーイベントを毎ループ処理する
            voiput.handle_hotkey_events();

            match timeout(Duration::from_millis(100), voiput.next_event()).await {
                Ok(Some(event)) => {
                    match &event {
                        voiput::SttEvent::PartialResult(text, _) => {
                            let label = if post_correction_active { "🔧 補正中" } else { "📝" };
                            print!("\r{} {}", label, text);
                            use std::io::Write;
                            std::io::stdout().flush().ok();
                        }
                        voiput::SttEvent::FinalResult(text, _) => {
                            let label = if post_correction_active { "✅ 事後補正完了" } else { "✅" };
                            println!("\r{} {}", label, text);
                            post_correction_active = false;
                        }
                        voiput::SttEvent::PostCorrectionStarted => {
                            println!("\n🔄 LLM 事後補正開始...");
                            post_correction_active = true;
                        }
                        voiput::SttEvent::PostCorrectionFinished => {
                            // 補正結果は FinalResult として届くので、ここでは非表示
                        }
                        voiput::SttEvent::Flushed(text) => {
                            println!("📋 Flushed: {}", text);
                        }
                        voiput::SttEvent::Ready => {
                            println!("🎤 録音準備完了");
                        }
                        voiput::SttEvent::Started => {
                            println!("🔴 録音中...");
                        }
                        voiput::SttEvent::Stopped => {
                            println!("⏹ 録音停止");
                        }
                        voiput::SttEvent::Error(e) => {
                            eprintln!("❌ {}", e);
                        }
                        _ => {}
                    }
                }
                Ok(None) => break, // チャネルクローズ
                Err(_) => {
                    // タイムアウト: ホットキーイベント確認のためループ継続
                }
            }
        }
    });
}

/// 全テストを実行する。1つでも失敗すれば false を返す。
fn run_all_tests(args: &CliArgs) -> bool {
    let tests: [(&str, fn(&CliArgs) -> bool); 11] = [
        ("CONFIG", test_config),
        ("RESAMPLER", test_resampler),
        ("POST_CORRECT", test_post_correct),
        ("SIGNAL_FILTER", test_signal_filter),
        ("INTERCEPTOR", test_interceptor),
        ("VAD", test_vad),
        ("PUNCTUATION", test_punctuation),
        ("AUDIO", test_audio),
        ("STREAMER", test_streamer),
        ("VOIPUT", test_voiput),
        ("OPENAI", test_openai),
    ];

    let mut all_passed = true;
    for (_name, test_fn) in &tests {
        if !test_fn(args) {
            all_passed = false;
        }
    }
    all_passed
}

fn audio_verify() {
    println!("=== 音声再生確認 ===");
    match init() {
        Ok(_) => println!("✓ 初期化成功"),
        Err(e) => {
            println!("✗ 初期化失敗: {}", e);
            return;
        }
    }
    std::thread::sleep(std::time::Duration::from_millis(500));

    println!("→ 準備音 (piro.wav) 再生中...");
    play_ready_sound();
    std::thread::sleep(std::time::Duration::from_secs(1));

    println!("→ 確定音 (commit.wav) 再生中...");
    play_commit_sound();
    std::thread::sleep(std::time::Duration::from_secs(1));

    println!("✓ 音声再生確認完了");
}

fn show_section(name: &str) {
    println!("--- [{}] ---", name);
}

/// CLI 引数から VoiputConfig を構築する。
fn build_voiput_config(args: &CliArgs) -> VoiputConfig {
    let mut builder = VoiputConfig::builder()
        .engine(args.engine)
        .locale(args.locale)
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx"),
            ten: model_path("ten_vad.onnx"),
            gtcrn: String::new(),
        });

    // 認識エンジン用の OpenAI 設定（--engine openai の場合のみ）
    if args.engine == SttEngine::OpenAI {
        if let Some(ref key) = args.openai_key {
            builder = builder.openai_config(OpenAiConfig {
                base_url: args.base_url.clone(),
                api_key: key.clone(),
                model: "gpt-4o-mini-transcribe".into(),
            });
        }
    }

    // PostCorrection（LLM 事後補正）用の OpenAI 設定（エンジン非依存）
    if let Some(ref key) = args.openai_key {
        builder = builder.post_correction_openai_config(OpenAiConfig {
            base_url: args.base_url.clone(),
            api_key: key.clone(),
            model: "gpt-4o-mini-transcribe".into(),
        });
    }

    builder.build().expect("VoiputConfig の構築に失敗")
}

// ============================================================================
// テスト関数群
// ============================================================================

fn test_config(_args: &CliArgs) -> bool {
    show_section("CONFIG");
    let mut ok = true;

    println!("  [TEST] 正常系: 最小構成 (Engine=Os, locale=Ja)");
    let config = VoiputConfig::builder()
        .engine(SttEngine::Os)
        .locale(LocaleCode::Ja)
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx"),
            ten: model_path("ten_vad.onnx"),
            gtcrn: String::new(),
        })
        .build();
    match config {
        Ok(cfg) => {
            println!("    ✓ build() 成功");
            println!("    engine: {:?}", cfg.engine);
            println!("    locale: {:?}", cfg.locale);
            println!("    speech_timeout_sec: {}", cfg.speech_timeout_sec);
        }
        Err(e) => {
            println!("    ✗ build() 失敗: {}", e);
            ok = false;
        }
    }

    println!("  [TEST] 正常系: OpenAI 設定付き");
    let config = VoiputConfig::builder()
        .engine(SttEngine::OpenAI)
        .locale(LocaleCode::En)
        .openai_config(OpenAiConfig {
            base_url: "http://127.0.0.1:3912".into(),
            api_key: "sk-xxxx".into(),
            model: "gpt-4o-mini-transcribe".into(),
        })
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx"),
            ten: model_path("ten_vad.onnx"),
            gtcrn: String::new(),
        })
        .build();
    match config {
        Ok(_cfg) => println!("    ✓ build() 成功 (OpenAI)"),
        Err(e) => {
            println!("    ✗ build() 失敗: {}", e);
            ok = false;
        }
    }

    println!("  [TEST] 異常系: locale 未指定");
    let result = VoiputConfig::builder()
        .engine(SttEngine::Os)
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx"),
            ten: model_path("ten_vad.onnx"),
            gtcrn: String::new(),
        })
        .build();
    match result {
        Ok(_) => {
            println!("    ✗ エラーになるべき");
            ok = false;
        }
        Err(e) => println!("    ✓ 正しくエラー: {}", e),
    }

    println!("  [TEST] 異常系: OpenAI config なし");
    let result = VoiputConfig::builder()
        .engine(SttEngine::OpenAI)
        .locale(LocaleCode::Ja)
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx"),
            ten: model_path("ten_vad.onnx"),
            gtcrn: String::new(),
        })
        .build();
    match result {
        Ok(_) => {
            println!("    ✗ エラーになるべき");
            ok = false;
        }
        Err(e) => println!("    ✓ 正しくエラー: {}", e),
    }

    println!();
    ok
}

fn test_resampler(_args: &CliArgs) -> bool {
    show_section("RESAMPLER");
    let mut ok = true;

    let input_rate = 48000u32;
    let output_rate = 16000u32;
    let sample_count = 4800;
    let input: Vec<f32> = (0..sample_count).map(|i| (i as f32 * 0.01).sin()).collect();

    println!("  [TEST] SincResampler: {}Hz → {}Hz", input_rate, output_rate);
    match SincResampler::new(input_rate, output_rate) {
        Ok(mut resampler) => match resampler.process(&input) {
            Ok(output) => {
                if !output.is_empty() && output.len() > input.len() / 4 {
                    println!("    ✓ PASS: 出力長={}", output.len());
                } else {
                    println!("    ✗ FAIL: 出力長={}", output.len());
                    ok = false;
                }
            }
            Err(e) => {
                println!("    ✗ FAIL: {}", e);
                ok = false;
            }
        },
        Err(e) => {
            println!("    ✗ FAIL: {}", e);
            ok = false;
        }
    }

    println!("  [TEST] パススルー: 16000Hz → 16000Hz");
    match SincResampler::new(16000, 16000) {
        Ok(mut resampler) => {
            let passthrough_input = vec![1.0f32; 1024];
            match resampler.process(&passthrough_input) {
                Ok(output) => {
                    if !output.is_empty() {
                        println!("    ✓ PASS: 出力長={}", output.len());
                    } else {
                        println!("    ✗ FAIL: 出力が空");
                        ok = false;
                    }
                }
                Err(e) => {
                    println!("    ✗ FAIL: {}", e);
                    ok = false;
                }
            }
        }
        Err(e) => {
            println!("    ✗ FAIL: {}", e);
            ok = false;
        }
    }

    println!();
    ok
}

fn test_interceptor(_args: &CliArgs) -> bool {
    use indexmap::IndexMap;
    use parking_lot::RwLock;
    show_section("INTERCEPTOR");
    let mut ok = true;

    let empty_map: RwLock<IndexMap<String, Vec<String>>> = RwLock::new(IndexMap::new());
    if apply_replaces(&empty_map, "hello") == "hello" {
        println!("  [TEST] 空マップ → passthrough: ✓ PASS");
    } else {
        println!("  [TEST] 空マップ → passthrough: ✗ FAIL");
        ok = false;
    }

    let map: RwLock<IndexMap<String, Vec<String>>> = RwLock::new(IndexMap::new());
    {
        let mut m = map.write();
        m.insert("world".to_string(), vec!["hello".to_string()]);
    }
    if apply_replaces(&map, "hello") == "world" {
        println!("  [TEST] 単一置換: ✓ PASS");
    } else {
        println!("  [TEST] 単一置換: ✗ FAIL");
        ok = false;
    }

    println!();
    ok
}

fn test_vad(_args: &CliArgs) -> bool {
    show_section("VAD");
    let mut ok = true;

    assert_eq!(VAD_SAMPLE_RATE, 16000);
    assert_eq!(SILERO_VAD_WINDOW_SIZE, 512);
    assert_eq!(TEN_VAD_WINDOW_SIZE, 256);
    println!("  ✓ 定数一致");

    let models_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("models");
    let model_candidates = [
        "silero_vad.onnx",
        "silero_vad.int8.onnx",
        "ten_vad.onnx",
        "ten-vad.int8.onnx",
    ];

    let mut initialized = false;
    for name in &model_candidates {
        let path = models_dir.join(name);
        if !path.exists() {
            continue;
        }
        let is_speaking = Arc::new(AtomicBool::new(false));
        let vad_type = if name.contains("ten") {
            VadProcessorType::Ten
        } else {
            VadProcessorType::Silero
        };
        let config = VadProcessorConfig {
            vad_type,
            model_path: path.display().to_string(),
            threshold: 0.5,
            min_silence_duration: 0.2,
            min_speech_duration: 0.25,
            max_speech_duration: 25.0,
            num_threads: 4,
        };
        match VadProcessor::new(config, is_speaking) {
            Ok(vad) => {
                println!("    ✓ VadProcessor::new(\"{}\") 成功 (window_size={})", name, vad.window_size());
                initialized = true;
                break;
            }
            Err(e) => println!("    ✗ VadProcessor::new(\"{}\") 失敗: {}", name, e),
        }
    }
    if !initialized {
        println!("  ✗ FAIL: VAD モデルが初期化できませんでした");
        println!("         {} にモデルファイルが存在することを確認してください", models_dir.display());
        ok = false;
    }
    println!();
    ok
}

fn test_signal_filter(_args: &CliArgs) -> bool {
    show_section("SIGNAL_FILTER");
    let mut ok = true;
    let config = SignalFilterConfig::default();
    let good_samples = vec![0.1f32; 16000];

    if !is_worthy_to_run_asr(&[], &config, 300, 16000) {
        println!("  [TEST] 空スライス → false: ✓ PASS");
    } else {
        println!("  [TEST] 空スライス → false: ✗ FAIL");
        ok = false;
    }

    let low_rms = vec![0.001f32; 16000];
    if !is_worthy_to_run_asr(&low_rms, &config, 300, 16000) {
        println!("  [TEST] 低振幅 (RMS不足) → false: ✓ PASS");
    } else {
        println!("  [TEST] 低振幅 → false: ✗ FAIL");
        ok = false;
    }

    if is_worthy_to_run_asr(&good_samples, &config, 300, 16000) {
        println!("  [TEST] 正常信号 → true: ✓ PASS");
    } else {
        println!("  [TEST] 正常信号 → true: ✗ FAIL");
        ok = false;
    }

    println!();
    ok
}

fn test_post_correct(_args: &CliArgs) -> bool {
    show_section("POST_CORRECT");
    let mut ok = true;
    let is_speaking = Arc::new(AtomicBool::new(false));
    let backend: Arc<dyn PostCorrectionBackend> = Arc::new(MockPostCorrectBackend);

    println!("  [TEST] OfflineModel: 追記動作");
    let mut proc = PostCorrectionProcessor::with_model_type(
        backend.clone(),
        PostCorrectionConfig {
            sentence_count_threshold: 3,
            min_text_length: 10,
            interval_ms: 2000,
        },
        SttModelType::UseOfflineModel,
        is_speaking.clone(),
    );
    let out1 = proc.process_input("hello");
    let out2 = proc.process_input("world");
    match (out1, out2) {
        (Some(ProcessorOutput::Partial(a)), Some(ProcessorOutput::Partial(b))) => {
            if a == "hello" && b == "helloworld" {
                println!("    ✓ PASS");
            } else {
                println!("    ✗ FAIL: got \"{}\" + \"{}\"", a, b);
                ok = false;
            }
        }
        _ => {
            println!("    ✗ FAIL: unexpected output type");
            ok = false;
        }
    }

    println!("  [TEST] commit_correction: バッファクリア");
    let mut proc = PostCorrectionProcessor::new(backend, PostCorrectionConfig::default(), is_speaking);
    let _ = proc.process_input("hello world");
    match proc.commit_correction("corrected output") {
        ProcessorOutput::Final(ref text) if text.contains("corrected output") => {
            println!("    ✓ commit OK");
        }
        _ => {
            println!("    ✗ commit 失敗");
            ok = false;
        }
    }
    match proc.process_input("next") {
        Some(ProcessorOutput::Partial(ref text)) if text == "next" => {
            println!("    ✓ バッファクリア OK");
        }
        _ => {
            println!("    ✗ バッファクリア失敗");
            ok = false;
        }
    }

    println!();
    ok
}

fn test_punctuation(_args: &CliArgs) -> bool {
    show_section("PUNCTUATION");
    let mut ok = true;

    println!("  [TEST] Lindera tokenizer 初期化");
    match get_tokenizer() {
        Ok(_) => println!("    ✓ get_tokenizer() 成功"),
        Err(e) => {
            println!("    ✗ 失敗: {}", e);
            ok = false;
        }
    }

    println!("  [TEST] 日本語句読点付与");
    match PunctuationMachine::new() {
        Ok(machine) => {
            let inputs = [("こんにちは元気ですか", &LocaleCode::Ja, false)];
            for (text, locale, allow_terminal) in &inputs {
                match machine.insert_with_context(text, "", *locale, *allow_terminal) {
                    Ok(result) => println!("    \"{}\" → \"{}\"", text, result),
                    Err(e) => {
                        println!("    ✗ エラー: {}", e);
                        ok = false;
                    }
                }
            }
        }
        Err(e) => {
            println!("    ✗ PunctuationMachine::new() 失敗: {}", e);
            ok = false;
        }
    }

    println!("  [TEST] 英語パススルー");
    match PunctuationMachine::new() {
        Ok(machine) => match machine.insert("hello world", &LocaleCode::En) {
            Ok(result) => {
                if result == "hello world" {
                    println!("    ✓ PASS");
                } else {
                    println!("    ✗ 変更が発生: \"{}\"", result);
                    ok = false;
                }
            }
            Err(e) => {
                println!("    ✗ エラー: {}", e);
                ok = false;
            }
        },
        Err(e) => {
            println!("    ✗ PunctuationMachine::new() 失敗: {}", e);
            ok = false;
        }
    }

    println!();
    ok
}

fn test_audio(_args: &CliArgs) -> bool {
    show_section("AUDIO");

    println!("  [TEST] オーディオ初期化");
    match init() {
        Ok(_) => println!("    ✓ init() 成功"),
        Err(e) => {
            println!("    [SKIP] ヘッドレス環境: {}", e);
            println!();
            return true;
        }
    }

    println!("  [TEST] 効果音再生");
    play_ready_sound();
    println!("    ✓ play_ready_sound() OK");
    play_commit_sound();
    println!("    ✓ play_commit_sound() OK");

    println!();
    true
}

use std::sync::Mutex;
use tokio::sync::mpsc;
use voiput::AsrBackend;
use voiput::{PseudoAsrStreamer, StreamerConfig};

struct MockStreamerBackend {
    call_count: Arc<Mutex<usize>>,
}

impl AsrBackend for MockStreamerBackend {
    fn transcribe(&mut self, _samples: &[f32]) -> anyhow::Result<String> {
        *self.call_count.lock().unwrap() += 1;
        Ok("test transcription".to_string())
    }
    fn post_correct(&mut self, text: &str) -> anyhow::Result<String> {
        Ok(format!("[corrected] {}", text))
    }
    fn model_name(&self) -> String {
        "mock".to_string()
    }
    fn record_asr_usage(&mut self, _duration_ms: u64) {}
}

fn test_streamer(_args: &CliArgs) -> bool {
    show_section("STREAMER");
    let mut ok = true;

    let (tx, _rx) = mpsc::channel(10);
    let config = StreamerConfig {
        utterance_min_ms: 100,
        signal_check_enabled: false,
        use_denoiser: false,
        vad_model_path: std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("models")
            .join("silero_vad.onnx")
            .display()
            .to_string(),
        ..Default::default()
    };

    let call_count = Arc::new(Mutex::new(0usize));
    let backend = MockStreamerBackend { call_count };

    match PseudoAsrStreamer::new(backend, tx, config) {
        Ok(mut streamer) => {
            println!("  ✓ PseudoAsrStreamer::new() 成功");
            match streamer.start() {
                Ok(_) => println!("  ✓ start() 成功"),
                Err(e) => {
                    println!("  ✗ start() 失敗: {}", e);
                    ok = false;
                }
            }
            streamer.stop();
            println!("  ✓ start → stop 正常終了");
        }
        Err(e) => {
            println!("  ✗ PseudoAsrStreamer::new() 失敗: {}", e);
            ok = false;
        }
    }

    println!();
    ok
}

fn decode_wav_to_f32(path: &std::path::Path) -> anyhow::Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<Result<Vec<f32>, _>>()
            .map_err(|e| anyhow::anyhow!("WAV 読み取り失敗: {}", e)),
        hound::SampleFormat::Int if spec.bits_per_sample <= 16 => reader
            .samples::<i16>()
            .map(|s| s.map(|v| v as f32 / 32768.0))
            .collect::<Result<Vec<f32>, _>>()
            .map_err(|e| anyhow::anyhow!("WAV 読み取り失敗: {}", e)),
        _ => anyhow::bail!("未対応 WAV 形式: {} bits", spec.bits_per_sample),
    }
}

fn test_openai(args: &CliArgs) -> bool {
    show_section("OPENAI");
    let mut ok = true;

    let api_key = args.openai_key.clone().or_else(|| std::env::var("OPENAI_API_KEY").ok());

    let Some(key) = api_key else {
        println!("  [SKIP] OpenAI API キー未設定");
        println!("  [HELP] --openai-key=sk-xxxxx または OPENAI_API_KEY 環境変数");
        println!();
        return true;
    };

    let wav_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("wav")
        .join("sample-voice.wav");

    if !wav_path.exists() {
        println!("  ✗ サンプル音声なし: {}", wav_path.display());
        println!();
        return true;
    }

    let samples = match decode_wav_to_f32(&wav_path) {
        Ok(s) => s,
        Err(e) => {
            println!("  ✗ WAV デコード失敗: {}", e);
            println!();
            return true;
        }
    };

    println!("  [INFO] サンプル音声: {} ({} samples)", wav_path.display(), samples.len());

    let oa_config = OpenAiConfig {
        base_url: args.base_url.clone(),
        api_key: key,
        model: "gpt-4o-mini-transcribe".into(),
    };
    let locale = Arc::new(parking_lot::Mutex::new(args.locale));
    let mut backend = OpenAIBackend::new(&oa_config, locale);

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            println!("  ✗ Tokio ランタイム作成失敗: {}", e);
            println!();
            return true;
        }
    };
    match rt.block_on(async { backend.transcribe(&samples) }) {
        Ok(text) => println!("  ✓ 認識結果: \"{}\"", text.trim()),
        Err(e) => {
            println!("  ✗ 認識失敗: {}", e);
            ok = false;
        }
    }

    println!();
    ok
}

fn test_voiput(args: &CliArgs) -> bool {
    use indexmap::IndexMap;
    show_section("VOIPUT");
    let mut ok = true;

    // 1. 最小構成
    println!("  [TEST] 最小構成");
    let config = build_voiput_config(args);
    match Voiput::new(config) {
        Ok(_) => println!("    ✓ Voiput::new() 成功"),
        Err(e) => {
            println!("    ✗ 失敗: {}", e);
            ok = false;
        }
    }

    // 2. start/stop ライフサイクル
    println!("  [TEST] start/stop");
    let mut voiput = Voiput::new(build_voiput_config(args))
            .unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();

    match rt.block_on(voiput.start()) {
        Ok(_) => println!("    ✓ start() 成功"),
        Err(e) => {
            println!("    ✗ start() 失敗: {}", e);
            ok = false;
        }
    }
    match rt.block_on(voiput.stop()) {
        Ok(_) => println!("    ✓ stop() 成功"),
        Err(e) => {
            println!("    ✗ stop() 失敗: {}", e);
            ok = false;
        }
    }

    // 3. request_permissions
    println!("  [TEST] request_permissions()");
    match rt.block_on(voiput.request_permissions()) {
        Ok(authorized) => println!("    ✓ → authorized={}", authorized),
        Err(e) => {
            println!("    ✗ 失敗: {}", e);
            ok = false;
        }
    }

    // 4. flush
    println!("  [TEST] flush()");
    match rt.block_on(async { voiput.flush().await }) {
        Ok(text) => println!("    ✓ flush: \"{}\"", text),
        Err(e) => {
            println!("    ✗ 失敗: {}", e);
            ok = false;
        }
    }

    // 5. set_engine
    println!("  [TEST] set_engine()");
    match rt.block_on(voiput.set_engine(SttEngine::OpenAI)) {
        Ok(_) => println!("    ✓ set_engine(OpenAI) → {:?}", voiput.engine()),
        Err(e) => {
            println!("    ✗ 失敗: {}", e);
            ok = false;
        }
    }
    match rt.block_on(voiput.set_engine(SttEngine::Os)) {
        Ok(_) => println!("    ✓ set_engine(Os) → {:?}", voiput.engine()),
        Err(e) => {
            println!("    ✗ 失敗: {}", e);
            ok = false;
        }
    }

    // 6. set_locale
    println!("  [TEST] set_locale()");
    voiput.set_locale(LocaleCode::En);
    voiput.set_locale(LocaleCode::Ja);
    println!("    ✓ OK");

    // 7. update_replaces
    println!("  [TEST] update_replaces()");
    let mut replaces = IndexMap::new();
    replaces.insert("world".to_string(), vec!["hello".to_string()]);
    voiput.update_replaces(replaces);
    println!("    ✓ OK");

    // 8. health_check
    println!("  [TEST] health_check()");
    println!("    = {} (0 = 正常)", voiput.health_check());

    // 9. InputMode
    println!("  [TEST] input_mode()");
    assert_eq!(voiput.input_mode(), InputMode::Buffered);
    println!("    ✓ デフォルト: Buffered");

    // 10. enable_hotkeys + handle_hotkey_events
    println!("  [TEST] enable_hotkeys()");
    voiput.enable_hotkeys();
    voiput.handle_hotkey_events();
    println!("    ✓ OK (no-op on unsupported platforms)");

    println!();
    ok
}
