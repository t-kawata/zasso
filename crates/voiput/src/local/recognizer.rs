use anyhow::{anyhow, Result};
use crate::traits::AsrBackend;
use crate::traits::local::LocalAsrBackend;

use crate::config::VoiputConfig;
use crate::types::{LocaleCode, LocalAsrKind};

use super::qwen3::{validate_qwen3_model_files, Qwen3AsrBackend};

/// ローカル ASR バックエンドの統括 Facade。
///
/// 複数のローカル ASR モデル（Qwen3-ASR, 将来の Whisper / SenseVoice 等）を
/// Box<dyn LocalAsrBackend> として内部に保持し、PseudoAsrStreamer に対して
/// 単一の AsrBackend 実装として振る舞う。
pub struct LocalRecognizer {
    /// ローカル ASR バックエンド
    backend: Box<dyn LocalAsrBackend>,
    /// バックエンドの種別
    kind: LocalAsrKind,
    /// ロケール（将来のモデル用に保持。Qwen3-ASR は使用しない）
    #[allow(dead_code)]
    locale: LocaleCode,
}

impl LocalRecognizer {
    /// LocalRecognizer を構築する。
    ///
    /// 将来のモデル追加時はここに新しい分岐を追加する。
    pub fn new(kind: LocalAsrKind, config: &VoiputConfig) -> Result<Self> {
        let backend: Box<dyn LocalAsrBackend> = match kind {
            LocalAsrKind::Qwen3Asr => {
                // Qwen3-ASR 設定が存在することを確認
                let qwen3_config = config.qwen3_asr_config
                    .as_ref()
                    .ok_or_else(|| anyhow!(
                        "SttEngine::Local(Qwen3Asr) には qwen3_asr_config の設定が必須です"
                    ))?;

                // モデルファイルの存在を検証
                validate_qwen3_model_files(qwen3_config)?;

                // Qwen3AsrBackend を生成
                Box::new(Qwen3AsrBackend::new(qwen3_config)?)
            }
        };

        Ok(Self {
            backend,
            kind,
            locale: config.locale,
        })
    }

    /// バックエンドの種別を返す。
    pub fn kind(&self) -> LocalAsrKind {
        self.kind
    }
}

impl AsrBackend for LocalRecognizer {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        self.backend.transcribe(samples)
    }

    fn backend_name(&self) -> &'static str {
        match self.kind {
            LocalAsrKind::Qwen3Asr => "qwen3-asr",
        }
    }
}
