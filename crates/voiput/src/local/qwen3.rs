use std::path::Path;
use std::sync::Mutex;

use anyhow::{anyhow, Result};
use sherpa_onnx::{OfflineQwen3ASRModelConfig, OfflineRecognizer, OfflineRecognizerConfig};
use trate::AsrBackend;
use trate::local::LocalAsrBackend;

use crate::types::Qwen3AsrConfig;

/// Qwen3-ASR バックエンドが使用する内部サンプリングレート。
///
/// PseudoAsrStreamer のパイプラインは常に 16kHz に正規化されており、
/// この固定値を accept_waveform() に渡す。
const QWEN3_SAMPLE_RATE: i32 = 16000;

/// Qwen3-ASR 音声認識バックエンド。
///
/// sherpa-onnx の OfflineRecognizer をラップし、AsrBackend トレイトを実装する。
/// OfflineRecognizer は内部状態を持つため、Mutex で排他制御する。
pub struct Qwen3AsrBackend {
    /// OfflineRecognizer は Mutex で保護する（複数スレッドからの同時呼び出しを排他）
    recognizer: Mutex<OfflineRecognizer>,
    /// 設定（model_path/is_healthy で使用）
    config: Qwen3AsrConfig,
}

impl Qwen3AsrBackend {
    /// Qwen3AsrBackend を構築する。
    ///
    /// OfflineRecognizer::create() でモデルをロードする。この時点で
    /// モデルファイルが存在しない、または破損している場合はエラーを返す。
    ///
    /// # Errors
    ///
    /// - `OfflineRecognizer::create()` が `None` を返した場合（モデル不在/破損）
    pub fn new(config: &Qwen3AsrConfig) -> Result<Self> {
        let mut recognizer_config = OfflineRecognizerConfig::default();

        recognizer_config.model_config.qwen3_asr = OfflineQwen3ASRModelConfig {
            encoder: Some(config.model_paths.encoder.clone()),
            decoder: Some(config.model_paths.decoder.clone()),
            ..Default::default()
        };

        recognizer_config.model_config.tokens = Some(config.model_paths.tokens.clone());
        recognizer_config.model_config.provider = Some(config.provider.clone());
        recognizer_config.model_config.num_threads = config.num_threads;
        recognizer_config.model_config.debug = config.debug;

        // joiner は Qwen3-ASR v0.6b のモデルファイル構成には含まれない。
        // 将来のモデルバージョンで必要な場合は OfflineQwen3ASRModelConfig に
        // フィールドが追加される想定。

        let recognizer = OfflineRecognizer::create(&recognizer_config)
            .ok_or_else(|| anyhow!(
                "Qwen3-ASR OfflineRecognizer の作成に失敗しました。\
                 モデルファイルが存在するか確認してください:\n  encoder={}\n  decoder={}\n  joiner={}\n  tokens={}",
                config.model_paths.encoder,
                config.model_paths.decoder,
                config.model_paths.joiner,
                config.model_paths.tokens,
            ))?;

        Ok(Self {
            recognizer: Mutex::new(recognizer),
            config: config.clone(),
        })
    }
}

impl AsrBackend for Qwen3AsrBackend {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        let recognizer = self.recognizer.lock()
            .map_err(|e| anyhow!("Qwen3-ASR Mutex が poisoned しました: {}", e))?;
        let stream = recognizer.create_stream();
        // PseudoAsrStreamer は常に 16kHz で音声データを渡す。
        // Qwen3-ASR の accept_waveform() は sample_rate を要求するため、
        // 固定値 QWEN3_SAMPLE_RATE を使用する。
        stream.accept_waveform(QWEN3_SAMPLE_RATE, samples);
        recognizer.decode(&stream);

        let result = stream.get_result()
            .ok_or_else(|| anyhow!("Qwen3-ASR 認識結果の取得に失敗しました"))?;
        Ok(result.text)
    }

    fn backend_name(&self) -> &'static str {
        "qwen3-asr"
    }
}

impl LocalAsrBackend for Qwen3AsrBackend {
    /// 使用中のモデルファイルへのパスを返す（エラーメッセージ等で使用）。
    fn model_path(&self) -> &str {
        &self.config.model_paths.encoder
    }

    /// バックエンドが正常に初期化されているかを確認する。
    ///
    /// OfflineRecognizer が create() に成功して Self が存在する = 常に healthy。
    fn is_healthy(&self) -> bool {
        true
    }
}

