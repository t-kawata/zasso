//! # ルーティング純粋関数
//!
//! model 文字列解析・エイリアス解決・API 形式解決の純粋ロジック関数群。
//! 一切の I/O・非同期実行を含まず、単体テストで完全に検証可能。

pub mod scheduler;

use std::collections::BTreeMap;

use crate::ProxyError;
use crate::config::{OpenAiWireApi, ProviderConfig, ResolvedModel};

/// llm-bridge-core の ApiFormat への変換をこのモジュールで提供する。
/// server feature 有効時のみコンパイルされる（translate mode 専用）。
#[cfg(feature = "server")]
use llm_bridge_core::model::ApiFormat as LlmApiFormat;

// ---------------------------------------------------------------------------
// ApiFormat
// ---------------------------------------------------------------------------

/// OpenAI 互換 API のワイヤー形式。
///
/// `resolve_api_format` の戻り値としてローカル定義する。
/// `to_llm_api_format()` で `llm_bridge_core::model::ApiFormat` に変換する。
///
/// 本ローカル型は library ビルド（server feature なし）でも利用可能な portable 型として
/// 意図的に維持する。llm_bridge_core::model::ApiFormat は server feature 配下にあるため、
/// `resolve_api_format()` の戻り値型として直接用いると library ビルドが成立しない。
#[derive(Debug, Clone, PartialEq)]
pub enum ApiFormat {
    /// /v1/chat/completions 形式
    OpenaiChat,
    /// /v1/responses 形式
    OpenaiResponses,
}

/// ローカル ApiFormat を llm-bridge-core の ApiFormat に変換する。
///
/// translate mode で upstream への変換形式を決定するために使用する。
/// server feature 有効時のみ利用可能。
#[cfg(feature = "server")]
pub fn to_llm_api_format(api_format: &ApiFormat) -> LlmApiFormat {
    match api_format {
        ApiFormat::OpenaiChat => LlmApiFormat::OpenaiChat,
        ApiFormat::OpenaiResponses => LlmApiFormat::OpenaiResponses,
    }
}

// ---------------------------------------------------------------------------
// parse_provider_model
// ---------------------------------------------------------------------------

/// `"provider/model"` 形式の文字列を最初の `/` のみで分割する。
///
/// `/` が見つからない場合は `ProxyError::InvalidModel` を返す。
///
/// # Examples
///
/// ```
/// # use anthropx::routing::parse_provider_model;
/// assert_eq!(parse_provider_model("deepseek/deepseek-v4").unwrap(), ("deepseek", "deepseek-v4"));
/// assert_eq!(parse_provider_model("litellm/openai/gpt-4.1").unwrap(), ("litellm", "openai/gpt-4.1"));
/// assert!(parse_provider_model("no-slash").is_err());
/// ```
pub fn parse_provider_model(spec: &str) -> Result<(&str, &str), ProxyError> {
    let slash_pos = spec
        .find('/')
        .ok_or_else(|| ProxyError::InvalidModel(spec.to_string()))?;
    Ok((&spec[..slash_pos], &spec[slash_pos + 1..]))
}

// ---------------------------------------------------------------------------
// resolve_model
// ---------------------------------------------------------------------------

/// モデル名を4段階で解決する。
///
/// 解決順序:
/// 1. Provider alias: `provider_config.model_aliases` から検索
/// 2. Global alias: `global_aliases` から検索（値が `provider/model` 形式なら再帰）
/// 3. Public model match: `provider_config.models[*].public` と一致
/// 4. Allow-list empty fallback: models が空なら任意の名前を許可
/// 5. Not found: `ProxyError::InvalidModel`
pub fn resolve_model(
    model_name: &str,
    provider_config: &ProviderConfig,
    global_aliases: &BTreeMap<String, String>,
) -> Result<ResolvedModel, ProxyError> {
    // Step 1: Provider alias 解決
    if let Some(upstream) = provider_config.model_aliases.get(model_name) {
        return find_by_upstream(provider_config, upstream);
    }

    // Step 2: Global alias 解決
    if let Some(target) = global_aliases.get(model_name) {
        // target 自体が `provider/model` 形式なら再帰的に解決
        if target.contains('/') {
            return resolve_full(target);
        }
        return find_by_upstream(provider_config, target);
    }

    // Step 3: 登録済み public model 名で検索
    for model in &provider_config.models {
        if model.public == model_name {
            return Ok(ResolvedModel {
                public: model.public.clone(),
                upstream: model.upstream.clone(),
            });
        }
    }

    // Step 4: allow-list が空なら任意の文字列を許可（upstream にそのまま送信）
    if provider_config.models.is_empty() {
        return Ok(ResolvedModel {
            public: model_name.to_string(),
            upstream: model_name.to_string(),
        });
    }

    // Step 5: 該当なし
    Err(ProxyError::InvalidModel(model_name.to_string()))
}

