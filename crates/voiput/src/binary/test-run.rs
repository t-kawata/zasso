//! voiput test-run — 開発用デモツール
//!
//! `cargo run --bin test-run` で実行。
//! 各チケット完了時に関数が追加されていく。
//!
//! M5-2 時点: Stage 7/7 — Phase 4 （Voiput 公開API）

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use voiput::{
    apply_replaces, get_tokenizer, init, is_worthy_to_run_asr, play_commit_sound, play_ready_sound,
};
use voiput::{
    DenoiserConfig, InternalResampler, LocaleCode, OpenAiConfig, OpenAIBackend,
    PostCorrectionBackend, PostCorrectionConfig, ProcessorOutput, PunctuationMachine,
    SignalFilterConfig, SincResampler, SttEngine, VadConfig, VadModelPaths, VoiputConfig,
};
use voiput::{PostCorrectionProcessor, SttModelType};
use voiput::{
    VadProcessor, VadProcessorConfig, VadProcessorType, SILERO_VAD_WINDOW_SIZE,
    TEN_VAD_WINDOW_SIZE, VAD_SAMPLE_RATE, Voiput,
};

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
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "--audio-verify" {
        audio_verify();
        return;
    }

    println!("========================================");
    println!("  voiput test-run");
    println!("  Stage 7/7 —  Phase 4 公開API");
    println!("========================================");
    println!();

    test_config();
    test_resampler();
    test_post_correct();
    test_signal_filter();
    test_interceptor();
    test_vad();
    test_punctuation();
    test_audio();
    test_streamer();
    test_openai();
    #[cfg(target_os = "macos")]
    test_macos();
    #[cfg(target_os = "windows")]
    test_windows();
    test_voiput();
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

fn test_config() {
    show_section("CONFIG");

    println!("  [TEST] 正常系: 最小構成 (Engine=Os, locale=Ja)");
    let config = VoiputConfig::builder()
        .engine(SttEngine::Os)
        .locale(LocaleCode::Ja)
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx").into(),
            ten: model_path("ten_vad.onnx").into(),
            gtcrn: String::new(),
        })
        .build();
    match config {
        Ok(cfg) => {
            println!("    ✓ build() 成功");
            println!("    engine: {:?}", cfg.engine);
            println!("    locale: {:?}", cfg.locale);
            println!("    speech_timeout_sec: {}", cfg.speech_timeout_sec);
            println!("    punctuation: {}", cfg.punctuation);
        }
        Err(e) => println!("    ✗ build() 失敗: {}", e),
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
            silero: model_path("silero_vad.onnx").into(),
            ten: model_path("ten_vad.onnx").into(),
            gtcrn: String::new(),
        })
        .build();
    match config {
        Ok(cfg) => {
            println!("    ✓ build() 成功");
            println!("    engine: {:?}", cfg.engine);
            println!("    locale: {:?}", cfg.locale);
            println!("    openai model: {:?}", cfg.openai_config.map(|c| c.model));
        }
        Err(e) => println!("    ✗ build() 失敗: {}", e),
    }

    println!("  [TEST] 異常系: locale 未指定");
    let result = VoiputConfig::builder()
        .engine(SttEngine::Os)
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx").into(),
            ten: model_path("ten_vad.onnx").into(),
            gtcrn: String::new(),
        })
        .build();
    match result {
        Ok(_) => {
            println!("    ✗ エラーになるべき");
        }
        Err(e) => println!("    ✓ 正しくエラー: {}", e),
    }

    println!("  [TEST] 異常系: OpenAI config なし (engine=OpenAi)");
    let result = VoiputConfig::builder()
        .engine(SttEngine::OpenAI)
        .locale(LocaleCode::Ja)
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx").into(),
            ten: model_path("ten_vad.onnx").into(),
            gtcrn: String::new(),
        })
        .build();
    match result {
        Ok(_) => {
            println!("    ✗ エラーになるべき");
        }
        Err(e) => println!("    ✓ 正しくエラー: {}", e),
    }

    println!("  [INFO] Config デフォルト値:");
    println!(
        "    VadConfig.threshold: {}",
        VadConfig::default().threshold
    );
    println!(
        "    PostCorrectionConfig.sentence_count: {}",
        PostCorrectionConfig::default().sentence_count_threshold
    );
    println!(
        "    SignalFilterConfig.rms_threshold: {}",
        SignalFilterConfig::default().rms_threshold
    );
    println!(
        "    DenoiserConfig.enabled: {}",
        DenoiserConfig::default().enabled
    );
    println!();
}

