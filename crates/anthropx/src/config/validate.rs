//! # 設定検証
//!
//! `AppConfig::validate()` による集約型バリデーション。
//! 全エラーを収集してから一度に報告し、ユーザーが1回の起動ですべての設定ミスを修正できるようにする。

use std::collections::HashSet;

use crate::config::{AppConfig, ConfigError};

/// url_prefix を正規化する（RFC02 §6.1）。
///
/// - 空文字列 → 空文字列（変更なし）
/// - 先頭に `/` がない → 先頭に `/` を付与
/// - 末尾に `/` がある → 末尾の `/` を除去
///
/// # 例
///
/// | 入力 | 出力 |
/// |------|------|
/// | `""` | `""` |
/// | `"proxy"` | `"/proxy"` |
/// | `"/prefix/"` | `"/prefix"` |
/// | `"/"` | `""` |
/// | `"//"` | `""` |
fn normalize_url_prefix(prefix: &str) -> String {
    if prefix.is_empty() {
        return String::new();
    }

    // 末尾の / を全て除去
    let trimmed_end = prefix.trim_end_matches('/');

    if trimmed_end.is_empty() {
        return String::new(); // "/" や "//" → ""
    }

    // 先頭に / がない場合のみ付与
    if trimmed_end.starts_with('/') {
        trimmed_end.to_string()
    } else {
        format!("/{}", trimmed_end)
    }
}

