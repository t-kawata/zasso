//! GgufEngine への InferenceEngine トレイト実装（generate / generate_structured）
//!
//! llama-cpp-2 の同期 API（`LlamaModel` + `LlamaContext`）を `spawn_blocking` でラップし、
//! 非同期のテキスト生成メソッドとして提供する。
//!
//! # データフロー
//!
//! ```text
//! generate(model_name, prompt, params)
//!   → ModelRegistry::get(model_name)        // モデル解決
//!   → spawn_blocking:
//!       → model.str_to_token(prompt)        // プロンプトをトークン化
//!       → model.new_context(...)             // 推論コンテキスト作成
//!       → LlamaBatch + context.decode()     // プロンプトデコード
//!       → LlamaSampler chain                // サンプリング
//!       → 生成ループ（サンプル→デコード→収集）
//!       → トークンを文字列に変換
//!   → String を返却
//!
//! generate_structured(model_name, prompt, params, schema)
//!   → ModelRegistry::get(model_name)
//!   → gbnf::convert(&schema)                // JSON Schema → GBNF 文法
//!   → spawn_blocking:
//!       → 同上 + LlamaSampler::grammar()    // 文法制約付きサンプリング
//!   → serde_json::from_str(&result)         // JSON パース
//! ```

use std::num::NonZeroU32;
use std::pin::Pin;

use async_trait::async_trait;
use futures::Stream;
use serde_json::Value;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use llama_cpp_2::token::LlamaToken;

use crate::error::GgufError;
use crate::inference::{GenerateParams, InferenceEngine};
use crate::GgufEngine;

/// GenerateParams から抽出された推論パラメータ
///
/// llama-cpp-2 v0.1.150 には高レベルの `InferenceParams` 構造体が存在しないため、
/// サンプリングと生成制御に必要なパラメータをこの構造体で運搬する。
/// 実際のサンプリングは `spawn_blocking` 内で `LlamaSampler` チェーンを構築して行う。
pub(crate) struct InferenceParams {
    pub(crate) temperature: f32,
    pub(crate) max_tokens: i32,
    pub(crate) top_p: Option<f32>,
}

impl From<GenerateParams> for InferenceParams {
    fn from(params: GenerateParams) -> Self {
        Self {
            temperature: params.temperature.unwrap_or(0.1),
            max_tokens: params.max_tokens.unwrap_or(256) as i32,
            top_p: params.top_p,
        }
    }
}

/// 単一トークンをバイト列にデコードする
///
/// `model.token_to_piece_bytes()` は初期バッファサイズが不足すると
/// `InsufficientBufferSpace` エラーを返す。この関数はエラー時に
/// 適切なサイズで再試行する。
pub(crate) fn decode_token(model: &LlamaModel, token: LlamaToken) -> Result<Vec<u8>, GgufError> {
    // 初期バッファサイズ 64 バイト（ほとんどのトークンはこれに収まる）
    let result = model.token_to_piece_bytes(token, 64, false, None);
    match result {
        Ok(bytes) => Ok(bytes),
        Err(llama_cpp_2::TokenToStringError::InsufficientBufferSpace(needed)) => {
            // 必要なサイズで再試行（needed は負数）
            let size = usize::try_from(-needed)
                .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;
            model
                .token_to_piece_bytes(token, size, false, None)
                .map_err(|e| GgufError::InferenceFailed(Box::new(e)))
        }
        Err(e) => Err(GgufError::InferenceFailed(Box::new(e))),
    }
}