fn test_resampler() {
    show_section("RESAMPLER");

    // 48kHz 正弦波を生成して 16kHz にリサンプリング
    let input_rate = 48000u32;
    let output_rate = 16000u32;
    let sample_count = 4800;
    let input: Vec<f32> = (0..sample_count).map(|i| (i as f32 * 0.01).sin()).collect();

    println!(
        "  [TEST] SincResampler: {}Hz → {}Hz ({} samples)",
        input_rate,
        output_rate,
        input.len()
    );

    match SincResampler::new(input_rate, output_rate) {
        Ok(mut resampler) => match resampler.process(&input) {
            Ok(output) => {
                println!("    入力長: {}", input.len());
                println!("    出力長: {}", output.len());
                if !output.is_empty() && output.len() > input.len() / 4 {
                    println!("    ✓ PASS: 出力が空でなく、期待範囲内");
                } else {
                    println!(
                        "    ✗ FAIL: 出力長={} (期待: {}〜{})",
                        output.len(),
                        input.len() / 4,
                        input.len() / 2
                    );
                }
            }
            Err(e) => println!("    ✗ FAIL: process() エラー: {}", e),
        },
        Err(e) => println!("    ✗ FAIL: SincResampler::new() エラー: {}", e),
    }

    // 同一レートのパススルーテスト
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
                    }
                }
                Err(e) => println!("    ✗ FAIL: {}", e),
            }
        }
        Err(e) => println!("    ✗ FAIL: SincResampler::new() エラー: {}", e),
    }

    println!();
}

fn test_interceptor() {
    use indexmap::IndexMap;
    use parking_lot::RwLock;

    show_section("INTERCEPTOR");

    // 1. 空マップ → passthrough
    let empty_map: RwLock<IndexMap<String, Vec<String>>> = RwLock::new(IndexMap::new());
    if apply_replaces(&empty_map, "hello") == "hello" {
        println!("  [TEST] 空マップ → passthrough: ✓ PASS");
    } else {
        println!("  [TEST] 空マップ → passthrough: ✗ FAIL");
    }

    // 2. 単一置換
    let map: RwLock<IndexMap<String, Vec<String>>> = RwLock::new(IndexMap::new());
    {
        let mut m = map.write();
        m.insert("world".to_string(), vec!["hello".to_string()]);
    }
    if apply_replaces(&map, "hello") == "world" {
        println!("  [TEST] 単一置換 → world: ✓ PASS");
    } else {
        println!("  [TEST] 単一置換 → world: ✗ FAIL");
    }

    // 3. 複数置換
    let map: RwLock<IndexMap<String, Vec<String>>> = RwLock::new(IndexMap::new());
    {
        let mut m = map.write();
        m.insert(
            "MYCUTE".to_string(),
            vec!["mycute".to_string(), "MyCute".to_string()],
        );
    }
    let result = apply_replaces(&map, "mycute is MyCute");
    if result == "MYCUTE is MYCUTE" {
        println!("  [TEST] 複数置換: ✓ PASS");
    } else {
        println!("  [TEST] 複数置換: ✗ FAIL (got: {})", result);
    }

    // 4. 最長一致優先
    let map: RwLock<IndexMap<String, Vec<String>>> = RwLock::new(IndexMap::new());
    {
        let mut m = map.write();
        m.insert("α".to_string(), vec!["a".to_string()]);
        m.insert("αβ".to_string(), vec!["ab".to_string()]);
    }
    if apply_replaces(&map, "ab") == "αβ" {
        println!("  [TEST] 最長一致優先 → αβ: ✓ PASS");
    } else {
        println!("  [TEST] 最長一致優先 → αβ: ✗ FAIL");
    }

    println!();
}