impl AppConfig {
    /// 設定の整合性を検証する（RFC §2.1, RFC02 §6）。
    ///
    /// 全エラーを収集してから一度に報告する集約型バリデーション。
    /// これによりユーザーは1回の起動ですべての設定ミスを修正できる。
    ///
    /// 検証の副作用として、`url_prefix` の正規化（先頭 `/` 付与・末尾 `/` 除去）
    /// を実行する（RFC02 §6.1）。
    ///
    /// # 検証項目
    ///
    /// 1. `url_prefix` の正規化
    /// 2. 各 provider の `api_keys` が1件以上存在する
    /// 3. 各 provider 内の `models.public` に重複がない
    /// 4. 各 provider 内の `model_aliases` のキーが public model 名と衝突しない
    /// 5. global alias と provider alias の競合ログ出力（許容、エラーにはしない）
    /// 6. ポート番号が 1〜65535 の範囲内
    /// 7. timeout 値（connect_ms / read_ms / total_ms）が 0 でない
    pub fn validate(&mut self) -> Result<(), Vec<ConfigError>> {
        let mut errors = Vec::new();

        // 0. url_prefix 正規化（RFC02 §6.1）
        self.global.url_prefix = normalize_url_prefix(&self.global.url_prefix);

        // 1. 各 provider の api_keys が空でないこと
        for (name, provider) in &self.providers {
            if provider.api_keys.is_empty() {
                errors.push(ConfigError::EmptyApiKeys(name.clone()));
            }
        }

        // 2. 各 provider 内の models.public に重複がないこと
        // 3. 各 provider 内の model_aliases のキーが public model 名と衝突しないこと
        for provider in self.providers.values() {
            let mut seen_public_names = HashSet::new();
            // 2. public model 名の重複チェック
            for model in &provider.models {
                if !seen_public_names.insert(model.public.clone()) {
                    errors.push(ConfigError::DuplicateModel(model.public.clone()));
                }
            }
            // 3. alias のキーが public model 名と衝突するかチェック（RFC02 §6.2）
            //    修正前: alias の値（value）と public model 名を比較していた
            //    修正後: alias のキー（key）と public model 名を比較する
            let public_names: HashSet<&str> =
                provider.models.iter().map(|m| m.public.as_str()).collect();
            for alias_key in provider.model_aliases.keys() {
                if public_names.contains(alias_key.as_str()) {
                    errors.push(ConfigError::DuplicateAlias(
                        alias_key.clone(),
                        format!("public model name '{}'", alias_key),
                    ));
                }
            }
        }

        // 4. ポート番号が 1〜65535 の範囲内
        // （u16 のため 65535 以上はコンパイル時保証される。0 のみチェック）
        if self.global.port == 0 {
            errors.push(ConfigError::InvalidValue(
                "port must be between 1 and 65535".to_string(),
            ));
        }

        // 5. timeout 値が 0 でないこと
        if self.global.timeouts.connect_ms == 0 {
            errors.push(ConfigError::InvalidValue(
                "connect_ms must not be 0".to_string(),
            ));
        }
        if self.global.timeouts.read_ms == 0 {
            errors.push(ConfigError::InvalidValue(
                "read_ms must not be 0".to_string(),
            ));
        }
        if self.global.timeouts.total_ms == 0 {
            errors.push(ConfigError::InvalidValue(
                "total_ms must not be 0".to_string(),
            ));
        }

        // 6. global alias と provider alias の競合ログ出力（RFC02 §6.3）
        //    競合は許容する（provider alias 優先）。エラーにはしない。
        self.log_alias_conflicts();

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// global alias と provider alias の競合をログに出力する（RFC02 §6.3）。
    ///
    /// 競合時は provider alias が優先されるが、エラーにはせず `tracing::info!`
    /// で競合を記録する。
    fn log_alias_conflicts(&self) {
        for (provider_name, provider_config) in &self.providers {
            for alias_key in provider_config.model_aliases.keys() {
                if self.global.aliases.contains_key(alias_key.as_str()) {
                    tracing::info!(
                        "alias conflict resolved by provider priority: \
                         global alias '{}' overridden by provider '{}'",
                        alias_key,
                        provider_name
                    );
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use crate::config::*;

    /// デフォルト設定（空の providers）は検証を通過すること。
    #[test]
    fn validate_ok_default() {
        let mut config = AppConfig::default();
        assert!(config.validate().is_ok());
    }

    /// 正常な provider 設定は検証を通過すること。
    #[test]
    fn validate_ok_single_provider() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "test".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![ModelConfig {
                    public: "gpt-4".to_string(),
                    upstream: "up-gpt-4".to_string(),
                    enabled: true,
                    tags: vec![],
                    max_tokens_cap: None,
                    aliases: vec![],
                }],
            },
        );
        assert!(config.validate().is_ok());
    }

    /// 空の api_keys は EmptyApiKeys エラーになること。
    #[test]
    fn validate_empty_api_keys() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "no-keys".to_string(),
            ProviderConfig {
                transparent: true,
                base_url: "https://example.com".to_string(),
                api_keys: vec![],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );
        let err = config.validate().unwrap_err();
        assert_eq!(err.len(), 1);
        assert!(matches!(err[0], ConfigError::EmptyApiKeys(_)));
    }

    /// 同一 provider 内で models.public が重複するとエラーになること。
    #[test]
    fn validate_duplicate_model_public() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "dup".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![
                    ModelConfig {
                        public: "same-name".to_string(),
                        upstream: "up-1".to_string(),
                        enabled: true,
                        tags: vec![],
                        max_tokens_cap: None,
                        aliases: vec![],
                    },
                    ModelConfig {
                        public: "same-name".to_string(),
                        upstream: "up-2".to_string(),
                        enabled: true,
                        tags: vec![],
                        max_tokens_cap: None,
                        aliases: vec![],
                    },
                ],
            },
        );
        let err = config.validate().unwrap_err();
        assert!(
            err.iter()
                .any(|e| matches!(e, ConfigError::DuplicateModel(_)))
        );
    }

    /// provider 内の alias のキーが public model 名と衝突するとエラーになること。
    /// （旧ロジック: value と public 名を比較 → 新ロジック: key と public 名を比較）
    #[test]
    fn validate_duplicate_alias() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "alias-conflict".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::from([("gpt-4".to_string(), "fast-model".to_string())]),
                models: vec![ModelConfig {
                    public: "gpt-4".to_string(),
                    upstream: "up-gpt-4".to_string(),
                    enabled: true,
                    tags: vec![],
                    max_tokens_cap: None,
                    aliases: vec![],
                }],
            },
        );
        let err = config.validate().unwrap_err();
        assert!(
            err.iter()
                .any(|e| matches!(e, ConfigError::DuplicateAlias(_, _)))
        );
    }

    /// ポート番号 0 はエラーになること。
    #[test]
    fn validate_port_zero() {
        let mut config = AppConfig::default();
        config.global.port = 0;
        let err = config.validate().unwrap_err();
        assert!(!err.is_empty(), "port 0 should produce at least 1 error");
    }

    /// 複数の設定ミスが集約されること。
    #[test]
    fn validate_multiple_errors() {
        let mut config = AppConfig::default();
        // 2つの provider がともに api_keys が空
        config.providers.insert(
            "a".to_string(),
            ProviderConfig {
                transparent: true,
                base_url: "https://a.example.com".to_string(),
                api_keys: vec![],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );
        config.providers.insert(
            "b".to_string(),
            ProviderConfig {
                transparent: true,
                base_url: "https://b.example.com".to_string(),
                api_keys: vec![],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );
        config.global.port = 0;
        let err = config.validate().unwrap_err();
        assert!(
            err.len() >= 3,
            "expected at least 3 errors, got {}",
            err.len()
        );
    }

    /// timeout 値が 0 はエラーになること。
    #[test]
    fn validate_timeout_zero() {
        let mut config = AppConfig::default();
        config.global.timeouts.connect_ms = 0;
        let err = config.validate().unwrap_err();
        assert!(!err.is_empty(), "connect_ms=0 should produce error");
    }

    /// max_queue=0 は許容されること（エラーにならない）。
    #[test]
    fn validate_ok_max_queue_zero() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "zero-queue".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: Some(0),
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );
        assert!(config.validate().is_ok());
    }

    // -----------------------------------------------------------------------
    // normalize_url_prefix
    // -----------------------------------------------------------------------

    /// normalize_url_prefix("") → ""。
    #[test]
    fn normalize_url_prefix_empty() {
        assert_eq!(super::normalize_url_prefix(""), "");
    }

    /// normalize_url_prefix("proxy") → "/proxy"。
    #[test]
    fn normalize_url_prefix_add_slash() {
        assert_eq!(super::normalize_url_prefix("proxy"), "/proxy");
    }

    /// normalize_url_prefix("/prefix/") → "/prefix"。
    #[test]
    fn normalize_url_prefix_trim_slash() {
        assert_eq!(super::normalize_url_prefix("/prefix/"), "/prefix");
    }

    /// normalize_url_prefix("/") → ""。
    #[test]
    fn normalize_url_prefix_only_slash() {
        assert_eq!(super::normalize_url_prefix("/"), "");
    }

    /// normalize_url_prefix("//") → ""。
    #[test]
    fn normalize_url_prefix_double_slash() {
        assert_eq!(super::normalize_url_prefix("//"), "");
    }

    // -----------------------------------------------------------------------
    // alias 検証
    // -----------------------------------------------------------------------

    /// alias のキーが public model 名と衝突するとエラーになること。
    #[test]
    fn validate_alias_key_conflict() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "test".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::from([(
                    "existing-model".to_string(),
                    "alias-value".to_string(),
                )]),
                models: vec![ModelConfig {
                    public: "existing-model".to_string(),
                    upstream: "up-existing".to_string(),
                    enabled: true,
                    tags: vec![],
                    max_tokens_cap: None,
                    aliases: vec![],
                }],
            },
        );
        let err = config.validate().unwrap_err();
        assert!(
            err.iter()
                .any(|e| matches!(e, ConfigError::DuplicateAlias(_, _)))
        );
    }

    /// alias の値（value）が public model 名と衝突しても許容されること（エラーにならない）。
    #[test]
    fn validate_alias_value_no_conflict() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "test".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::from([(
                    "my-alias".to_string(),
                    "existing-model".to_string(),
                )]),
                models: vec![ModelConfig {
                    public: "existing-model".to_string(),
                    upstream: "up-existing".to_string(),
                    enabled: true,
                    tags: vec![],
                    max_tokens_cap: None,
                    aliases: vec![],
                }],
            },
        );
        assert!(config.validate().is_ok());
    }

    /// global alias と provider alias の競合は許容され（エラーなし）、
    /// validate が Ok を返すこと。
    #[test]
    fn validate_global_provider_alias_conflict() {
        let mut config = AppConfig::default();
        config
            .global
            .aliases
            .insert("shared-alias".to_string(), "global-value".to_string());
        config.providers.insert(
            "test".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::from([(
                    "shared-alias".to_string(),
                    "provider-value".to_string(),
                )]),
                models: vec![],
            },
        );
        assert!(config.validate().is_ok());
    }
}