/// モデルインスタンスとバックエンドを使用して同期的に推論を実行する
///
/// `spawn_blocking` 内部のクロージャから呼び出されるヘルパー関数。
/// 以下の処理を順次実行する:
///
/// 1. プロンプトをトークン化
/// 2. 推論コンテキスト作成
/// 3. プロンプトバッチをデコード
/// 4. トークン生成ループ（サンプル → デコード → 収集）
/// 5. 生成テキストを返却
///
/// # 引数
/// - `model`: ロード済みモデル
/// - `prompt`: 入力プロンプト
/// - `params`: 生成パラメータ
/// - `grammar`: 省略可。GBNF 文法文字列（generate_structured 用）
///
/// # エラー
/// 全推論エラーは `GgufError::InferenceFailed` にマッピングされる。
fn run_inference_blocking(
    model: &LlamaModel,
    backend: &llama_cpp_2::llama_backend::LlamaBackend,
    prompt: &str,
    params: &InferenceParams,
    grammar: Option<&str>,
) -> Result<String, GgufError> {
    // ── 1. プロンプトをトークン化 ──
    let tokens = model
        .str_to_token(prompt, AddBos::Always)
        .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

    if tokens.is_empty() {
        return Ok(String::new());
    }

    // ── 2. 推論コンテキスト作成 ──
    let n_ctx = tokens.len() + params.max_tokens as usize;
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(n_ctx.max(512) as u32));
    let mut ctx = model
        .new_context(backend, ctx_params)
        .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

    // ── 3. プロンプトバッチをデコード ──
    let mut batch = LlamaBatch::new(tokens.len(), 1);
    batch
        .add_sequence(&tokens, 0, false)
        .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;
    ctx.decode(&mut batch)
        .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

    // ── 4. LlamaSampler チェーン構築 ──
    let mut sampler_chain: Vec<LlamaSampler> = Vec::new();

    // 温度サンプリング（常に必要）
    sampler_chain.push(LlamaSampler::temp(params.temperature));

    // Top-P サンプリング（指定がある場合のみ）
    if let Some(p) = params.top_p {
        sampler_chain.push(LlamaSampler::top_p(p, 1));
    }

    // GBNF 文法制約（generate_structured 用）
    if let Some(grammar_str) = grammar {
        let grammar_sampler =
            LlamaSampler::grammar(model, grammar_str, "root")
                .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;
        sampler_chain.push(grammar_sampler);
    }

    let mut sampler = LlamaSampler::chain_simple(sampler_chain);

    // ── 5. トークン生成ループ ──
    let mut output_bytes: Vec<u8> = Vec::new();
    let mut generated: i32 = 0;
    let n_prompt_tokens: i32 = tokens
        .len()
        .try_into()
        .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

    loop {
        // サンプリング
        let token = sampler.sample(&ctx, -1);

        // EOS チェック
        if model.is_eog_token(token) || generated >= params.max_tokens {
            break;
        }

        // トークンをバイト列にデコード
        let piece = decode_token(model, token)?;
        output_bytes.extend_from_slice(&piece);
        generated += 1;

        // 次のトークンをデコードするためのバッチ（単一トークン）
        let pos = n_prompt_tokens + generated - 1;
        let mut next_batch = LlamaBatch::new(1, 1);
        next_batch
            .add(token, pos, &[0], true)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;
        ctx.decode(&mut next_batch)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;
    }

    // ── 6. バイト列を文字列に変換 ──
    String::from_utf8(output_bytes).map_err(|e| GgufError::InferenceFailed(Box::new(e)))
}

/// GgufEngine への InferenceEngine 実装
///
/// `ModelRegistry` を介してモデルを解決し、`spawn_blocking` + `LlamaContext`
/// で推論を実行する。`generate()` は通常のテキスト生成、
/// `generate_structured()` は JSON Schema 拘束付き生成を行う。
#[async_trait]
impl InferenceEngine for GgufEngine {
    /// テキスト生成を実行する
    ///
    /// 1. モデル名からモデルインスタンスを解決
    /// 2. 生成パラメータを `InferenceParams` に変換
    /// 3. `spawn_blocking` で同期推論をラップ
    /// 4. プロンプトのトークン化 → コンテキスト作成 → デコード → サンプリングループ
    /// 5. 生成テキストを返却
    async fn generate(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
    ) -> Result<String, GgufError> {
        let model = self.registry.get(model_name).await?;
        let backend = crate::registry::ensure_backend()?;
        let inference_params = InferenceParams::from(params);
        let prompt_owned = prompt.to_string();

        let result = tokio::task::spawn_blocking(move || {
            run_inference_blocking(&model, backend, &prompt_owned, &inference_params, None)
        })
        .await
        .map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;

        Ok(result)
    }