fn show_section(name: &str) {
    println!("--- [{}] ---", name);
}

fn test_vad() {
    show_section("VAD");

    // 定数確認（モデルファイル不要）
    assert_eq!(VAD_SAMPLE_RATE, 16000);
    assert_eq!(SILERO_VAD_WINDOW_SIZE, 512);
    assert_eq!(TEN_VAD_WINDOW_SIZE, 256);
    println!("  ✓ 定数一致");

    // モデルファイルは build.rs によって $CARGO_MANIFEST_DIR/models/ に自動配置される
    let models_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("models");
    let model_candidates = [
        "silero_vad.onnx",
        "silero_vad.int8.onnx",
        "ten_vad.onnx",
        "ten-vad.int8.onnx",
    ];

    // 最初に見つかった VAD モデルで初期化テスト
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
                println!(
                    "    ✓ VadProcessor::new(\"{}\") 成功 (window_size={})",
                    name,
                    vad.window_size()
                );
                initialized = true;
                break;
            }
            Err(e) => {
                println!("    ✗ VadProcessor::new(\"{}\") 失敗: {}", name, e);
            }
        }
    }
    if !initialized {
        println!("  ✗ FAIL: いずれの VAD モデルも初期化できませんでした");
        println!("         build.rs が自動ダウンロードしたモデルが");
        println!(
            "         {} に存在することを確認してください",
            models_dir.display()
        );
    }
    println!();
}

fn test_signal_filter() {
    show_section("SIGNAL_FILTER");

    let config = SignalFilterConfig::default();
    let good_samples = vec![0.1f32; 16000];

    // 1. 空スライス
    if !is_worthy_to_run_asr(&[], &config, 300, 16000) {
        println!("  [TEST] 空スライス → false: ✓ PASS");
    } else {
        println!("  [TEST] 空スライス → false: ✗ FAIL");
    }

    // 2. 低振幅
    let low_rms = vec![0.001f32; 16000];
    if !is_worthy_to_run_asr(&low_rms, &config, 300, 16000) {
        println!("  [TEST] 低振幅 (RMS不足) → false: ✓ PASS");
    } else {
        println!("  [TEST] 低振幅 (RMS不足) → false: ✗ FAIL");
    }

    // 3. 正常信号
    if is_worthy_to_run_asr(&good_samples, &config, 300, 16000) {
        println!("  [TEST] 正常信号 → true: ✓ PASS");
    } else {
        println!("  [TEST] 正常信号 → true: ✗ FAIL");
    }

    // 4. disabled
    let disabled = SignalFilterConfig {
        enabled: false,
        ..Default::default()
    };
    if is_worthy_to_run_asr(&[], &disabled, 300, 16000) {
        println!("  [TEST] disabled → true: ✓ PASS");
    } else {
        println!("  [TEST] disabled → true: ✗ FAIL");
    }

    println!();
}

