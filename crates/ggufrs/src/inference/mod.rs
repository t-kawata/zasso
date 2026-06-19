//! 推論エンジン抽象化
//!
//! InferenceEngine トレイトを定義し、mistralrs バックエンドへの統一的インターフェースを提供する。
//!
//! 実装は以下のサブモジュールに分割する:
//! - `generate` — `generate()` / `generate_structured()`

use std::pin::Pin;

use async_trait::async_trait;
use futures::Stream;
use serde_json::Value;

use mistralrs::{RequestBuilder, Response};

use crate::consts::{DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE};
use crate::error::GgufError;

// サブモジュール宣言
pub mod generate;
pub mod stream;

/// 推論パラメータ
///
/// テキスト生成時の各種パラメータを保持する。
/// 各フィールドは `Option` 型で、`None` の場合はモデルデフォルトが使用される。
/// `Default` 実装により `DEFAULT_TEMPERATURE` 等の定数で初期化される。
#[derive(Debug, Clone, PartialEq)]
pub struct GenerateParams {
    /// 温度パラメータ（ランダム性の制御）
    ///
    /// `Some(f32)` の場合はその値、`None` の場合はモデルデフォルト。
    /// デフォルト: `DEFAULT_TEMPERATURE`（0.1）
    pub temperature: Option<f32>,

    /// 最大生成トークン数
    ///
    /// `Some(u32)` の場合はその値、`None` の場合はモデルデフォルト。
    /// デフォルト: `DEFAULT_MAX_TOKENS`（256）
    pub max_tokens: Option<u32>,

    /// Top-P サンプリング（Nucleus Sampling）
    ///
    /// 確率の累積和がこの値を超えるまでトークンを選択する。
    /// `None` の場合はモデルデフォルト。
    pub top_p: Option<f32>,

    /// 存在ペナルティ
    ///
    /// 既に出現したトークンに対してペナルティを課す。
    /// 正の値で多様性が向上する。`None` の場合はモデルデフォルト。
    pub presence_penalty: Option<f32>,

    /// 頻度ペナルティ
    ///
    /// 出現頻度の高いトークンに対してペナルティを課す。
    /// 正の値で多様性が向上する。`None` の場合はモデルデフォルト。
    pub frequency_penalty: Option<f32>,

    /// 拡張思考（chain-of-thought）の有効化
    ///
    /// `Some(true)` で有効化、`Some(false)` で無効化。
    /// `None` の場合は mistralrs のデフォルト動作に委譲する。
    /// ASR 補正タスクでは `Some(false)` を推奨（高速化の設計判断）。
    pub enable_thinking: Option<bool>,
}

impl Default for GenerateParams {
    fn default() -> Self {
        Self {
            temperature: Some(DEFAULT_TEMPERATURE),
            max_tokens: Some(DEFAULT_MAX_TOKENS),
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
            enable_thinking: None,
        }
    }
}

/// 推論エンジントレイト
///
/// GGUF モデルに対する推論操作の統一インターフェース。
/// `Send + Sync` をスーパートレイトとして要求するため、
/// `Arc<dyn InferenceEngine>` としてスレッドセーフに共有可能。
///
/// 4メソッドのうち3つが高レベルAPI、1つ（`send_raw`）が低レベルAPIとして設計され、
/// 使いやすさと拡張性を両立する。
///
/// # オブジェクトセーフ性
///
/// 全メソッドは `&self` を受け取り、戻り値の型が `Self` を含まないため、
/// `dyn InferenceEngine` として使用可能。
#[async_trait]
pub trait InferenceEngine: Send + Sync {
    /// テキスト生成を行う
    ///
    /// 指定されたモデル名のモデルに対して、プロンプトを与えてテキストを生成する。
    ///
    /// # 引数
    /// - `model_name`: 対象モデルの名前
    /// - `prompt`: 入力プロンプト
    /// - `params`: 生成パラメータ
    ///
    /// # 戻り値
    /// - `Ok(String)`: 生成されたテキスト
    /// - `Err(GgufError)`: 推論エラー
    async fn generate(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
    ) -> Result<String, GgufError>;

