//! ModelRegistry — モデル一元管理
//!
//! RwLock<Vec<ModelInfo>> を用いたスレッドセーフなモデル管理を提供する。
//!
//! モデルロードには llama-cpp-2 の `LlamaModel::load_from_file()` を使用する。
//! 同期 API であるため `tokio::task::spawn_blocking` でラップし、非同期コンテキスト
//! から呼び出せるようにする。ロード済みモデルは `Arc<LlamaModel>` としてキャッシュされ、
//! 複数の推論スレッドから安全に共有される。

use std::path::PathBuf;
use std::sync::{Arc, OnceLock, RwLock};

// llama-cpp-2 の型 — mistralrs の `Model` / `GgufModelBuilder` / `UqffMultimodalModelBuilder` は全削除
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;

use crate::config::ModelConfig;
use crate::error::GgufError;

/// llama-cpp-2 バックエンドをグローバルに1度だけ初期化する
///
/// `LlamaBackend::init()` はプロセス全体で1度しか呼び出せないため、
/// `OnceLock` で初期化を保護する。複数スレッドからの同時呼び出しは
/// 競合状態なく処理される（初回成功者以外は `get()` で既存のインスタンスを取得）。
pub(crate) fn ensure_backend() -> Result<&'static LlamaBackend, GgufError> {
    static BACKEND: OnceLock<LlamaBackend> = OnceLock::new();
    if let Some(backend) = BACKEND.get() {
        return Ok(backend);
    }
    // まだ初期化されていない場合のみ初期化を試みる
    match LlamaBackend::init() {
        Ok(backend) => Ok(BACKEND.get_or_init(|| backend)),
        Err(_) => {
            // 別スレッドが先に初期化した可能性があるので再確認
            BACKEND.get().ok_or_else(|| {
                GgufError::InferenceFailed(Box::new(std::io::Error::other(
                    "failed to initialize llama backend",
                )))
            })
        }
    }
}

/// モデル実行時情報
///
/// 「設定（ModelConfig）」と「実行時状態（Arc<LlamaModel>）」を組み合わせた構造体。
/// `ModelRegistry` 内部でのみ生成・保持される。外部からは `ModelInfo` のモデル名や
/// 設定値のみが公開され、`model` インスタンスは直接操作できない。
///
/// `From<ModelConfig>` により `ModelConfig` から一意に変換可能。
/// 変換直後の `model` フィールドは `None`（未ロード状態）。
/// `Debug` は手動実装（`LlamaModel` が Debug を実装しないため derive 不可）
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

    /// モデルインスタンス（未ロード時は None）
    ///
    /// `ModelRegistry` のみがこのフィールドを操作できる。
    /// 外部からは参照のみ可能で直接設定はできない。
    pub(crate) model: Option<Arc<LlamaModel>>,
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
            .field("model", &self.model.as_ref().map(|_| "Some(Arc<LlamaModel>)"))
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
            model: None,
        }
    }
}