fn test_post_correct() {
    show_section("POST_CORRECT");

    let is_speaking = Arc::new(AtomicBool::new(false));
    let backend: Arc<dyn PostCorrectionBackend> = Arc::new(MockPostCorrectBackend);

    // 1. OfflineModel: 追記動作
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
                println!("    ✓ PASS: \"hello\" + \"world\" → \"helloworld\"");
            } else {
                println!("    ✗ FAIL: expected \"hello\" + \"world\" → \"helloworld\", got \"{}\" + \"{}\"", a, b);
            }
        }
        _ => println!("    ✗ FAIL: unexpected output type"),
    }

    // 2. OnlineModel: 上書き動作
    println!("  [TEST] OnlineModel: 上書き動作");
    let mut proc = PostCorrectionProcessor::with_model_type(
        backend.clone(),
        PostCorrectionConfig::default(),
        SttModelType::UseOnlineModel,
        is_speaking.clone(),
    );
    let out1 = proc.process_input("hello");
    let out2 = proc.process_input("hello world");
    match (out1, out2) {
        (Some(ProcessorOutput::Partial(a)), Some(ProcessorOutput::Partial(b))) => {
            if a == "hello" && b == "hello world" {
                println!("    ✓ PASS: \"hello\" + \"hello world\" → \"hello world\"");
            } else {
                println!("    ✗ FAIL: got \"{}\" + \"{}\"", a, b);
            }
        }
        _ => println!("    ✗ FAIL: unexpected output type"),
    }

    // 3. commit_correction: バッファクリア確認
    println!("  [TEST] commit_correction: バッファクリア");
    let mut proc = PostCorrectionProcessor::new(
        backend.clone(),
        PostCorrectionConfig::default(),
        is_speaking.clone(),
    );
    let _ = proc.process_input("hello world");
    match proc.commit_correction("corrected output") {
        ProcessorOutput::Final(ref text) if text.contains("corrected output") => {
            println!("    ✓ commit OK");
        }
        _ => println!("    ✗ commit 失敗"),
    }
    match proc.process_input("next") {
        Some(ProcessorOutput::Partial(ref text)) if text == "next" => {
            println!("    ✓ バッファクリア確認: \"{}\" (重複なし)", text);
        }
        _ => println!("    ✗ バッファクリア失敗"),
    }

    println!();
}

fn test_punctuation() {
    show_section("PUNCTUATION");

    println!("  [TEST] Lindera tokenizer 初期化");
    match get_tokenizer() {
        Ok(_) => println!("    ✓ get_tokenizer() 成功"),
        Err(e) => println!("    ✗ get_tokenizer() 失敗: {}", e),
    }

    println!("  [TEST] 日本語句読点付与 (allow_terminal=false)");
    match PunctuationMachine::new() {
        Ok(machine) => {
            let inputs = [
                ("こんにちは元気ですか", &LocaleCode::Ja, false),
                ("そうです", &LocaleCode::Ja, false),
                ("それですか", &LocaleCode::Ja, false),
            ];
            for (text, locale, allow_terminal) in &inputs {
                match machine.insert_with_context(text, "", *locale, *allow_terminal) {
                    Ok(result) => {
                        let has_period = result.contains('。') || result.contains('、');
                        let has_question = result.contains('？');
                        let punct = if has_question {
                            "？"
                        } else if has_period {
                            "。"
                        } else {
                            "なし"
                        };
                        println!("    \"{}\" → \"{}\"  [句読点: {}]", text, result, punct);
                    }
                    Err(e) => println!("    ✗ 句読点挿入失敗: {}", e),
                }
            }
        }
        Err(e) => println!("    ✗ PunctuationMachine::new() 失敗: {}", e),
    }

    println!("  [TEST] 日本語句読点付与 (allow_terminal=true: タイムアウト時相当)");
    match PunctuationMachine::new() {
        Ok(machine) => {
            let inputs = ["こんにちは元気ですか", "そうです", "それですか"];
            for text in &inputs {
                match machine.insert_with_context(text, "", &LocaleCode::Ja, true) {
                    Ok(result) => {
                        let has_question = result.contains('？');
                        let has_period = result.contains('。');
                        let punct = if has_question {
                            "？"
                        } else if has_period {
                            "。"
                        } else {
                            "なし"
                        };
                        println!("    \"{}\" → \"{}\"  [{}]", text, result, punct);
                    }
                    Err(e) => println!("    ✗ エラー: {}", e),
                }
            }
        }
        Err(e) => println!("    ✗ PunctuationMachine::new() 失敗: {}", e),
    }

    println!("  [TEST] 英語パススルー");
    match PunctuationMachine::new() {
        Ok(machine) => match machine.insert("hello world", &LocaleCode::En) {
            Ok(result) => {
                if result == "hello world" {
                    println!("    ✓ \"hello world\" → \"{}\"", result);
                } else {
                    println!("    ✗ 変更が発生しました: \"{}\"", result);
                }
            }
            Err(e) => println!("    ✗ エラー: {}", e),
        },
        Err(e) => println!("    ✗ PunctuationMachine::new() 失敗: {}", e),
    }

    println!();
}