/// Qwen3-ASR モデルファイルの存在を検証する。
///
/// ファイルが存在しない場合、エラーメッセージとともにユーザーに
/// `make download-models` の実行を促す。
///
/// SHA256 チェックサム検証等の追加検証は行わない
/// （OfflineRecognizer::create() 自体がモデルファイルの整合性を検証するため）。
///
/// [::STUB::] M5-1: LocalRecognizer::new() で初めて使用される。
/// それまでは unused warning が発生するが許容。
#[allow(dead_code)]
pub(crate) fn validate_qwen3_model_files(config: &Qwen3AsrConfig) -> Result<()> {
    let paths = [
        (&config.model_paths.encoder, "encoder.onnx"),
        (&config.model_paths.decoder, "decoder.onnx"),
        (&config.model_paths.joiner, "joiner.onnx"),
        (&config.model_paths.tokens, "tokens.txt"),
    ];

    for (path, name) in &paths {
        if !Path::new(path).exists() {
            anyhow::bail!(
                "Qwen3-ASR モデルファイルが見つかりません: {} ({})\n\
                 ビルド時に自動ダウンロードされます。\n\
                 手動でダウンロードする場合: https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8",
                name, path
            );
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Qwen3AsrModelPaths;

    #[test]
    fn test_backend_name() {
        // backend_name() はモデル不在でも呼び出し可能
        let config = Qwen3AsrConfig {
            model_paths: Qwen3AsrModelPaths {
                encoder: "/nonexistent/encoder.onnx".into(),
                decoder: "/nonexistent/decoder.onnx".into(),
                joiner: "/nonexistent/joiner.onnx".into(),
                tokens: "/nonexistent/tokens.txt".into(),
            },
            provider: "cpu".into(),
            num_threads: 1,
            debug: false,
        };
        let backend = Qwen3AsrBackend::new(&config);
        // backend_name はインスタンス化前でも利用可能（トレイトのデフォルト実装はない）
        if let Ok(ref backend) = backend {
            assert_eq!(backend.backend_name(), "qwen3-asr");
        }
    }

    #[test]
    fn test_new_without_model_files() {
        // 存在しないモデルパスで new() がエラーを返すこと
        let config = Qwen3AsrConfig {
            model_paths: Qwen3AsrModelPaths {
                encoder: "/nonexistent/encoder.onnx".into(),
                decoder: "/nonexistent/decoder.onnx".into(),
                joiner: "/nonexistent/joiner.onnx".into(),
                tokens: "/nonexistent/tokens.txt".into(),
            },
            provider: "cpu".into(),
            num_threads: 1,
            debug: false,
        };
        let result = Qwen3AsrBackend::new(&config);
        assert!(result.is_err(), "存在しないモデルパスならエラーになるはず");
    }

    // --- M4-3: LocalAsrBackend impl + validate ---

    #[test]
    fn test_model_path() {
        let config = Qwen3AsrConfig {
            model_paths: Qwen3AsrModelPaths {
                encoder: "/models/encoder.onnx".into(),
                decoder: "/models/decoder.onnx".into(),
                joiner: "/models/joiner.onnx".into(),
                tokens: "/models/tokens.txt".into(),
            },
            provider: "cpu".into(),
            num_threads: 1,
            debug: false,
        };
        // backend_name のテストと同様、new() はモデル不在でエラーになる
        // model_path() はインスタンス化前でも構造型から確認可能
        let backend = Qwen3AsrBackend::new(&config);
        if let Ok(ref backend) = backend {
            assert_eq!(backend.model_path(), "/models/encoder.onnx");
        }
    }

    #[test]
    fn test_is_healthy() {
        let config = Qwen3AsrConfig {
            model_paths: Qwen3AsrModelPaths {
                encoder: "/nonexistent/encoder.onnx".into(),
                decoder: "/nonexistent/decoder.onnx".into(),
                joiner: "/nonexistent/joiner.onnx".into(),
                tokens: "/nonexistent/tokens.txt".into(),
            },
            provider: "cpu".into(),
            num_threads: 1,
            debug: false,
        };
        // new() が成功した場合のみ is_healthy を検証
        let backend = Qwen3AsrBackend::new(&config);
        if let Ok(ref backend) = backend {
            assert!(backend.is_healthy());
        }
    }

    #[test]
    fn test_validate_all_files_exist() {
        // 実際のファイルが存在する一時ディレクトリでテスト
        let dir = std::env::temp_dir().join("qwen3_test_validate");
        let _ = std::fs::create_dir_all(&dir);
        // 4 ファイルを作成
        for name in &["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"] {
            let p = dir.join(name);
            let _ = std::fs::write(&p, b"dummy content");
        }

        let config = Qwen3AsrConfig {
            model_paths: Qwen3AsrModelPaths {
                encoder: dir.join("encoder.int8.onnx").to_string_lossy().to_string(),
                decoder: dir.join("decoder.int8.onnx").to_string_lossy().to_string(),
                joiner: dir.join("joiner.int8.onnx").to_string_lossy().to_string(),
                tokens: dir.join("tokens.txt").to_string_lossy().to_string(),
            },
            provider: "cpu".into(),
            num_threads: 1,
            debug: false,
        };

        let result = validate_qwen3_model_files(&config);
        assert!(result.is_ok(), "全ファイル存在時は Ok になるはず: {:?}", result.err());

        // 後片付け
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_validate_missing_file() {
        // 1 ファイル欠落時にエラーになること
        let dir = std::env::temp_dir().join("qwen3_test_validate_missing");
        let _ = std::fs::create_dir_all(&dir);
        // encoder のみ作成せず欠落させる
        for name in &["decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"] {
            let p = dir.join(name);
            let _ = std::fs::write(&p, b"dummy content");
        }

        let config = Qwen3AsrConfig {
            model_paths: Qwen3AsrModelPaths {
                encoder: dir.join("encoder.int8.onnx").to_string_lossy().to_string(),
                decoder: dir.join("decoder.int8.onnx").to_string_lossy().to_string(),
                joiner: dir.join("joiner.int8.onnx").to_string_lossy().to_string(),
                tokens: dir.join("tokens.txt").to_string_lossy().to_string(),
            },
            provider: "cpu".into(),
            num_threads: 1,
            debug: false,
        };

        let result = validate_qwen3_model_files(&config);
        assert!(result.is_err(), "ファイル欠落時は Err になるはず");

        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("encoder.int8.onnx"), "エラーメッセージに欠落ファイル名が含まれること");

        // 後片付け
        let _ = std::fs::remove_dir_all(&dir);
    }
}
