//! GgufError エラー型
//!
//! crate 全体で使用する統一エラー型。`thiserror` により `std::error::Error` を自動実装し、
//! `?` 演算子による透過的なエラー伝搬を可能にする。
//!
//! 6バリアントで構成:
//! - `ModelNotFound` / `ModelLoadFailed` — モデル操作関連
//! - `InferenceFailed` — 推論実行関連
//! - `ServerStartupFailed` — サーバー起動関連
//! - `InvalidConfig` — 設定検証関連
//! - `LlamaCppError` — llama-cpp バックエンドラップ（`#[from]` で自動変換）
//!   [::STUB::] M6-11 で `#[from]` ターゲットを `mistralrs::error::Error` → `llama_cpp_2::LlamaCppError` に差し替える

/// GGUF 推論エンジンの統一エラー型
///
/// crate 内の全エラーを単一の列挙型に集約する。
/// `thiserror::Error` を derive し、`std::error::Error` トレイトを自動実装する。
/// `source()` は `thiserror` の `#[error]` / `#[source]` 属性により自動的に実装される
/// （内部エラーを持つフィールドが自動検出される）。
///
/// # エラー伝搬
///
/// - `LlamaCppError` は `#[from]` 属性により `mistralrs::error::Error` から自動変換される
///   [::STUB::] M6-11 で `#[from]` ターゲットを `mistralrs::error::Error` → `llama_cpp_2::LlamaCppError` に差し替える
/// - 内部エラーを持つバリアントは `Box<dyn std::error::Error + Send + Sync>` でラップする
/// - `Send + Sync` を満たすため、スレッド間でのエラー伝搬が可能
///   `std::io::Error` → `GgufError::InvalidConfig` への変換
///
/// ファイル操作やネットワーク I/O で発生したエラーを設定エラーとしてラップする。
/// 設定ファイルの読み込み等で使用される。
impl From<std::io::Error> for GgufError {
    fn from(err: std::io::Error) -> Self {
        GgufError::InvalidConfig(err.to_string())
    }
}