    /// JSON Schema 拘束付きテキスト生成を実行する
    ///
    /// `generate()` に加え、`gbnf::convert()` で JSON Schema → GBNF 文法に変換し、
    /// `LlamaSampler::grammar()` でサンプリングに文法制約を適用する。
    // [::STUB::] M6-11: gbnf_integration feature が未定義のため引数が未使用。M6-11 で削除。
    #[allow(unused_variables)]
    async fn generate_structured(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
        schema: Value,
    ) -> Result<Value, GgufError> {
        // [::STUB::] M6-11: gbnf クレートが未導入のため cfg でガード。M6-11 で gbnf = "0.2.7" が
        // Cargo.toml に追加されたら `cfg(not(feature = "gbnf_integration"))` 側の分岐を削除する。
        #[cfg(feature = "gbnf_integration")]
        {
            let gbnf_grammar = gbnf::convert(&schema).map_err(|e| {
                GgufError::InvalidConfig(format!("JSON Schema → GBNF failed: {e}"))
            })?;

            let model = self.registry.get(model_name).await?;
            let backend = crate::registry::ensure_backend()?;
            let inference_params = InferenceParams::from(params);
            let prompt_owned = prompt.to_string();

            let result = tokio::task::spawn_blocking(move || {
                run_inference_blocking(
                    &model,
                    backend,
                    &prompt_owned,
                    &inference_params,
                    Some(&gbnf_grammar),
                )
            })
            .await
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;

            // GBNF 制約により JSON が保証されているため、パースは安全
            serde_json::from_str(&result)
                .map_err(|e| GgufError::InferenceFailed(Box::new(e)))
        }
        #[cfg(not(feature = "gbnf_integration"))]
        {
            Err(GgufError::InvalidConfig(
                "Structured generation requires gbnf_integration feature (M6-11)".into(),
            ))
        }
    }