/// モデル一元管理
///
/// `RwLock<Vec<ModelInfo>>` を用いたスレッドセーフなモデル管理。
/// 同期的なモデル追加・一覧取得と、非同期のモデルロード（`get()` / `load_model()`）を提供する。
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
    /// 指定された名前のモデルがレジストリに存在する場合、その `Arc<LlamaModel>` を返す。
    /// `model` フィールドが `None`（未ロード）の場合は `load_model()` で
    /// `LlamaModel::load_from_file()` によりロードする。ロード成功後、モデルはキャッシュされ、
    /// 次回以降はキャッシュから返される。
    ///
    /// # エラー
    /// - `GgufError::ModelNotFound`: 指定された名前のモデルが登録されていない
    /// - `GgufError::ModelLoadFailed`: モデルのロードに失敗
    pub async fn get(&self, name: &str) -> Result<Arc<LlamaModel>, GgufError> {
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
        // 2) 書き込みロックで未ロード確認 → ダブルチェック → 解放
        //    std::sync::RwLockWriteGuard は Send でないため、await を挟まずにロック解放する
        {
            let mut models = self.models.write().expect("RwLock poisoned");
            if let Some(info) = models.iter_mut().find(|m| m.name == name) {
                // ダブルチェック: 他のスレッドが先にロードしている可能性
                if let Some(ref model) = info.model {
                    return Ok(Arc::clone(model));
                }
            } else {
                return Err(GgufError::ModelNotFound(name.to_string()));
            }
        } // 書き込みロック解放（await 前に解放することで Send 制約を満たす）

        // 3) llama-cpp-2 の同期 API を spawn_blocking でラップしてロード（ロックなし）
        let arc_model = self.load_model(name).await?;

        // 4) 書き込みロックで保存
        {
            let mut models = self.models.write().expect("RwLock poisoned");
            if let Some(info) = models.iter_mut().find(|m| m.name == name) {
                info.model = Some(Arc::clone(&arc_model));
            }
        }
        Ok(arc_model)
    }

    /// llama-cpp-2 の同期 API を spawn_blocking でラップしてモデルをロードする
    ///
    /// 設定値（`model_path`, `context_size`, `gpu_layers`）を ModelInfo から取得し、
    /// `LlamaModel::load_from_file()` に渡す。同期 API のため `tokio::task::spawn_blocking`
    /// でラップして非同期コンテキストから呼び出せるようにする。
    ///
    /// # エラー
    /// - `GgufError::ModelLoadFailed`: ファイル不存在・フォーマット不正等のロード失敗
    /// - `GgufError::InferenceFailed`: `spawn_blocking` のタスクパニック
    async fn load_model(&self, name: &str) -> Result<Arc<LlamaModel>, GgufError> {
        let (model_path, n_gpu_layers) = {
            let models = self.models.read().expect("RwLock poisoned");
            let info = models.iter().find(|m| m.name == name).ok_or_else(|| {
                GgufError::ModelNotFound(name.to_string())
            })?;
            (
                info.model_path.clone(),
                info.gpu_layers.unwrap_or(0),
            )
        };

        // [`spawn_blocking` で同期 API をラップ]
        // LlamaModel::load_from_file は同期的なブロッキング呼び出しのため、
        // Tokio のブロッキングスレッドプールで実行する。
        //
        // LlamaModelParams は !Send だが、spawn_blocking クロージャ内でのみ
        // 生成・使用されるため安全。
        let backend = ensure_backend()?;

        // move クロージャに渡すため、&str は String に変換しておく
        let name_owned = name.to_string();

        let model = tokio::task::spawn_blocking(move || {
            let params = LlamaModelParams::default()
                .with_n_gpu_layers(n_gpu_layers);

            // llama-cpp-2 の load_from_file() は存在しないモデルファイルに対して
            // 標準の Result::Err ではなく panic! を発生させる。
            // catch_unwind で panic を捕捉し、ModelLoadFailed に変換して伝播する。
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                LlamaModel::load_from_file(backend, model_path, &params)
            }));

            match result {
                Ok(Ok(model)) => Ok(model),
                Ok(Err(e)) => Err(GgufError::ModelLoadFailed {
                    name: name_owned,
                    source: Box::new(e),
                }),
                Err(panic_info) => {
                    let msg = panic_info
                        .downcast_ref::<&str>()
                        .map(|s| s.to_string())
                        .or_else(|| panic_info.downcast_ref::<String>().cloned())
                        .unwrap_or_else(|| "unknown panic in llama-cpp-2".to_string());
                    Err(GgufError::ModelLoadFailed {
                        name: name_owned,
                        source: Box::new(std::io::Error::new(std::io::ErrorKind::Other, msg)),
                    })
                }
            }
        })
        .await
        .map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;

        Ok(Arc::new(model))
    }

    /// lazy_load=false のモデルのみをプリロードする
    ///
    /// 各モデルに対して `load_model()` でロードを実行する。
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

    // ── llama-cpp-2 load_model path tests (M6-4) ──

    #[tokio::test]
    async fn get_triggers_load_model_for_unloaded_model() {
        // 遅延ロード（lazy_load=true）で未ロードのモデルに対して get() を呼び出すと、
        // load_model() → LlamaModel::load_from_file() が実行される。
        // 実ファイルが存在しないため ModelLoadFailed が返ることを確認する。
        let registry = ModelRegistry::new();
        let config = create_sample_config();
        registry.add_model(config);
        let result = registry.get("qwen3.5").await;
        match result {
            Err(GgufError::ModelLoadFailed { name, .. }) => assert_eq!(name, "qwen3.5"),
            _ => panic!("expected ModelLoadFailed (load_model path)"),
        }
    }
}
