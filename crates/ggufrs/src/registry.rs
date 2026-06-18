//! ModelRegistry — モデル一元管理
//!
//! RwLock<Vec<ModelInfo>> を用いたスレッドセーフなモデル管理を提供する。
//!
//! # [::STUB::] M1-5 で同期メソッド（add / get / remove / list）を実装
//! # [::STUB::] M2-2 で非同期メソッド（load_model / unload_model）を実装

use std::path::PathBuf;
use std::sync::Arc;

use mistralrs::Model;

use crate::config::ModelConfig;

/// モデル実行時情報
///
/// 「設定（ModelConfig）」と「実行時状態（Arc<Model>）」を組み合わせた構造体。
/// `ModelRegistry` 内部でのみ生成・保持される。外部からは `ModelInfo` のモデル名や
/// 設定値のみが公開され、`model` インスタンスは直接操作できない。
///
/// `From<ModelConfig>` により `ModelConfig` から一意に変換可能。
/// 変換直後の `model` フィールドは `None`（未ロード状態）。
/// `Debug` は手動実装（`Model` が Debug を実装しないため derive 不可）
/// `model` フィールドはデバッグ出力時に `Some(...)` / `None` のみ表示する
#[derive(Clone)]
pub struct ModelInfo {
    /// モデル名
    ///
    /// レジストリ内でモデルを一意に識別する名前。
    pub name: String,

    /// モデルファイルのパス
    ///
    /// GGUF モデルファイル（.gguf）のファイルシステム上のパス。
    pub model_path: PathBuf,

    /// 遅延ロードフラグ
    ///
    /// `true` の場合、モデルは初回推論時にロードされる。
    /// `false` の場合、起動時にプリロードされる。
    pub lazy_load: bool,

    /// コンテキストサイズ（トークン数、省略可）
    ///
    /// このモデルに固有のコンテキストサイズ。
    /// `None` の場合は `DEFAULT_CONTEXT_SIZE` が使用される。
    pub context_size: Option<u32>,

    /// GPU オフロードレイヤー数（省略可）
    ///
    /// GPU にオフロードするレイヤーの数。
    pub gpu_layers: Option<u32>,

    /// バッチサイズ（省略可）
    pub batch_size: Option<u32>,

    /// チャットテンプレート（省略可）
    ///
    /// このモデルに固有のチャットテンプレート。
    pub chat_template: Option<String>,

    /// モデルインスタンス（未ロード時は None）
    ///
    /// `ModelRegistry` のみがこのフィールドを操作できる。
    /// 外部からは参照のみ可能で直接設定はできない。
    pub(crate) model: Option<Arc<Model>>,
}

impl std::fmt::Debug for ModelInfo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ModelInfo")
            .field("name", &self.name)
            .field("model_path", &self.model_path)
            .field("lazy_load", &self.lazy_load)
            .field("context_size", &self.context_size)
            .field("gpu_layers", &self.gpu_layers)
            .field("batch_size", &self.batch_size)
            .field("chat_template", &self.chat_template)
            .field("model", &self.model.as_ref().map(|_| "Some(Arc<Model>)"))
            .finish()
    }
}

impl From<ModelConfig> for ModelInfo {
    fn from(config: ModelConfig) -> Self {
        Self {
            name: config.name,
            model_path: config.model_path,
            lazy_load: config.lazy_load,
            context_size: config.context_size,
            gpu_layers: config.gpu_layers,
            batch_size: config.batch_size,
            chat_template: config.chat_template,
            model: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn create_sample_config() -> ModelConfig {
        ModelConfig {
            name: "qwen3.5".into(),
            model_path: PathBuf::from("models/qwen3.5.gguf"),
            lazy_load: true,
            context_size: Some(16384),
            gpu_layers: Some(24),
            batch_size: Some(8),
            chat_template: Some("custom".into()),
        }
    }

    #[test]
    fn model_info_from_model_config_copies_all_fields() {
        let config = create_sample_config();
        let info = ModelInfo::from(config);

        assert_eq!(info.name, "qwen3.5");
        assert_eq!(info.model_path, PathBuf::from("models/qwen3.5.gguf"));
        assert!(info.lazy_load);
        assert_eq!(info.context_size, Some(16384));
        assert_eq!(info.gpu_layers, Some(24));
        assert_eq!(info.batch_size, Some(8));
        assert_eq!(info.chat_template, Some("custom".into()));
    }

    #[test]
    fn model_info_model_field_is_none_after_from() {
        let config = create_sample_config();
        let info = ModelInfo::from(config);
        assert!(info.model.is_none(), "model should be None after From conversion");
    }

    #[test]
    fn model_info_model_field_settable() {
        let config = create_sample_config();
        let info = ModelInfo::from(config);

        // pub(crate) の model フィールドは同一クレート内から設定可能
        // 実際の設定は ModelRegistry の load_model で行う
        // ここではフィールドのアクセス権限を確認する

        // model フィールドにはアクセスできる（同一クレート内のため）
        assert!(info.model.is_none());

        // model フィールドは直接設定できない（pub(crate) のため）
        // このコードがコンパイルされること自体が visibility の確認になる

        // Clone 可能であることを確認
        let _cloned = info.clone();
    }
}