/// `serde_json::Error` → `GgufError::InvalidConfig` への変換
///
/// JSON 設定のパースに失敗した場合のエラーをラップする。
/// `ConfigLayer::JsonStr` および `ConfigLayer::File` からの設定読み込みで使用される。
impl From<serde_json::Error> for GgufError {
    fn from(err: serde_json::Error) -> Self {
        GgufError::InvalidConfig(err.to_string())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GgufError {
    /// モデルが見つからない
    ///
    /// 指定された名前のモデルがレジストリに存在しない場合に発生する。
    /// フィールドには要求されたモデル名を格納する。
    #[error("モデル '{0}' が見つかりません")]
    ModelNotFound(String),

    /// モデルのロードに失敗
    ///
    /// llama-cpp バックエンドでのモデル読み込み処理が失敗した場合に発生する。
    /// モデル名と元のエラーを保持する。
    #[error("モデル '{name}' のロードに失敗しました: {source}")]
    ModelLoadFailed {
        /// ロードに失敗したモデル名
        name: String,
        /// 元のエラー
        source: Box<dyn std::error::Error + Send + Sync>,
    },

    /// 推論実行中にエラーが発生
    ///
    /// generate / generate_stream 等の推論メソッド実行中に発生する。
    #[error("推論実行中にエラーが発生しました: {0}")]
    InferenceFailed(#[source] Box<dyn std::error::Error + Send + Sync>),

    /// サーバーの起動に失敗
    ///
    /// HTTP サーバーのバインドまたは起動処理が失敗した場合に発生する。
    #[error("サーバーの起動に失敗しました: {0}")]
    ServerStartupFailed(#[source] Box<dyn std::error::Error + Send + Sync>),

    /// 設定が無効
    ///
    /// 設定値の検証に失敗した場合に発生する。
    /// フィールドには検証エラーの詳細メッセージを格納する。
    #[error("設定が無効です: {0}")]
    InvalidConfig(String),

    /// llama-cpp バックエンドエラー
    ///
    /// llama-cpp バックエンドから発生したエラーをラップする。
    /// `#[from]` 属性により `?` 演算子で自動変換される。
    /// [::STUB::] M6-11 で `#[from] mistralrs::error::Error` → `#[from] llama_cpp_2::LlamaCppError` に差し替える
    #[error("llama-cpp エラー: {0}")]
    LlamaCppError(#[from] mistralrs::error::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;

    /// GgufError が std::error::Error を実装していることを確認
    #[test]
    fn gguf_error_implements_std_error() {
        fn assert_error<T: std::error::Error>() {}
        assert_error::<GgufError>();
    }

    /// GgufError が Send + Sync を満たすことを確認（コンパイル時チェック）
    #[test]
    fn gguf_error_is_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<GgufError>();
        assert_sync::<GgufError>();
    }

    #[test]
    fn gguf_error_display_model_not_found() {
        let err = GgufError::ModelNotFound("qwen3.5".into());
        let msg = err.to_string();
        assert!(
            msg.contains("qwen3.5"),
            "display should contain model name: {msg}"
        );
        assert!(
            msg.contains("見つかりません"),
            "display should be in Japanese: {msg}"
        );
    }

    #[test]
    fn gguf_error_display_model_load_failed() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = GgufError::ModelLoadFailed {
            name: "qwen3.5".into(),
            source: Box::new(io_err),
        };
        let msg = err.to_string();
        assert!(
            msg.contains("qwen3.5"),
            "display should contain model name: {msg}"
        );
        assert!(
            msg.contains("ロード"),
            "display should be in Japanese: {msg}"
        );
        assert!(
            msg.contains("file not found"),
            "display should contain source: {msg}"
        );
    }

    #[test]
    fn gguf_error_display_inference_failed() {
        let io_err = std::io::Error::new(std::io::ErrorKind::Other, "inference timeout");
        let err = GgufError::InferenceFailed(Box::new(io_err));
        let msg = err.to_string();
        assert!(msg.contains("推論"), "display should be in Japanese: {msg}");
        assert!(
            msg.contains("inference timeout"),
            "display should contain source: {msg}"
        );
    }

    #[test]
    fn gguf_error_display_server_startup_failed() {
        let io_err = std::io::Error::new(std::io::ErrorKind::AddrInUse, "port in use");
        let err = GgufError::ServerStartupFailed(Box::new(io_err));
        let msg = err.to_string();
        assert!(
            msg.contains("サーバー"),
            "display should be in Japanese: {msg}"
        );
        assert!(
            msg.contains("port in use"),
            "display should contain source: {msg}"
        );
    }

    #[test]
    fn gguf_error_display_invalid_config() {
        let err = GgufError::InvalidConfig("unknown provider: xxx".into());
        let msg = err.to_string();
        assert!(msg.contains("設定"), "display should be in Japanese: {msg}");
        assert!(
            msg.contains("unknown provider"),
            "display should contain detail: {msg}"
        );
    }

    #[test]
    fn gguf_error_display_llama_cpp_error() {
        // llama_cpp_2::LlamaCppError のインスタンスでラップする（この段階では mistralrs を再利用）
        // [::STUB::] M6-11 で `mistralrs::error::Error` → `llama_cpp_2::LlamaCppError` に差し替える
        let mist_err = mistralrs::error::Error::RequestValidation("test error".into());
        let err = GgufError::LlamaCppError(mist_err);
        let msg = err.to_string();
        assert!(
            msg.contains("llama-cpp"),
            "display should contain prefix: {msg}"
        );
        assert!(
            msg.contains("test error"),
            "display should contain source info: {msg}"
        );
    }

    #[test]
    fn gguf_error_source_for_wrapped_error() {
        // 内部エラーを持つバリアントで source() が Some を返すことを確認
        let io_err = std::io::Error::new(std::io::ErrorKind::Other, "some error");
        let err = GgufError::ModelLoadFailed {
            name: "test".into(),
            source: Box::new(io_err),
        };
        assert!(
            err.source().is_some(),
            "ModelLoadFailed should have a source"
        );

        let io_err = std::io::Error::new(std::io::ErrorKind::Other, "infer error");
        let err = GgufError::InferenceFailed(Box::new(io_err));
        assert!(
            err.source().is_some(),
            "InferenceFailed should have a source"
        );

        let io_err = std::io::Error::new(std::io::ErrorKind::Other, "server error");
        let err = GgufError::ServerStartupFailed(Box::new(io_err));
        assert!(
            err.source().is_some(),
            "ServerStartupFailed should have a source"
        );

        let mist_err = mistralrs::error::Error::RequestValidation("validation failed".into());
        let err = GgufError::LlamaCppError(mist_err);
        assert!(
            err.source().is_some(),
            "LlamaCppError should have a source"
        );
    }

    #[test]
    fn gguf_error_source_for_string_error() {
        // 文字列のみのバリアントで source() が None を返すことを確認
        let err = GgufError::ModelNotFound("test".into());
        assert!(
            err.source().is_none(),
            "ModelNotFound should not have a source"
        );

        let err = GgufError::InvalidConfig("bad config".into());
        assert!(
            err.source().is_none(),
            "InvalidConfig should not have a source"
        );
    }

    #[test]
    fn gguf_error_debug_output() {
        let err = GgufError::ModelNotFound("debug_test".into());
        let debug = format!("{err:?}");
        // Debug 出力にはバリアント名とフィールド情報が含まれる
        assert!(
            debug.contains("ModelNotFound"),
            "Debug should contain variant name: {debug}"
        );
        assert!(
            debug.contains("debug_test"),
            "Debug should contain field value: {debug}"
        );
    }

    // ── From impl tests (M1-3) ──

    #[test]
    fn from_io_error_maps_to_invalid_config() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err: GgufError = io_err.into();
        assert!(
            matches!(err, GgufError::InvalidConfig(_)),
            "io::Error should map to InvalidConfig"
        );
    }

    #[test]
    fn from_io_error_preserves_message() {
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "access denied");
        let err: GgufError = io_err.into();
        let msg = err.to_string();
        assert!(
            msg.contains("access denied"),
            "message should be preserved: {msg}"
        );
    }

    #[test]
    fn from_serde_json_error_maps_to_invalid_config() {
        // serde_json::Error を生成するため、既知の無効な JSON をパースする
        let json_err = serde_json::from_str::<serde_json::Value>("invalid{").unwrap_err();
        let err: GgufError = json_err.into();
        assert!(
            matches!(err, GgufError::InvalidConfig(_)),
            "serde_json::Error should map to InvalidConfig"
        );
    }

    #[test]
    fn from_serde_json_error_preserves_message() {
        let json_err = serde_json::from_str::<serde_json::Value>("not valid json").unwrap_err();
        let err: GgufError = json_err.into();
        let msg = err.to_string();
        assert!(
            msg.contains("expected"),
            "message should be preserved: {msg}"
        );
    }

    #[test]
    fn from_mistralrs_error_works_via_from_attr() {
        // [::STUB::] M6-11 で `llama_cpp_2::LlamaCppError` に差し替え
        let mist_err = mistralrs::error::Error::RequestValidation("validation error".into());
        let err: GgufError = mist_err.into();
        assert!(
            matches!(err, GgufError::LlamaCppError(_)),
            "mistralrs::error::Error should map to LlamaCppError via #[from]"
        );
    }
}