fn test_audio() {
    show_section("AUDIO");

    println!("  [TEST] オーディオ初期化");
    match init() {
        Ok(_) => println!("    ✓ init() 成功"),
        Err(e) => {
            println!("    [SKIP] init() 失敗: {} (ヘッドレス環境では無視)", e);
            println!();
            return;
        }
    }

    println!("  [TEST] 効果音再生呼び出し");
    play_ready_sound();
    println!("    ✓ play_ready_sound() 呼び出し成功");
    play_commit_sound();
    println!("    ✓ play_commit_sound() 呼び出し成功");
    println!("  [NOTE] 実際の音声は別スレッドで非同期再生されます");

    println!();
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

fn test_streamer() {
    show_section("STREAMER");

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
    let backend = MockStreamerBackend {
        call_count: call_count.clone(),
    };

    match PseudoAsrStreamer::new(backend, tx, config) {
        Ok(mut streamer) => {
            println!("  ✓ PseudoAsrStreamer::new() 成功");
            match streamer.start() {
                Ok(_) => println!("  ✓ start() 成功（VAD モデル: silero_vad.onnx）"),
                Err(e) => println!("  ✗ start() 失敗: {}", e),
            }
            streamer.stop();
            println!("  ✓ start → stop 正常終了");
        }
        Err(e) => println!("  ✗ PseudoAsrStreamer::new() 失敗: {}", e),
    }

    println!();
}

#[cfg(target_os = "windows")]
fn test_windows() {
    use tokio::sync::mpsc;
    use voiput::{LocaleCode, WinSpeechBackend};

    show_section("WINDOWS");

    let (tx, _rx) = mpsc::channel(10);
    let locale = Arc::new(parking_lot::Mutex::new(LocaleCode::Ja));

    match WinSpeechBackend::new(tx, locale, None, None, None) {
        Ok(backend) => {
            println!("  ✓ WinSpeechBackend::new() 成功 (SpeechHelper.lib リンク OK)");
            backend.cleanup();
        }
        Err(msg) => {
            println!("  [INFO] スタブライブラリ: {} (build.rs の自動生成)", msg);
            println!("  [INFO] 自動ビルド用のスクリプトは native/cs/build.ps1 です。");
            println!("  [INFO] M6-1.6 でランタイムライブラリが解決されると有効化されます。");
        }
    }
    println!();
}

#[cfg(target_os = "macos")]
fn test_macos() {
    use tokio::sync::mpsc;
    use voiput::{LocaleCode, MacSpeechBackend};

    show_section("MACOS");

    // build.rs が自動生成するスタブ libSpeechHelper.a がリンクされる。
    // スタブでもリンク自体は成功するため、new() の戻り値で状態を確認する。
    let (tx, _rx) = mpsc::channel(10);
    let locale = Arc::new(parking_lot::Mutex::new(LocaleCode::Ja));

    match MacSpeechBackend::new(tx, locale, None, None, None) {
        Ok(backend) => {
            println!("  ✓ MacSpeechBackend::new() 成功 (libSpeechHelper.a リンク OK)");
            backend.cleanup();
        }
        Err(msg) => {
            println!("  [INFO] スタブライブラリ: {} (build.rs の自動生成)", msg);
            println!("  [INFO] 実ライブラリは prebuilt/macos/ に自動ビルド済みです。");
            println!("  [INFO] libs/macos/ にランタイム dylib が不足しているためスタブを使用しています。");
        }
    }
    println!();
}

fn decode_wav_to_f32(path: &std::path::Path) -> anyhow::Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<Result<Vec<f32>, _>>()
            .map_err(|e| anyhow::anyhow!("WAV float 読み取り失敗: {}", e)),
        hound::SampleFormat::Int if spec.bits_per_sample <= 16 => reader
            .samples::<i16>()
            .map(|s| s.map(|v| v as f32 / 32768.0))
            .collect::<Result<Vec<f32>, _>>()
            .map_err(|e| anyhow::anyhow!("WAV int16 読み取り失敗: {}", e)),
        _ => anyhow::bail!(
            "未対応の WAV 形式: {} bits {} (16-bit PCM または Float のみ対応)",
            spec.bits_per_sample,
            match spec.sample_format {
                hound::SampleFormat::Float => "Float",
                hound::SampleFormat::Int => "Int",
            },
        ),
    }
}

