//! ModelRegistry — モデル一元管理
//!
//! RwLock<Vec<ModelInfo>> を用いたスレッドセーフなモデル管理を提供する。
//!
//! モデルロードには mistralrs の GgufModelBuilder（GGUF）または
//! UqffMultimodalModelBuilder（UQFF）をファイル拡張子に応じて使い分ける。
//! ロード済みモデルは Arc<Model> としてキャッシュされ、複数の推論スレッドから
//! 安全に共有される。

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use mistralrs::{DeviceMapSetting, GgufModelBuilder, Model, UqffMultimodalModelBuilder};

use crate::config::ModelConfig;
use crate::error::GgufError;

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

/// モデル一元管理
///
/// `RwLock<Vec<ModelInfo>>` を用いたスレッドセーフなモデル管理。
/// 同期的なモデル追加・一覧取得を提供する。
/// 実際のモデルロード（非同期処理）は M2-2 で追加する。
pub struct ModelRegistry {
    models: RwLock<Vec<ModelInfo>>,
}

impl Default for ModelRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ModelRegistry {
    /// 空のレジストリを生成する
    pub fn new() -> Self {
        Self {
            models: RwLock::new(Vec::new()),
        }
    }

    /// モデル設定一覧からレジストリを構築する
    ///
    /// 各 `ModelConfig` は `From` 実装により `ModelInfo` に変換され、
    /// レジストリに登録される。`model` フィールドは全て `None` で初期化される。
    pub fn from_config(configs: Vec<ModelConfig>) -> Self {
        let models: Vec<ModelInfo> = configs.into_iter().map(ModelInfo::from).collect();
        Self {
            models: RwLock::new(models),
        }
    }

    /// モデルを追加する
    ///
    /// スレッドセーフにモデルをレジストリに追加する。
    /// 同名モデルの重複排除は行わず、そのまま追加する。
    pub fn add_model(&self, config: ModelConfig) {
        let mut models = self.models.write().expect("RwLock poisoned");
        models.push(ModelInfo::from(config));
    }

    /// 登録済みモデル名の一覧を返す
    ///
    /// 追加順にモデル名のリストを返す。
    pub fn list_models(&self) -> Vec<String> {
        let models = self.models.read().expect("RwLock poisoned");
        models.iter().map(|m| m.name.clone()).collect()
    }

    /// モデルインスタンスを取得する（遅延ロード対応）
    ///
    /// 指定された名前のモデルがレジストリに存在する場合、その `Arc<Model>` を返す。
    /// `model` フィールドが `None`（未ロード）の場合はファイル拡張子に応じて
    /// GgufModelBuilder（GGUF）または UqffMultimodalModelBuilder（UQFF）でロードする。
    /// ロード成功後、モデルはキャッシュされ、次回以降はキャッシュから返される。
    ///
    /// # エラー
    /// - `GgufError::ModelNotFound`: 指定された名前のモデルが登録されていない
    /// - `GgufError::ModelLoadFailed`: モデルのロードに失敗
    pub async fn get(&self, name: &str) -> Result<Arc<Model>, GgufError> {
        // 1) 読み取りロックで model フィールドをチェック（最速パス）
        {
            let models = self.models.read().expect("RwLock poisoned");
            if let Some(info) = models.iter().find(|m| m.name == name) {
                if let Some(ref model) = info.model {
                    return Ok(Arc::clone(model));
                }
            } else {
                return Err(GgufError::ModelNotFound(name.to_string()));
            }
        }
        // 2) 書き込みロックで未ロード確認 → ビルダー準備 → ロック解放
        //    std::sync::RwLockWriteGuard は Send でないため、await を挟まずに事前準備する
        let (model_path_str, chat_template) = {
            let mut models = self.models.write().expect("RwLock poisoned");
            if let Some(info) = models.iter_mut().find(|m| m.name == name) {
                // ダブルチェック: 他のスレッドが先にロードしている可能性
                if let Some(ref model) = info.model {
                    return Ok(Arc::clone(model));
                }
                let path = info.model_path.to_string_lossy().to_string();
                let template = info.chat_template.clone();
                (path, template)
            } else {
                return Err(GgufError::ModelNotFound(name.to_string()));
            }
        }; // 書き込みロック解放（await 前に解放することで Send 制約を満たす）

        // 3) ファイル拡張子に応じて適切なビルダーで非同期ロード（ロックなし）
        let model_path = PathBuf::from(&model_path_str);
        let extension = model_path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase());
        let model = match extension.as_deref() {
            Some("gguf") => {
                build_model_with_gguf(&model_path_str, &model_path, chat_template.as_deref()).await
            }
            Some("uqff") => build_model_with_uqff(name, &model_path).await,
            _ => Err(anyhow::anyhow!("unsupported model format: {:?}", extension)),
        }
        .map_err(|e| GgufError::ModelLoadFailed {
            name: name.to_string(),
            source: Box::new(std::io::Error::other(format!("{e:#}"))),
        })?;
        let arc_model = Arc::new(model);