    /// JSON Schema 拘束付きテキスト生成を行う
    ///
    /// 指定された JSON Schema に従って構造化された出力を生成する。
    ///
    /// # 引数
    /// - `model_name`: 対象モデルの名前
    /// - `prompt`: 入力プロンプト
    /// - `params`: 生成パラメータ
    /// - `schema`: 出力を拘束する JSON Schema
    ///
    /// # 戻り値
    /// - `Ok(Value)`: 生成された構造化データ
    /// - `Err(GgufError)`: 推論エラー
    async fn generate_structured(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
        schema: Value,
    ) -> Result<Value, GgufError>;

    /// ストリーミングテキスト生成を行う
    ///
    /// 生成されたテキストを非同期的にチャンク単位で受け取る。
    ///
    /// # 引数
    /// - `model_name`: 対象モデルの名前
    /// - `prompt`: 入力プロンプト
    /// - `params`: 生成パラメータ
    ///
    /// # 戻り値
    /// - `Ok(Pin<Box<dyn Stream<...>>>)`: テキストチャンクのストリーム
    /// - `Err(GgufError)`: 推論エラー
    async fn generate_stream(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError>;

    /// mistralrs RequestBuilder への低レベルアクセス
    ///
    /// mistralrs の全機能（ツール呼び出し、埋め込み等）にアクセスするための
    /// パススルーメソッド。トレイト自体の変更なく mistralrs の新機能に対応できるよう、
    /// 低レベルアクセス経路を確保する。
    ///
    /// # 引数
    /// - `model_name`: 対象モデルの名前
    /// - `request`: mistralrs のリクエストビルダー
    ///
    /// # 戻り値
    /// - `Ok(Response)`: mistralrs のレスポンス
    /// - `Err(GgufError)`: 推論エラー
    async fn send_raw(
        &self,
        model_name: &str,
        request: RequestBuilder,
    ) -> Result<Response, GgufError>;
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// InferenceEngine トレイトが Send + Sync を満たすことを確認
    #[test]
    fn inference_engine_is_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}

        // ダミー実装で Send + Sync をチェック
        struct DummyEngine;
        #[async_trait]
        impl InferenceEngine for DummyEngine {
            async fn generate(
                &self,
                _model_name: &str,
                _prompt: &str,
                _params: GenerateParams,
            ) -> Result<String, GgufError> {
                Ok("dummy".into())
            }
            async fn generate_structured(
                &self,
                _model_name: &str,
                _prompt: &str,
                _params: GenerateParams,
                _schema: Value,
            ) -> Result<Value, GgufError> {
                Ok(Value::Null)
            }
            async fn generate_stream(
                &self,
                _model_name: &str,
                _prompt: &str,
                _params: GenerateParams,
            ) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError>
            {
                todo!()
            }
            async fn send_raw(
                &self,
                _model_name: &str,
                _request: RequestBuilder,
            ) -> Result<Response, GgufError> {
                todo!()
            }
        }