fn test_openai() {
    show_section("OPENAI");

    let api_key = std::env::args()
        .skip(1)
        .find(|a| a.starts_with("--openai-key="))
        .map(|a| a.trim_start_matches("--openai-key=").to_string())
        .or_else(|| std::env::var("OPENAI_API_KEY").ok());

    let base_url = std::env::args()
        .skip(1)
        .find(|a| a.starts_with("--base-url="))
        .map(|a| a.trim_start_matches("--base-url=").to_string())
        .or_else(|| std::env::var("OPENAI_BASE_URL").ok())
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

    let Some(key) = api_key else {
        println!("  [SKIP] OpenAI API キーが設定されていません");
        println!("  [HELP] cargo run --bin test-run -- --openai-key=sk-xxxxx [--base-url=...]");
        println!();
        return;
    };

    let wav_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("wav")
        .join("sample-voice.wav");

    if !wav_path.exists() {
        println!("  ✗ サンプル音声が見つかりません: {}", wav_path.display());
        println!();
        return;
    }

    let samples = match decode_wav_to_f32(&wav_path) {
        Ok(s) => s,
        Err(e) => {
            println!("  ✗ WAV デコード失敗: {}", e);
            println!();
            return;
        }
    };

    println!("  [INFO] API 設定:");
    println!("    base_url: {} (デフォルト: https://api.openai.com/v1, 上書き: --base-url=... または OPENAI_BASE_URL)", base_url);
    println!("    model: gpt-4o-mini-transcribe");
    println!("  [INFO] サンプル音声: {} ({} samples)", wav_path.display(), samples.len());

    let oa_config = OpenAiConfig {
        base_url,
        api_key: key,
        model: "gpt-4o-mini-transcribe".into(),
    };
    let locale = Arc::new(parking_lot::Mutex::new(LocaleCode::Ja));
    let mut backend = OpenAIBackend::new(&oa_config, locale);

    // transcribe() は内部で Tokio ランタイムが必要（async-openai 呼び出しのため）
    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            println!("  ✗ Tokio ランタイム作成失敗: {}", e);
            println!();
            return;
        }
    };
    match rt.block_on(async { backend.transcribe(&samples) }) {
        Ok(text) => {
            println!("  ✓ 認識結果: \"{}\"", text.trim());
        }
        Err(e) => {
            println!("  ✗ 認識失敗: {}", e);
        }
    }

    println!();
}