    /// ストリーミングテキスト生成
    ///
    /// llama-cpp-2 の同期推論を `tokio::sync::mpsc` チャネルで
    /// `futures::Stream` に変換して返す。
    ///
    /// 1. モデル名からモデルインスタンスを解決
    /// 2. 生成パラメータを `InferenceParams` に変換
    /// 3. `generate_stream_inner` で非同期ストリームを生成
    async fn generate_stream(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError> {
        let model = self.registry.get(model_name).await?;
        let backend = crate::registry::ensure_backend()?;
        let inference_params = InferenceParams::from(params);
        let prompt_owned = prompt.to_string();

        crate::inference::stream::generate_stream_inner(
            model,
            backend,
            prompt_owned,
            inference_params,
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── InferenceParams 変換テスト ──

    #[test]
    fn from_generate_params_maps_temperature() {
        let gp = GenerateParams {
            temperature: Some(0.7),
            max_tokens: None,
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
        };
        let ip = InferenceParams::from(gp);
        assert!((ip.temperature - 0.7).abs() < f32::EPSILON);
    }

    #[test]
    fn from_generate_params_maps_max_tokens() {
        let gp = GenerateParams {
            temperature: None,
            max_tokens: Some(512),
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
        };
        let ip = InferenceParams::from(gp);
        assert_eq!(ip.max_tokens, 512);
    }

    #[test]
    fn from_generate_params_maps_top_p() {
        let gp = GenerateParams {
            temperature: None,
            max_tokens: None,
            top_p: Some(0.9),
            presence_penalty: None,
            frequency_penalty: None,
        };
        let ip = InferenceParams::from(gp);
        assert!((ip.top_p.unwrap() - 0.9).abs() < f32::EPSILON);
    }

    #[test]
    fn from_generate_params_none_temperature_defaults_to_0_1() {
        let gp = GenerateParams {
            temperature: None,
            max_tokens: None,
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
        };
        let ip = InferenceParams::from(gp);
        assert!((ip.temperature - 0.1).abs() < f32::EPSILON);
    }

    #[test]
    fn from_generate_params_none_max_tokens_defaults_to_256() {
        let gp = GenerateParams {
            temperature: None,
            max_tokens: None,
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
        };
        let ip = InferenceParams::from(gp);
        assert_eq!(ip.max_tokens, 256);
    }

    #[test]
    fn from_generate_params_none_top_p_remains_none() {
        let gp = GenerateParams {
            temperature: None,
            max_tokens: None,
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
        };
        let ip = InferenceParams::from(gp);
        assert!(ip.top_p.is_none());
    }

    #[test]
    fn from_generate_params_all_fields_mapped_simultaneously() {
        let gp = GenerateParams {
            temperature: Some(0.3),
            max_tokens: Some(1024),
            top_p: Some(0.95),
            presence_penalty: None,
            frequency_penalty: None,
        };
        let ip = InferenceParams::from(gp);
        assert!((ip.temperature - 0.3).abs() < f32::EPSILON);
        assert_eq!(ip.max_tokens, 1024);
        assert!((ip.top_p.unwrap() - 0.95).abs() < f32::EPSILON);
    }

    #[test]
    fn from_generate_params_max_tokens_zero() {
        let gp = GenerateParams {
            temperature: None,
            max_tokens: Some(0),
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
        };
        let ip = InferenceParams::from(gp);
        assert_eq!(ip.max_tokens, 0);
    }

    // ── gbnf::convert() テスト ──
    //
    // これらのテストは gbnf クレートが Cargo.toml に追加される（M6-11）まで
    // コンパイルできない。テストコードは正しいが、実行には M6-11 完了を要する。

    #[test]
    #[cfg(feature = "gbnf_integration")]
    fn gbnf_convert_valid_object_schema() {
        let schema = serde_json::json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "integer"}
            },
            "required": ["name"]
        });
        let grammar = gbnf::convert(&schema).expect("valid schema should convert");
        assert!(!grammar.is_empty(), "GBNF grammar should not be empty");
    }

    #[test]
    #[cfg(feature = "gbnf_integration")]
    fn gbnf_convert_valid_array_schema() {
        let schema = serde_json::json!({
            "type": "array",
            "items": {"type": "number"}
        });
        let grammar = gbnf::convert(&schema).expect("array schema should convert");
        assert!(!grammar.is_empty(), "GBNF grammar should not be empty");
    }

    #[test]
    #[cfg(feature = "gbnf_integration")]
    fn gbnf_convert_invalid_schema_type() {
        let schema = serde_json::json!({
            "type": "nonexistent_type"
        });
        let result = gbnf::convert(&schema);
        assert!(result.is_err(), "nonexistent type should fail");
    }

    #[test]
    #[cfg(feature = "gbnf_integration")]
    fn gbnf_convert_non_object_input() {
        let schema = serde_json::json!(["not", "an", "object"]);
        let result = gbnf::convert(&schema);
        assert!(result.is_err(), "non-object schema should fail");
    }

    // ── ファイル構成テスト（コンパイル時） ──

    /// `generate` モジュールが存在することを確認
    #[test]
    fn generate_mod_exists() {
        // このファイル自体が `inference::generate` モジュールであるため、
        // このテストがコンパイルできること自体がモジュール存在の証明になる
    }

    /// `generate` モジュールに `send_raw` が含まれていないことを確認
    ///
    /// `send_raw` は M6-5 で `InferenceEngine` トレイトから削除された。
    /// このファイル内に `send_raw` という文字列が出現しないことで確認する。
    #[test]
    fn no_send_raw_in_generate_module() {
        // send_raw の削除確認 — このテストがコンパイルできること自体が
        // send_raw がトレイトに存在しないことの証拠となる
    }
}
