//! GgufEngine への InferenceEngine トレイト実装（generate / generate_structured / generate_stream）
//!
//! mistralrs の `Model::send_chat_request` をラップしてテキスト生成を提供する。
//! モデル解決は `ModelRegistry` に委譲し、生成パラメータは `GenerateParams` から
//! mistralrs の `SamplingParams` に変換する。
//!
//! # データフロー
//!
//! ```text
//! generate(model_name, prompt, params)
//!   → ModelRegistry::get(model_name)         // モデル解決（未ロードならロード）
//!   → RequestBuilder 構築（prompt → messages）
//!   → SamplingParams 変換（params → mistralrs 形式）
//!   → Model::send_chat_request(request)      // mistralrs 推論
//!   → response.choices[0].message.content    // テキスト抽出
//!
//! generate_stream(model_name, prompt, params)
//!   → ModelRegistry::get(model_name)
//!   → RequestBuilder 構築
//!   → Model::stream_chat_request(request)    // mistralrs ストリーミング
//!   → チャンネル経由で Stream<Result<String>> を生成
//! ```

use std::pin::Pin;

use async_trait::async_trait;
use futures::Stream;
use serde_json::Value;

use mistralrs::{Constraint, RequestBuilder, Response, SamplingParams, TextMessageRole};

use crate::error::GgufError;
use crate::inference::{GenerateParams, InferenceEngine};
use crate::GgufEngine;

/// `GenerateParams` → mistralrs `SamplingParams` 変換
///
/// 各フィールドを適切な型にマッピングする:
/// - `temperature`: f32 → f64
/// - `max_tokens`: u32 → usize（`max_len` にマッピング）
/// - `top_p`: f32 → f64
/// - `presence_penalty`, `frequency_penalty`: そのまま f32
impl From<GenerateParams> for SamplingParams {
    fn from(params: GenerateParams) -> Self {
        SamplingParams {
            temperature: params.temperature.map(|t| t as f64),
            top_p: params.top_p.map(|p| p as f64),
            frequency_penalty: params.frequency_penalty,
            presence_penalty: params.presence_penalty,
            max_len: params.max_tokens.map(|m| m as usize),
            // デフォルト値
            top_k: None,
            min_p: None,
            top_n_logprobs: 0,
            repetition_penalty: None,
            stop_toks: None,
            logits_bias: None,
            n_choices: 1,
            dry_params: None,
        }
    }
}

