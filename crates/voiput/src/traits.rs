//! 音声認識バックエンドが実装すべきトレイト群。
//!
//! 従来 crates/trate で定義していたトレイトを voiput 内部に取り込んだもの。
//! 将来、他 crate からも実装可能にする必要が生じた場合は再び独立クレートに切り出す。

use anyhow::Result;

/// 音声認識バックエンドが実装すべきトレイト。
///
/// `transcribe()` のみが必須。その他のメソッドはデフォルト実装を持ち、
/// 必要に応じてオーバーライドする。
pub trait AsrBackend: Send {
    /// 音声データを認識し、テキスト結果を返す（唯一の必須メソッド）。
    ///
    /// `samples`: モノラル f32 PCM、振幅範囲 [-1.0, 1.0]
    /// PseudoAsrStreamer から渡される音声は常に 16kHz に正規化されている。
    fn transcribe(&mut self, samples: &[f32]) -> Result<String>;

    /// 事後補正を実行する（任意）。デフォルト: 入力をそのまま返す。
    fn post_correct(&mut self, text: &str) -> Result<String> {
        Ok(text.to_string())
    }

    /// バックエンドの識別子を返す。
    fn backend_name(&self) -> &'static str {
        "unknown"
    }

    /// ASR API の使用時間を記録する（任意）。
    fn record_asr_usage(&mut self, _duration_ms: u64) {}

    /// 句読点を挿入する（任意）。デフォルト: 入力をそのまま返す。
    fn insert_punctuation(&mut self, text: &str, _locale: &str) -> Result<String> {
        Ok(text.to_string())
    }
}

pub mod local;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::traits::local::LocalAsrBackend;

    struct MockBackend;

    impl AsrBackend for MockBackend {
        fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
            if samples.is_empty() {
                Ok(String::new())
            } else {
                Ok("mock recognition result".to_string())
            }
        }

        fn backend_name(&self) -> &'static str {
            "mock"
        }
    }

    struct MockLocalBackend;

    impl AsrBackend for MockLocalBackend {
        fn transcribe(&mut self, _samples: &[f32]) -> Result<String> {
            Ok("local mock".to_string())
        }

        fn backend_name(&self) -> &'static str {
            "local-mock"
        }
    }

    impl LocalAsrBackend for MockLocalBackend {
        fn model_path(&self) -> &str {
            "/mock/model.onnx"
        }

        fn is_healthy(&self) -> bool {
            true
        }
    }

    #[test]
    fn test_mock_backend_transcribe_empty() {
        let mut backend = MockBackend;
        assert_eq!(backend.transcribe(&[]).unwrap(), "");
    }

    #[test]
    fn test_mock_backend_transcribe_non_empty() {
        let mut backend = MockBackend;
        let samples = vec![0.0f32; 16000];
        assert_eq!(
            backend.transcribe(&samples).unwrap(),
            "mock recognition result"
        );
    }

    #[test]
    fn test_mock_backend_default_backend_name() {
        let backend = MockBackend;
        assert_eq!(backend.backend_name(), "mock");
    }

    #[test]
    fn test_mock_backend_post_correct_passthrough() {
        let mut backend = MockBackend;
        assert_eq!(backend.post_correct("hello").unwrap(), "hello");
    }

    #[test]
    fn test_mock_backend_insert_punctuation_passthrough() {
        let mut backend = MockBackend;
        assert_eq!(backend.insert_punctuation("hello", "ja").unwrap(), "hello");
    }

    #[test]
    fn test_mock_local_backend_model_path() {
        let backend = MockLocalBackend;
        assert_eq!(backend.model_path(), "/mock/model.onnx");
    }

    #[test]
    fn test_mock_local_backend_is_healthy() {
        let backend = MockLocalBackend;
        assert!(backend.is_healthy());
    }
}