fn test_voiput() {
    use indexmap::IndexMap;

    show_section("VOIPUT");

    // 1. 最小構成
    println!("  [TEST] 最小構成 (Os+Ja)");
    let minimal_config = VoiputConfig::builder()
        .engine(SttEngine::Os)
        .locale(LocaleCode::Ja)
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx").into(),
            ten: model_path("ten_vad.onnx").into(),
            gtcrn: String::new(),
        })
        .build();
    match minimal_config {
        Ok(cfg) => match Voiput::new(cfg) {
            Ok(_) => println!("    ✓ Voiput::new() 成功"),
            Err(e) => println!("    ✗ Voiput::new() 失敗: {}", e),
        },
        Err(e) => println!("    ✗ config.build() 失敗: {}", e),
    }

    // 2. OpenAI 構成
    println!("  [TEST] OpenAI 構成");
    let openai_config = VoiputConfig::builder()
        .engine(SttEngine::OpenAI)
        .locale(LocaleCode::En)
        .openai_config(OpenAiConfig {
            base_url: "https://api.openai.com/v1".into(),
            api_key: "sk-test".into(),
            model: "gpt-4o-mini-transcribe".into(),
        })
        .vad_model_paths(VadModelPaths {
            silero: model_path("silero_vad.onnx").into(),
            ten: model_path("ten_vad.onnx").into(),
            gtcrn: String::new(),
        })
        .build();
    match openai_config {
        Ok(cfg) => match Voiput::new(cfg) {
            Ok(_) => println!("    ✓ Voiput::new() 成功"),
            Err(e) => println!("    ✗ Voiput::new() 失敗: {}", e),
        },
        Err(e) => println!("    ✗ config.build() 失敗: {}", e),
    }

    // 3. start/stop ライフサイクル
    println!("  [TEST] start/stop ライフサイクル");
    let mut voiput = Voiput::new(
        VoiputConfig::builder()
            .engine(SttEngine::Os)
            .locale(LocaleCode::Ja)
            .vad_model_paths(VadModelPaths {
                silero: model_path("silero_vad.onnx").into(),
                ten: model_path("ten_vad.onnx").into(),
                gtcrn: String::new(),
            })
            .build()
            .unwrap(),
    )
    .unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();

    // start() の呼び出し（async → sync ブリッジ）
    match rt.block_on(voiput.start()) {
        Ok(_) => println!("    ✓ start() 成功"),
        Err(e) => println!("    ✗ start() 失敗: {}", e),
    }
    // stop() の呼び出し
    match rt.block_on(voiput.stop()) {
        Ok(_) => println!("    ✓ stop() 成功"),
        Err(e) => println!("    ✗ stop() 失敗: {}", e),
    }
    println!("  [NOTE] start()/stop() は API 呼び出しの正常系確認です。");
    println!("         実際の音声認識には VAD モデルファイルとネイティブバックエンドが必要です。");

    // 4. request_permissions 呼び出し
    println!("  [TEST] request_permissions()");
    match rt.block_on(voiput.request_permissions()) {
        Ok(authorized) => println!("    ✓ request_permissions() → authorized={}", authorized),
        Err(e) => println!("    ✗ request_permissions() 失敗: {}", e),
    }

    // 5. flush 呼び出し
    println!("  [TEST] flush()");
    let flush_result = rt.block_on(async { voiput.flush().await });
    match flush_result {
        Ok(text) => println!("    ✓ flush() 成功: \"{}\"", text),
        Err(e) => println!("    ✗ flush() 失敗: {}", e),
    }

    // 6. エンジン切り替え
    println!("  [TEST] set_engine()");
    match rt.block_on(voiput.set_engine(SttEngine::OpenAI)) {
        Ok(_) => println!("    ✓ set_engine(OpenAI) → engine={:?}", voiput.engine()),
        Err(e) => println!("    ✗ set_engine(OpenAI) 失敗: {}", e),
    }
    match rt.block_on(voiput.set_engine(SttEngine::Os)) {
        Ok(_) => println!("    ✓ set_engine(Os) → engine={:?}", voiput.engine()),
        Err(e) => println!("    ✗ set_engine(Os) 失敗: {}", e),
    }

    // 7. ロケール変更
    println!("  [TEST] set_locale()");
    voiput.set_locale(LocaleCode::En);
    voiput.set_locale(LocaleCode::Ja);
    println!("    ✓ set_locale 成功");

    // 8. 置換辞書更新
    println!("  [TEST] update_replaces()");
    let mut replaces = IndexMap::new();
    replaces.insert("world".to_string(), vec!["hello".to_string()]);
    voiput.update_replaces(replaces);
    println!("    ✓ update_replaces 成功");

    // 9. ヘルスチェック
    println!("  [TEST] health_check()");
    println!("    health_check() = {} (スタブ: M7-3 で実装予定)", voiput.health_check());
    println!("  [NOTE] 現在は常に 0 を返すスタブ実装です。M7-3 で本当のヘルスチェックに差し替わります。");

    println!();
}