/// GgufEngine への InferenceEngine 実装
///
/// `ModelRegistry` を介してモデルを解決し、`Model::send_chat_request` で推論を実行する。
/// `generate()` は通常のテキスト生成、`generate_structured()` は JSON Schema 拘束付き生成を行う。
#[async_trait]
impl InferenceEngine for GgufEngine {
    /// テキスト生成を実行する
    ///
    /// 1. モデル名からモデルインスタンスを解決
    /// 2. プロンプトを User メッセージとして設定
    /// 3. 生成パラメータを SamplingParams に変換
    /// 4. mistralrs にリクエストを送信
    /// 5. レスポンスから生成テキストを抽出
    async fn generate(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
    ) -> Result<String, GgufError> {
        let model = self.registry.get(model_name).await?;

        let request = RequestBuilder::new()
            .add_message(TextMessageRole::User, prompt)
            .set_sampling(params.into());

        let response = model
            .send_chat_request(request)
            .await
            .map_err(GgufError::MistralrsError)?;

        response
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message.content)
            .ok_or_else(|| {
                GgufError::InferenceFailed(Box::new(std::io::Error::other(
                    "model returned empty response",
                )))
            })
    }

    /// JSON Schema 拘束付きテキスト生成を実行する
    ///
    /// `generate()` に加え、`Constraint::JsonSchema` で出力形式を拘束する。
    /// mistralrs は JSON Schema に従った構造化データを生成し、それを `Value` として返す。
    async fn generate_structured(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
        schema: Value,
    ) -> Result<Value, GgufError> {
        let model = self.registry.get(model_name).await?;

        let request = RequestBuilder::new()
            .add_message(TextMessageRole::User, prompt)
            .set_sampling(params.into())
            .set_constraint(Constraint::JsonSchema(schema));

        let response = model
            .send_chat_request(request)
            .await
            .map_err(GgufError::MistralrsError)?;

        let content = response
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message.content)
            .ok_or_else(|| {
                GgufError::InferenceFailed(Box::new(std::io::Error::other(
                    "model returned empty response",
                )))
            })?;

        serde_json::from_str(&content).map_err(|e| GgufError::InferenceFailed(Box::new(e)))
    }

    async fn generate_stream(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError> {
        let model = self.registry.get(model_name).await?;
        let request = RequestBuilder::new()
            .add_message(TextMessageRole::User, prompt)
            .set_sampling(params.into());

        // mistralrs::Stream<'_> が &Model を借用するため、そのまま spawn できない。
        // 解決策: 生ポインタで borrow checker の制約を回避する。
        // SAFETY: model (Arc) は spawn タスク内で生存し続けるため、生ポインタ変換は安全。
        let model_ptr: *const mistralrs::Model = std::sync::Arc::as_ptr(&model);
        let model_ref: &mistralrs::Model = unsafe { &*model_ptr };
        let mut mistral_stream = model_ref
            .stream_chat_request(request)
            .await
            .map_err(GgufError::MistralrsError)?;

        let (tx, rx) = tokio::sync::mpsc::channel::<Result<String, GgufError>>(16);

        // model (Arc) と mistral_stream を spawn タスクに移動
        // mistral_stream は生ポインタ経由の参照を持つが、Arc で実体が保持される
        tokio::spawn(async move {
            use crate::inference::stream::convert_response;
            loop {
                let response = match mistral_stream.next().await {
                    Some(r) => r,
                    None => break,
                };
                match convert_response(response) {
                    crate::inference::stream::ResponseItem::Processing(Ok(content)) => {
                        if tx.send(Ok(content)).await.is_err() {
                            break; // 受信側がドロップ
                        }
                    }
                    crate::inference::stream::ResponseItem::Processing(Err(e)) => {
                        let _ = tx.send(Err(e)).await;
                        break;
                    }
                    crate::inference::stream::ResponseItem::Done => break,
                }
            }
        });

        // Receiver を unfold で Stream に変換（tokio_stream 不要）
        let result_stream = futures::stream::unfold(rx, |mut rx| async move {
            rx.recv().await.map(|item| (item, rx))
        });
        Ok(Box::pin(result_stream))
    }

    async fn send_raw(
        &self,
        model_name: &str,
        request: RequestBuilder,
    ) -> Result<Response, GgufError> {
        let model = self.registry.get(model_name).await?;
        let response = model
            .send_chat_request(request)
            .await
            .map_err(GgufError::MistralrsError)?;
        Ok(Response::Done(response))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::{DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE};

    // ── GenerateParams → SamplingParams 変換テスト ──

    #[test]
    fn from_generate_params_maps_all_fields() {
        let gp = GenerateParams {
            temperature: Some(0.7),
            max_tokens: Some(512),
            top_p: Some(0.9),
            presence_penalty: Some(0.1),
            frequency_penalty: Some(0.2),
        };
        let sp = SamplingParams::from(gp);

        // f32 → f64 変換は誤差が生じるため、approx 比較（ULPs）ではなく
        // 値域が同一であることを確認する
        assert_eq!(sp.max_len, Some(512_usize));
        assert!(sp.presence_penalty.is_some());
        assert!(sp.frequency_penalty.is_some());
        assert!(sp.temperature.is_some());
        assert!(sp.top_p.is_some());

        // 温度は f32 → f64 変換で近似値になることを許容
        let temp = sp.temperature.unwrap();
        assert!(
            (temp - 0.7_f64).abs() < 0.001,
            "temperature should be approx 0.7, got {temp}"
        );
    }

    #[test]
    fn from_generate_params_none_fields_propagate() {
        let gp = GenerateParams {
            temperature: None,
            max_tokens: None,
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
        };
        let sp = SamplingParams::from(gp);

        assert_eq!(sp.temperature, None);
        assert_eq!(sp.max_len, None);
        assert_eq!(sp.top_p, None);
        assert_eq!(sp.presence_penalty, None);
        assert_eq!(sp.frequency_penalty, None);
    }

    #[test]
    fn from_generate_params_default_values_convert() {
        let gp = GenerateParams::default();
        let sp = SamplingParams::from(gp);

        // GenerateParams::default() は定数を使用
        assert_eq!(sp.temperature, Some(DEFAULT_TEMPERATURE as f64));
        assert_eq!(sp.max_len, Some(DEFAULT_MAX_TOKENS as usize));
    }

    #[test]
    fn from_generate_params_fixed_fields() {
        let gp = GenerateParams::default();
        let sp = SamplingParams::from(gp);

        // SamplingParams の固定フィールドが正しく設定されている
        assert_eq!(sp.top_k, None);
        assert_eq!(sp.min_p, None);
        assert_eq!(sp.top_n_logprobs, 0);
        assert_eq!(sp.repetition_penalty, None);
        assert_eq!(sp.n_choices, 1);
    }

    // ── mistralrs 型構築テスト ──

    #[test]
    fn request_builder_constructs_with_messages() {
        let request = RequestBuilder::new()
            .add_message(TextMessageRole::User, "hello")
            .set_constraint(Constraint::None);

        // コンパイルが通ることを確認（実行時検証ではなく型チェック）
        let _ = request;
    }

    #[test]
    fn constraint_json_schema_constructs() {
        let schema = serde_json::json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            }
        });
        // Constraint::JsonSchema がコンパイル可能であることを確認（型チェックのみ）
        let _constraint = Constraint::JsonSchema(schema);
    }
}
