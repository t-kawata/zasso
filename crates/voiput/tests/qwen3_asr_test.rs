//! Qwen3AsrBackend 結合テスト
//!
//! 実際の ONNX モデルファイルと sample-voice.wav（日本語実音声）を使用して
//! 音声認識パイプラインの動作を検証する。
//!
//! # モデル不在時の動作
//!
//! build.rs が models/qwen3-asr/ にファイルを自動ダウンロードする前提。
//! 不在はビルドの不備を意味するため、テストは失敗（パニック）する。

use std::path::Path;

use voiput::local::qwen3::Qwen3AsrBackend;
use voiput::{AsrBackend, Qwen3AsrConfig, Qwen3AsrModelPaths};

/// モデルファイルの存在を確認し Qwen3AsrConfig を返す。
///
/// モデルが存在しない場合はパニックする（テスト失敗）。
fn qwen3_config_or_fail() -> Qwen3AsrConfig {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let model_dir = manifest_dir.join("models").join("qwen3-asr");
    let tokenizer_dir = manifest_dir.join("models").join("qwen3-asr").join("tokenizer");

    // 必須モデルファイルの存在を確認（不在 → パニック）
    let encoder_path = model_dir.join("encoder.int8.onnx");
    let decoder_path = model_dir.join("decoder.int8.onnx");

    assert!(
        encoder_path.exists(),
        "encoder.int8.onnx が見つかりません: {}\n\
         build.rs で自動ダウンロードされます。",
        encoder_path.display()
    );
    assert!(
        decoder_path.exists(),
        "decoder.int8.onnx が見つかりません: {}",
        decoder_path.display()
    );

    // conv_frontend はオプショナル、tokenizer はディレクトリ
    let conv_frontend = model_dir.join("conv_frontend.onnx");

    Qwen3AsrConfig {
        model_paths: Qwen3AsrModelPaths {
            encoder: encoder_path.to_string_lossy().to_string(),
            decoder: decoder_path.to_string_lossy().to_string(),
            conv_frontend: conv_frontend.to_string_lossy().to_string(),
            tokenizer_dir: tokenizer_dir.to_string_lossy().to_string(),
        },
        provider: "cpu".into(),
        num_threads: 2,
        debug: false,
    }
}

/// sample-voice.wav を読み込み、モノラル f32 PCM として返す。
fn load_sample_wav() -> Vec<f32> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("sample-voice.wav");

    assert!(path.exists(), "テスト用 WAV ファイルが見つかりません: {}", path.display());

    let mut reader = hound::WavReader::open(&path)
        .expect("WAV ファイルを開けません");

    let spec = reader.spec();
    assert_eq!(spec.channels, 1, "WAV はモノラルである必要があります");
    assert_eq!(spec.sample_rate, 16000, "WAV は 16000Hz である必要があります");

    reader
        .samples::<i16>()
        .filter_map(Result::ok)
        .map(|s| s as f32 / i16::MAX as f32)
        .collect()
}

/// Qwen3AsrBackend が実モデルで正しく構築できることを確認する。
///
/// 通常はスキップ（`cargo test -- --ignored` で実行）。
/// 実際の ONNX モデルファイルと音声ファイルが必要。
#[test]
#[ignore = "実際の ONNX モデルが必要。cargo test -- --ignored で実行"]
fn test_qwen3_asr_backend_new() {
    let config = qwen3_config_or_fail();
    let backend = Qwen3AsrBackend::new(&config);
    assert!(
        backend.is_ok(),
        "Qwen3AsrBackend::new() がエラーを返しました: {:?}",
        backend.err()
    );
}

/// 実際の日本語音声を認識し、期待するキーワードが含まれていることを確認する。
///
/// 認識結果は一字一句の完全一致ではなく、キーワードベースの部分一致で検証する。
/// 通常はスキップ（`cargo test -- --ignored` で実行）。
#[test]
#[ignore = "実際の ONNX モデル + 音声ファイルが必要。cargo test -- --ignored で実行"]
fn test_qwen3_asr_transcribe_sample() {
    let config = qwen3_config_or_fail();
    let mut backend = Qwen3AsrBackend::new(&config)
        .expect("Qwen3AsrBackend::new() に失敗しました");

    let samples = load_sample_wav();

    let start = std::time::Instant::now();
    let result = backend
        .transcribe(&samples)
        .expect("transcribe() に失敗しました");
    let elapsed = start.elapsed();

    // 発話内容: 「こんにちは。今日はいい天気ですね。こんな日はお散歩に行きたくなりますね。」
    println!("=== Qwen3-ASR 認識結果 ===");
    println!("{}", result);
    println!("--- 認識時間: {}.{:03} 秒 ---", elapsed.as_secs(), elapsed.subsec_millis());

    // キーワードベースの部分一致検証
    let has_weather = result.contains("天気") || result.contains("気");
    let has_walk = result.contains("散歩") || result.contains("さんぽ") || result.contains("歩");
    let has_greeting =
        result.contains("こんにちは") || result.contains("今日") || result.contains("こん");

    assert!(
        has_weather,
        "認識結果に天候に関する単語が含まれるべきです: {}",
        result
    );
    assert!(
        has_walk,
        "認識結果に散歩/歩行に関する単語が含まれるべきです: {}",
        result
    );
    assert!(
        has_greeting,
        "認識結果に挨拶/今日に関する単語が含まれるべきです: {}",
        result
    );
}