        assert_send::<DummyEngine>();
        assert_sync::<DummyEngine>();
    }

    /// InferenceEngine トレイトがオブジェクトセーフであることを確認
    #[test]
    fn inference_engine_is_object_safe() {
        // `dyn InferenceEngine` がコンパイルできることを確認
        fn takes_dyn(_engine: &dyn InferenceEngine) {}
        let _ = takes_dyn;
    }

    /// GenerateParams の Default 実装が定数を使用していることを確認
    #[test]
    fn generate_params_default_uses_constants() {
        let params = GenerateParams::default();
        assert_eq!(params.temperature, Some(DEFAULT_TEMPERATURE));
        assert_eq!(params.max_tokens, Some(DEFAULT_MAX_TOKENS));
        assert!(params.top_p.is_none());
        assert!(params.presence_penalty.is_none());
        assert!(params.frequency_penalty.is_none());
        assert!(params.enable_thinking.is_none());
    }

    #[test]
    fn generate_params_enable_thinking_true() {
        let params = GenerateParams {
            enable_thinking: Some(true),
            ..GenerateParams::default()
        };
        assert_eq!(params.enable_thinking, Some(true));
    }

    // ── Mock-based tests (M2-4) ──

    use mockall::mock;

    mock! {
        pub Engine {}
        #[async_trait]
        impl InferenceEngine for Engine {
            async fn generate(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<String, GgufError>;
            async fn generate_structured(&self, model_name: &str, prompt: &str, params: GenerateParams, schema: Value) -> Result<Value, GgufError>;
            async fn generate_stream(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError>;
            async fn send_raw(&self, model_name: &str, request: RequestBuilder) -> Result<Response, GgufError>;
        }
    }

    #[tokio::test]
    async fn mock_generate_returns_expected_text() {
        let mut mock = MockEngine::new();
        mock.expect_generate()
            .with(
                mockall::predicate::always(),
                mockall::predicate::always(),
                mockall::predicate::always(),
            )
            .times(1)
            .returning(|_, _, _| Ok("mock response".into()));

        let result = mock
            .generate("test", "hello", GenerateParams::default())
            .await;
        assert_eq!(result.unwrap(), "mock response");
    }

    #[tokio::test]
    async fn mock_generate_returns_error() {
        let mut mock = MockEngine::new();
        mock.expect_generate().times(1).returning(|_, _, _| {
            Err(GgufError::InferenceFailed(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                "mock error",
            ))))
        });

        let result = mock.generate("x", "y", GenerateParams::default()).await;
        assert!(matches!(result, Err(GgufError::InferenceFailed(_))));
    }

    #[tokio::test]
    async fn mock_generate_structured_returns_value() {
        let mut mock = MockEngine::new();
        mock.expect_generate_structured()
            .times(1)
            .returning(|_, _, _, _| Ok(serde_json::json!({"result": "ok"})));

        let result = mock
            .generate_structured("m", "p", GenerateParams::default(), serde_json::json!({}))
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn mock_generate_structured_returns_error() {
        let mut mock = MockEngine::new();
        mock.expect_generate_structured()
            .times(1)
            .returning(|_, _, _, _| Err(GgufError::ModelNotFound("test".into())));

        let result = mock
            .generate_structured("m", "p", GenerateParams::default(), serde_json::json!({}))
            .await;
        assert!(matches!(result, Err(GgufError::ModelNotFound(_))));
    }

    #[tokio::test]
    async fn mock_generate_stream_returns_ok() {
        let mut mock = MockEngine::new();
        mock.expect_generate_stream().times(1).returning(|_, _, _| {
            let stream = futures::stream::iter(vec![Ok("chunk".into())]);
            Ok(Box::pin(stream)
                as Pin<
                    Box<dyn Stream<Item = Result<String, GgufError>> + Send>,
                >)
        });

        let result = mock
            .generate_stream("m", "p", GenerateParams::default())
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn mock_generate_stream_returns_error() {
        let mut mock = MockEngine::new();
        mock.expect_generate_stream().times(1).returning(|_, _, _| {
            Err(GgufError::ServerStartupFailed(Box::new(
                std::io::Error::new(std::io::ErrorKind::Other, "stream error"),
            )))
        });

        let result = mock
            .generate_stream("m", "p", GenerateParams::default())
            .await;
        assert!(matches!(result, Err(GgufError::ServerStartupFailed(_))));
    }

    #[tokio::test]
    async fn mock_send_raw_exists() {
        // send_raw メソッドのモックが定義可能であることを確認
        let mut mock = MockEngine::new();
        mock.expect_send_raw()
            .returning(|_, _| Err(GgufError::ModelNotFound("not implemented".into())));

        // RequestBuilder は mistralrs 型のため、直接の呼び出しテストは行わない
        // モック定義がコンパイル可能であること自体が検証
        let _ = mock;
    }
}