/// `find_by_upstream`: models から upstream が一致する最初のエントリを返す。
///
/// 解決された upstream 名をそのまま保存する。
fn find_by_upstream(
    provider_config: &ProviderConfig,
    upstream_name: &str,
) -> Result<ResolvedModel, ProxyError> {
    for model in &provider_config.models {
        if model.upstream == upstream_name || model.public == upstream_name {
            return Ok(ResolvedModel {
                public: model.public.clone(),
                upstream: upstream_name.to_string(),
            });
        }
    }
    // upstream に対応する model 定義がない場合も、upstream_name をそのまま使用する
    Ok(ResolvedModel {
        public: upstream_name.to_string(),
        upstream: upstream_name.to_string(),
    })
}

/// `resolve_full`: `"provider/model"` 形式の spec を parse して解決する。
///
/// `parse_provider_model` で分割し、モデル名部分を upstream として保持する。
fn resolve_full(spec: &str) -> Result<ResolvedModel, ProxyError> {
    let (_provider, model_name) = parse_provider_model(spec)?;
    Ok(ResolvedModel {
        public: spec.to_string(),
        upstream: model_name.to_string(),
    })
}

// ---------------------------------------------------------------------------
// resolve_api_format
// ---------------------------------------------------------------------------

/// `OpenAiWireApi` 設定に基づいて `ApiFormat` を選択する。
///
/// `Auto` の場合は `base_url` のパス末尾から自動判定する。
pub fn resolve_api_format(wire_api: &OpenAiWireApi, base_url: &str) -> ApiFormat {
    match wire_api {
        OpenAiWireApi::ChatCompletions => ApiFormat::OpenaiChat,
        OpenAiWireApi::Responses => ApiFormat::OpenaiResponses,
        OpenAiWireApi::Auto => {
            // base_url のパス末尾から自動判定
            let path = base_url.to_ascii_lowercase();
            if path.ends_with("/v1/chat/completions") || path.contains("/chat/completions") {
                ApiFormat::OpenaiChat
            } else if path.ends_with("/v1/responses") || path.contains("/responses") {
                ApiFormat::OpenaiResponses
            } else {
                // デフォルトは Chat Completions
                ApiFormat::OpenaiChat
            }
        }
    }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- parse_provider_model ----

    #[test]
    fn parse_provider_model_normal() {
        let result = parse_provider_model("deepseek/deepseek-v4").unwrap();
        assert_eq!(result, ("deepseek", "deepseek-v4"));
    }

    #[test]
    fn parse_provider_model_multi_slash() {
        let result = parse_provider_model("litellm/openai/gpt-4.1").unwrap();
        assert_eq!(result, ("litellm", "openai/gpt-4.1"));
    }

    #[test]
    fn parse_provider_model_no_slash() {
        let err = parse_provider_model("no-slash").unwrap_err();
        assert!(matches!(err, ProxyError::InvalidModel(_)));
    }

    #[test]
    fn parse_provider_model_empty() {
        let err = parse_provider_model("").unwrap_err();
        assert!(matches!(err, ProxyError::InvalidModel(_)));
    }

    // ---- resolve_model ----

    /// テスト用の最小 ProviderConfig を生成する。
    fn make_provider(models: Vec<(&str, &str)>) -> ProviderConfig {
        ProviderConfig {
            transparent: false,
            base_url: "https://example.com".to_string(),
            api_keys: vec!["key".to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: None,
            max_in_flight: None,
            max_queue: None,
            model_aliases: BTreeMap::from([
                ("fast".to_string(), "fast-model".to_string()),
                ("cheap".to_string(), "cheap-model".to_string()),
            ]),
            models: models
                .into_iter()
                .map(|(public, upstream)| crate::config::ModelConfig {
                    public: public.to_string(),
                    upstream: upstream.to_string(),
                    enabled: true,
                    tags: vec![],
                    max_tokens_cap: None,
                    aliases: vec![],
                })
                .collect(),
        }
    }

    #[test]
    fn resolve_model_provider_alias() {
        let provider = make_provider(vec![("gpt-4", "up-gpt-4")]);
        let global = BTreeMap::new();
        let result = resolve_model("fast", &provider, &global).unwrap();
        assert_eq!(result.public, "fast-model");
        assert_eq!(result.upstream, "fast-model");
    }

    #[test]
    fn resolve_model_global_alias() {
        let provider = make_provider(vec![("gpt-4", "up-gpt-4")]);
        let global = BTreeMap::from([("fast-model".to_string(), "gpt-4".to_string())]);
        let result = resolve_model("fast-model", &provider, &global).unwrap();
        // global alias 解決後、find_by_upstream で public=gpt-4 が一致
        // → upstream に "gpt-4"、public に "gpt-4" が設定される
        assert_eq!(result.upstream, "gpt-4");
    }

    #[test]
    fn resolve_model_global_alias_recursive() {
        let provider = make_provider(vec![("gpt-4", "up-gpt-4")]);
        let global = BTreeMap::from([(
            "global-model".to_string(),
            "deepseek/deepseek-v4".to_string(),
        )]);
        let result = resolve_model("global-model", &provider, &global).unwrap();
        // global alias の値が `provider/model` 形式 → resolve_full で解決
        assert_eq!(result.upstream, "deepseek-v4");
    }

    #[test]
    fn resolve_model_allow_list_empty() {
        let provider = make_provider(vec![]);
        let global = BTreeMap::new();
        let result = resolve_model("anything", &provider, &global).unwrap();
        assert_eq!(result.public, "anything");
        assert_eq!(result.upstream, "anything");
    }

    #[test]
    fn resolve_model_not_found() {
        let provider = make_provider(vec![("gpt-4", "up-gpt-4")]);
        let global = BTreeMap::new();
        let err = resolve_model("unknown-model", &provider, &global).unwrap_err();
        assert!(matches!(err, ProxyError::InvalidModel(_)));
    }

    #[test]
    fn resolve_model_public_match() {
        let provider = make_provider(vec![("gpt-4", "up-gpt-4"), ("gpt-3.5", "up-gpt-3.5")]);
        let global = BTreeMap::new();
        let result = resolve_model("gpt-4", &provider, &global).unwrap();
        assert_eq!(result.public, "gpt-4");
        assert_eq!(result.upstream, "up-gpt-4");
    }

    // ---- resolve_api_format ----

    #[test]
    fn resolve_api_format_auto_chat() {
        let result = resolve_api_format(
            &OpenAiWireApi::Auto,
            "https://api.openai.com/v1/chat/completions",
        );
        assert_eq!(result, ApiFormat::OpenaiChat);
    }

    #[test]
    fn resolve_api_format_auto_responses() {
        let result =
            resolve_api_format(&OpenAiWireApi::Auto, "https://api.example.com/v1/responses");
        assert_eq!(result, ApiFormat::OpenaiResponses);
    }

    #[test]
    fn resolve_api_format_explicit_chat() {
        let result = resolve_api_format(
            &OpenAiWireApi::ChatCompletions,
            "https://api.example.com/any/path",
        );
        assert_eq!(result, ApiFormat::OpenaiChat);
    }

    #[test]
    fn resolve_api_format_explicit_responses() {
        let result = resolve_api_format(
            &OpenAiWireApi::Responses,
            "https://api.example.com/any/path",
        );
        assert_eq!(result, ApiFormat::OpenaiResponses);
    }
}