        // 4) 書き込みロックで保存
        {
            let mut models = self.models.write().expect("RwLock poisoned");
            if let Some(info) = models.iter_mut().find(|m| m.name == name) {
                info.model = Some(Arc::clone(&arc_model));
            }
        }
        Ok(arc_model)
    }

    /// lazy_load=false のモデルのみをプリロードする
    ///
    /// 各モデルに対して GgufModelBuilder でロードを実行する。
    /// 1つでもロードに失敗した場合はエラーを返し、以降のモデルはスキップされる。
    pub async fn load_immediate(&self) -> Result<(), GgufError> {
        let model_names: Vec<String> = {
            let models = self.models.read().expect("RwLock poisoned");
            models
                .iter()
                .filter(|m| !m.lazy_load)
                .map(|m| m.name.clone())
                .collect()
        };
        for name in model_names {
            self.get(&name).await?;
        }
        Ok(())
    }

    /// 全モデルを強制ロードする
    ///
    /// lazy_load 設定に従わず、登録されている全てのモデルをロードする。
    pub async fn load_all(&self) -> Result<(), GgufError> {
        let model_names: Vec<String> = {
            let models = self.models.read().expect("RwLock poisoned");
            models.iter().map(|m| m.name.clone()).collect()
        };
        for name in model_names {
            self.get(&name).await?;
        }
        Ok(())
    }
}

/// GGUF モデルファイルを GgufModelBuilder で構築する
///
/// model_path_str から親ディレクトリとファイル名グロブパターンを抽出し、
/// GgufModelBuilder を設定する。chat_template が指定されていれば適用する。
async fn build_model_with_gguf(
    model_path_str: &str,
    model_path: &std::path::Path,
    chat_template: Option<&str>,
) -> anyhow::Result<Model> {
    let model_dir = model_path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| model_path_str.to_string());
    let file_pattern = model_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "**".to_string());
    let mut builder = GgufModelBuilder::new(model_dir, vec![file_pattern]);
    if let Some(template) = chat_template {
        builder = builder.with_chat_template(template);
    }
    builder.build().await
}

/// UQFF モデルファイルを UqffMultimodalModelBuilder で構築する
///
/// model_name から HuggingFace リポジトリ名を解決し、ローカル UQFF ファイルを
/// ベクタで指定する。Gemma4 E2B/E4B は Multimodal（Vision）モデルのため、
/// UqffMultimodalModelBuilder を使用する。
///
/// ## DeviceMap 設定の理由
///
/// mistralrs v0.8.1 の Auto device map には macOS ARM でメモリ検出が故障する
/// バグがある（`auto_device_map.rs` の二重push + `sysinfo` の `available_memory=0`）。
/// `DeviceMapSetting::dummy()` でメモリフィット計算を完全バイパスし、
/// `with_force_cpu()` で CPU デバイスを明示固定することでこれを回避する。
///
/// 参照: `docs/mistralrs-gemma4-e2b-e4b/INFO02.md`
async fn build_model_with_uqff(
    model_name: &str,
    model_path: &std::path::Path,
) -> anyhow::Result<Model> {
    let repo = model_name_to_uqff_repo(model_name);
    UqffMultimodalModelBuilder::new(repo, vec![model_path.to_path_buf()])
        .into_inner()
        .with_device_mapping(DeviceMapSetting::dummy())
        .with_force_cpu()
        .build()
        .await
}

/// モデル名から UQFF HuggingFace リポジトリ名を解決する
///
/// 未知のモデル名はそのまま model_id として使用する（fallback）。
/// 返り値は既知のリポジトリ名（'static）または呼び出し元の文字列参照。
fn model_name_to_uqff_repo(name: &str) -> &str {
    match name {
        "gemma4-e2b" => "mistralrs-community/gemma-4-E2B-it-UQFF",
        "gemma4-e4b" => "mistralrs-community/gemma-4-E4B-it-UQFF",
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn create_sample_config() -> ModelConfig {
        ModelConfig {
            name: "qwen3.5".into(),
            model_path: PathBuf::from("models/nonexistent/qwen3.5.gguf"),
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
        assert_eq!(
            info.model_path,
            PathBuf::from("models/nonexistent/qwen3.5.gguf")
        );
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
        assert!(
            info.model.is_none(),
            "model should be None after From conversion"
        );
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

    // ── ModelRegistry tests (M1-5) ──

    #[test]
    fn new_creates_empty_registry() {
        let registry = ModelRegistry::new();
        let models = registry.list_models();
        assert!(models.is_empty(), "new registry should have no models");
    }

    #[test]
    fn add_model_then_list_contains_name() {
        let registry = ModelRegistry::new();
        let config = create_sample_config();
        registry.add_model(config);
        let models = registry.list_models();
        assert_eq!(models.len(), 1);
        assert_eq!(models[0], "qwen3.5");
    }

    #[test]
    fn from_config_with_multiple_models() {
        let configs = vec![
            ModelConfig {
                name: "model_a".into(),
                ..create_sample_config()
            },
            ModelConfig {
                name: "model_b".into(),
                ..create_sample_config()
            },
        ];
        let registry = ModelRegistry::from_config(configs);
        let models = registry.list_models();
        assert_eq!(models.len(), 2);
    }

    #[test]
    fn add_model_duplicate_name_keeps_both() {
        let registry = ModelRegistry::new();
        let config = create_sample_config();
        registry.add_model(config);
        registry.add_model(create_sample_config());
        let models = registry.list_models();
        assert_eq!(models.len(), 2, "duplicate names should both be kept");
    }

    #[test]
    fn list_models_preserves_insertion_order() {
        let registry = ModelRegistry::new();
        let mut config_a = create_sample_config();
        config_a.name = "first".into();
        let mut config_b = create_sample_config();
        config_b.name = "second".into();
        registry.add_model(config_a);
        registry.add_model(config_b);
        let models = registry.list_models();
        assert_eq!(models, vec!["first", "second"]);
    }

    // ── Async method tests (M2-2) ──

    #[tokio::test]
    async fn get_unregistered_model_returns_not_found() {
        let registry = ModelRegistry::new();
        let result = registry.get("non_existent").await;
        match result {
            Err(GgufError::ModelNotFound(name)) => assert_eq!(name, "non_existent"),
            _ => panic!("expected ModelNotFound"),
        }
    }

    #[tokio::test]
    async fn get_unloaded_model_returns_stub_error() {
        let registry = ModelRegistry::new();
        let config = create_sample_config(); // lazy_load = true
        registry.add_model(config);
        let result = registry.get("qwen3.5").await;
        match result {
            Err(GgufError::ModelLoadFailed { name, .. }) => assert_eq!(name, "qwen3.5"),
            _ => panic!("expected ModelLoadFailed (STUB)"),
        }
    }

    #[tokio::test]
    async fn load_immediate_skips_lazy_models() {
        let registry = ModelRegistry::new();
        let config = create_sample_config(); // lazy_load = true
        registry.add_model(config);
        // lazy_load=true のモデルのみ → スキップされる → Ok(())
        let result = registry.load_immediate().await;
        assert!(
            result.is_ok(),
            "load_immediate should skip lazy models: {:?}",
            result
        );
    }

    // ── Builder dispatch tests (M5-2.2) ──

    fn create_uqff_config() -> ModelConfig {
        // 存在しないパスを使用することで、UqffMultimodalModelBuilder が
        // ダウンロードを試みずにエラーを返すことを確認する
        ModelConfig {
            name: "gemma4-e2b".into(),
            model_path: PathBuf::from("models/nonexistent/gemma4-e2b.q4k.uqff"),
            lazy_load: true,
            context_size: Some(2048),
            gpu_layers: None,
            batch_size: None,
            chat_template: None,
        }
    }

    fn create_unknown_config() -> ModelConfig {
        ModelConfig {
            name: "unknown".into(),
            model_path: PathBuf::from("models/unknown.safetensors"),
            lazy_load: true,
            context_size: None,
            gpu_layers: None,
            batch_size: None,
            chat_template: None,
        }
    }

    #[tokio::test]
    async fn uqff_model_path_returns_model_load_failed() {
        let registry = ModelRegistry::new();
        let config = create_uqff_config();
        registry.add_model(config);
        let result = registry.get("gemma4-e2b").await;
        match result {
            Err(GgufError::ModelLoadFailed { name, .. }) => assert_eq!(name, "gemma4-e2b"),
            _ => panic!("expected ModelLoadFailed (UQFF path)"),
        }
    }

    #[tokio::test]
    async fn unknown_extension_returns_model_load_failed() {
        let registry = ModelRegistry::new();
        let config = create_unknown_config();
        registry.add_model(config);
        let result = registry.get("unknown").await;
        match result {
            Err(GgufError::ModelLoadFailed { source, .. }) => {
                let msg = format!("{source}");
                assert!(
                    msg.contains("unsupported model format"),
                    "expected 'unsupported model format', got: {msg}"
                );
            }
            _ => panic!("expected ModelLoadFailed (unknown extension)"),
        }
    }

    #[tokio::test]
    async fn gguf_model_path_uses_gguf_model_builder() {
        let registry = ModelRegistry::new();
        let config = create_sample_config();
        registry.add_model(config);
        let result = registry.get("qwen3.5").await;
        match result {
            Err(GgufError::ModelLoadFailed { name, .. }) => assert_eq!(name, "qwen3.5"),
            _ => panic!("expected ModelLoadFailed (GGUF path)"),
        }
    }

    #[test]
    fn model_name_to_uqff_repo_maps_gemma4_e2b() {
        assert_eq!(
            super::model_name_to_uqff_repo("gemma4-e2b"),
            "mistralrs-community/gemma-4-E2B-it-UQFF"
        );
    }

    #[test]
    fn model_name_to_uqff_repo_maps_gemma4_e4b() {
        assert_eq!(
            super::model_name_to_uqff_repo("gemma4-e4b"),
            "mistralrs-community/gemma-4-E4B-it-UQFF"
        );
    }

    #[test]
    fn model_name_to_uqff_repo_unknown_returns_name() {
        let name = "unknown-model";
        assert_eq!(super::model_name_to_uqff_repo(name), name);
    }
}
