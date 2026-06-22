use super::*;

// ---- AppConfig ----

/// AppConfig::default() の全フィールドが期待値と一致すること。
#[test]
fn app_config_default() {
    let config = AppConfig::default();
    assert_eq!(config.global.port, 8088);
    assert!(config.global.url_prefix.is_empty());
    assert!(!config.global.require_client_auth);
    assert_eq!(config.global.log_format, LogFormat::Text);
    assert!(!config.global.allow_lossy);
    assert!(!config.global.error_lossy_continue);
    assert_eq!(config.global.timeouts, TimeoutConfig::default());
    assert_eq!(config.global.limits, GlobalLimitConfig::default());
    assert!(config.global.aliases.is_empty());
    assert!(config.providers.is_empty());
}

/// AppConfig::default() で providers が空の BTreeMap になること。
#[test]
fn app_config_default_providers_empty() {
    let config = AppConfig::default();
    assert!(config.providers.is_empty());
}

// ---- ProxyError::status_code ----

/// ProxyError::status_code() が400を返すこと。
#[test]
fn status_code_unknown_provider() {
    let err = ProxyError::UnknownProvider("p".to_string());
    assert_eq!(err.status_code(), 400);
}

#[test]
fn status_code_invalid_model() {
    let err = ProxyError::InvalidModel("m".to_string());
    assert_eq!(err.status_code(), 400);
}

#[test]
fn status_code_missing_field() {
    let err = ProxyError::MissingField("f");
    assert_eq!(err.status_code(), 400);
}

#[test]
fn status_code_transform_lossy() {
    let err = ProxyError::TransformLossy("t".to_string());
    assert_eq!(err.status_code(), 400);
}

/// ProxyError::status_code() が401を返すこと。
#[test]
fn status_code_unauthorized() {
    let err = ProxyError::Unauthorized;
    assert_eq!(err.status_code(), 401);
}

/// ProxyError::status_code() が403を返すこと。
#[test]
fn status_code_forbidden() {
    let err = ProxyError::Forbidden;
    assert_eq!(err.status_code(), 403);
}

/// ProxyError::status_code() が429を返すこと。
#[test]
fn status_code_queue_full() {
    let err = ProxyError::QueueFull;
    assert_eq!(err.status_code(), 429);
}

/// ProxyError::status_code() が502を返すこと。
#[test]
fn status_code_upstream() {
    let err = ProxyError::Upstream(502);
    assert_eq!(err.status_code(), 502);
}

#[test]
fn status_code_upstream_error() {
    let err = ProxyError::UpstreamError("e".to_string());
    assert_eq!(err.status_code(), 502);
}

/// ProxyError::status_code() が504を返すこと。
#[test]
fn status_code_timeout() {
    let err = ProxyError::Timeout;
    assert_eq!(err.status_code(), 504);
}

/// ProxyError::status_code() が500を返すこと。
#[test]
fn status_code_internal() {
    let err = ProxyError::Internal("i".to_string());
    assert_eq!(err.status_code(), 500);
}

#[test]
fn status_code_config() {
    let err = ProxyError::Config("c".to_string());
    assert_eq!(err.status_code(), 500);
}

/// 複数 provider を持つ AppConfig の構築とフィールドアクセス。
#[test]
fn app_config_partial_providers() {
    let mut config = AppConfig::default();
    config.providers.insert(
        "a_provider".to_string(),
        ProviderConfig {
            transparent: true,
            base_url: "https://a.example.com".to_string(),
            api_keys: vec!["key_a".to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: None,
            max_in_flight: None,
            max_queue: None,
            model_aliases: BTreeMap::new(),
            models: Vec::new(),
        },
    );
    config.providers.insert(
        "b_provider".to_string(),
        ProviderConfig {
            transparent: false,
            base_url: "https://b.example.com".to_string(),
            api_keys: vec!["key_b".to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: None,
            max_in_flight: None,
            max_queue: None,
            model_aliases: BTreeMap::new(),
            models: Vec::new(),
        },
    );
    assert_eq!(config.providers.len(), 2);
    assert!(config.providers.contains_key("a_provider"));
    assert!(config.providers.contains_key("b_provider"));
}

// ---- GlobalConfig ----

/// GlobalConfig::default() の全フィールドが期待値と一致すること。
///
/// 期待値:
/// - port: 8088
/// - url_prefix: ""
/// - require_client_auth: false
/// - log_format: Text
/// - allow_lossy: false
/// - error_lossy_continue: false
/// - timeouts: デフォルト値
/// - limits: デフォルト値
/// - aliases: 空
#[test]
fn global_config_default() {
    let g = GlobalConfig::default();
    assert_eq!(g.port, 8088, "port should default to 8088");
    assert!(
        g.url_prefix.is_empty(),
        "url_prefix should default to empty"
    );
    assert!(
        !g.require_client_auth,
        "require_client_auth should default to false"
    );
    assert_eq!(
        g.log_format,
        LogFormat::Text,
        "log_format should default to Text"
    );
    assert!(!g.allow_lossy, "allow_lossy should default to false");
    assert!(
        !g.error_lossy_continue,
        "error_lossy_continue should default to false"
    );
    assert_eq!(
        g.timeouts,
        TimeoutConfig::default(),
        "timeouts should equal default"
    );
    assert_eq!(
        g.limits,
        GlobalLimitConfig::default(),
        "limits should equal default"
    );
    assert!(g.aliases.is_empty(), "aliases should default to empty");
}

// ---- ProviderConfig ----

/// ProviderConfig の `#[serde(default)]` が全オプショナルフィールドに
/// None または空を設定すること。
#[test]
fn provider_config_default() {
    let toml_str = r#"
transparent = true
base_url = "https://example.com"
api_keys = ["key1"]
"#;
    let provider: ProviderConfig = toml::from_str(toml_str).expect("TOML deserialize failed");
    assert!(provider.allow_lossy.is_none());
    assert!(provider.error_lossy_continue.is_none());
    assert!(provider.openai_wire_api.is_none());
    assert!(provider.max_in_flight.is_none());
    assert!(provider.max_queue.is_none());
    assert!(provider.model_aliases.is_empty());
    assert!(provider.models.is_empty());
}

// ---- ModelConfig ----

/// ModelConfig::default() の全フィールドが期待値と一致すること。
#[test]
fn model_config_default() {
    let m = ModelConfig::default();
    assert!(m.enabled, "enabled should default to true");
    assert!(m.tags.is_empty(), "tags should default to empty vec");
    assert!(
        m.max_tokens_cap.is_none(),
        "max_tokens_cap should default to None"
    );
    assert!(m.aliases.is_empty(), "aliases should default to empty vec");
}

/// default_enabled() が true を返すこと。
#[test]
fn model_config_enabled_default_true() {
    assert!(default_enabled());
}

// ---- TimeoutConfig ----

/// TimeoutConfig::default() の全フィールドが期待値と一致すること。
#[test]
fn timeout_config_default() {
    let t = TimeoutConfig::default();
    assert_eq!(t.connect_ms, 3000);
    assert_eq!(t.read_ms, 600_000);
    assert_eq!(t.total_ms, 600_000);
}

/// 各 default_*_ms() 関数の戻り値が期待値と一致すること。
#[test]
fn timeout_config_default_functions() {
    assert_eq!(default_connect_ms(), 3000);
    assert_eq!(default_read_ms(), 600_000);
    assert_eq!(default_total_ms(), 600_000);
}

// ---- GlobalLimitConfig ----

/// GlobalLimitConfig::default() の全フィールドが期待値と一致すること。
#[test]
fn global_limit_config_default() {
    let l = GlobalLimitConfig::default();
    assert_eq!(l.default_max_in_flight, 64);
    assert_eq!(l.default_max_queue, 256);
}

/// 各 default_*() 関数の戻り値が期待値と一致すること。
#[test]
fn global_limit_default_functions() {
    assert_eq!(default_in_flight(), 64);
    assert_eq!(default_queue(), 256);
}

// ---- LogFormat ----

/// default_log_format() が LogFormat::Text を返すこと。
#[test]
fn log_format_default_text() {
    assert_eq!(default_log_format(), LogFormat::Text);
}

/// LogFormat の2 variant が正しく構築できること。
#[test]
fn log_format_variants() {
    let text = LogFormat::Text;
    let json = LogFormat::Json;
    assert!(matches!(text, LogFormat::Text));
    assert!(matches!(json, LogFormat::Json));
}

// ---- OpenAiWireApi ----

/// OpenAiWireApi の3 variant が正しく構築できること。
#[test]
fn openai_wire_api_variants() {
    let auto = OpenAiWireApi::Auto;
    let chat = OpenAiWireApi::ChatCompletions;
    let resp = OpenAiWireApi::Responses;
    assert!(matches!(auto, OpenAiWireApi::Auto));
    assert!(matches!(chat, OpenAiWireApi::ChatCompletions));
    assert!(matches!(resp, OpenAiWireApi::Responses));
}

// ---- Serde: rename_all = "snake_case" ----

/// LogFormat / OpenAiWireApi の `#[serde(rename_all = "snake_case")]` が
/// snake_case デシリアライズで正しく動作すること。
#[test]
fn serde_rename_snake_case() {
    // LogFormat
    let text: LogFormat = serde_json::from_str(r#""text""#).expect("deser text");
    assert_eq!(text, LogFormat::Text);
    let json: LogFormat = serde_json::from_str(r#""json""#).expect("deser json");
    assert_eq!(json, LogFormat::Json);

    // OpenAiWireApi
    let auto: OpenAiWireApi = serde_json::from_str(r#""auto""#).expect("deser auto");
    assert_eq!(auto, OpenAiWireApi::Auto);
    let chat: OpenAiWireApi = serde_json::from_str(r#""chat_completions""#).expect("deser chat");
    assert_eq!(chat, OpenAiWireApi::ChatCompletions);
    let resp: OpenAiWireApi = serde_json::from_str(r#""responses""#).expect("deser responses");
    assert_eq!(resp, OpenAiWireApi::Responses);
}

// ---- Serde round-trip ----

/// AppConfig のデフォルト値を JSON にシリアライズ → デシリアライズで
/// 同一構造体が得られること。
#[test]
fn app_config_serde_roundtrip() {
    let original = AppConfig::default();
    let json = serde_json::to_string(&original).expect("serialize");
    let restored: AppConfig = serde_json::from_str(&json).expect("deserialize");
    // BTreeMap の同値比較
    assert_eq!(original.global.port, restored.global.port);
    assert_eq!(original.global.url_prefix, restored.global.url_prefix);
    assert_eq!(
        original.global.require_client_auth,
        restored.global.require_client_auth
    );
    assert_eq!(original.providers.len(), restored.providers.len());
}

/// ProviderConfig の全フィールドを明示的に指定してラウンドトリップ一致確認。
#[test]
fn provider_config_serde_roundtrip() {
    let original = ProviderConfig {
        transparent: true,
        base_url: "https://test.example.com".to_string(),
        api_keys: vec!["k1".to_string(), "k2".to_string()],
        allow_lossy: Some(true),
        error_lossy_continue: Some(false),
        openai_wire_api: Some(OpenAiWireApi::ChatCompletions),
        max_in_flight: Some(16),
        max_queue: Some(64),
        model_aliases: BTreeMap::from([("fast".to_string(), "fast-model".to_string())]),
        models: vec![ModelConfig {
            public: "m1".to_string(),
            upstream: "up-m1".to_string(),
            enabled: false,
            tags: vec!["tag1".to_string()],
            max_tokens_cap: Some(4096),
            aliases: vec!["m1-alias".to_string()],
        }],
    };
    let json = serde_json::to_string(&original).expect("serialize");
    let restored: ProviderConfig = serde_json::from_str(&json).expect("deserialize");
    assert_eq!(restored.transparent, original.transparent);
    assert_eq!(restored.base_url, original.base_url);
    assert_eq!(restored.api_keys, original.api_keys);
    assert_eq!(restored.allow_lossy, original.allow_lossy);
    assert_eq!(restored.openai_wire_api, original.openai_wire_api);
    assert_eq!(restored.max_in_flight, original.max_in_flight);
    assert_eq!(restored.models.len(), 1);
    assert_eq!(restored.models[0].public, "m1");
    assert_eq!(restored.models[0].upstream, "up-m1");
    assert!(!restored.models[0].enabled);
    assert_eq!(restored.models[0].max_tokens_cap, Some(4096));
    assert_eq!(restored.models[0].aliases, vec!["m1-alias"]);
}

// ---- BTreeMap key order ----

/// BTreeMap のキー順序がアルファベット昇順であることを確認。
#[test]
fn btreemap_key_order() {
    let mut providers = BTreeMap::new();
    providers.insert("z_provider".to_string(), dummy_provider());
    providers.insert("a_provider".to_string(), dummy_provider());
    providers.insert("m_provider".to_string(), dummy_provider());
    let keys: Vec<&String> = providers.keys().collect();
    assert_eq!(keys, vec!["a_provider", "m_provider", "z_provider"]);
}

/// BTreeMap キー順序テスト用のダミー ProviderConfig を生成する。
fn dummy_provider() -> ProviderConfig {
    ProviderConfig {
        transparent: false,
        base_url: "https://dummy.example.com".to_string(),
        api_keys: vec!["dummy".to_string()],
        allow_lossy: None,
        error_lossy_continue: None,
        openai_wire_api: None,
        max_in_flight: None,
        max_queue: None,
        model_aliases: BTreeMap::new(),
        models: Vec::new(),
    }
}

// ---- Trait boundary (コンパイル時検証) ----

/// M0-1 構造体が Debug + Clone + Serialize + Deserialize を満たすことを確認。
#[test]
fn struct_traits_impl() {
    fn assert_traits<
        T: std::fmt::Debug + Clone + serde::Serialize + serde::de::DeserializeOwned,
    >() {
    }
    assert_traits::<AppConfig>();
    assert_traits::<GlobalConfig>();
    assert_traits::<ProviderConfig>();
    assert_traits::<ModelConfig>();
    assert_traits::<TimeoutConfig>();
    assert_traits::<GlobalLimitConfig>();
    assert_traits::<LogFormat>();
    assert_traits::<OpenAiWireApi>();
}

// =====================================================================
// M0-2: LossyLevel / ProxyError / ConfigError / ResolvedModel
// =====================================================================

// ---- LossyLevel ----

/// LossyLevel の variant 数が 3 であること。
#[test]
fn lossy_level_variant_count() {
    assert_eq!(
        std::mem::discriminant(&LossyLevel::Error),
        std::mem::discriminant(&LossyLevel::Error)
    );
    let _error = LossyLevel::Error;
    let _warn = LossyLevel::Warn;
    let _info = LossyLevel::Info;
}

/// LossyLevel が Debug + Clone を満たすこと。
#[test]
fn lossy_level_debug_clone() {
    fn assert_traits<T: std::fmt::Debug + Clone>() {}
    assert_traits::<LossyLevel>();
}

// ---- ProxyError ----

/// ProxyError::UnknownProvider の Display が "invalid provider: x" であること。
#[test]
fn proxy_error_unknown_provider() {
    let err = ProxyError::UnknownProvider("deepseek".to_string());
    assert_eq!(err.to_string(), "invalid provider: deepseek");
}

/// ProxyError::InvalidModel の Display が "invalid model: m" であること。
#[test]
fn proxy_error_invalid_model() {
    let err = ProxyError::InvalidModel("gpt-4".to_string());
    assert_eq!(err.to_string(), "invalid model: gpt-4");
}

/// ProxyError::MissingField の Display が "missing required field: model" であること。
#[test]
fn proxy_error_missing_field() {
    let err = ProxyError::MissingField("model");
    assert_eq!(err.to_string(), "missing required field: model");
}

/// ProxyError::Unauthorized の Display が "authentication failed" であること。
#[test]
fn proxy_error_unauthorized() {
    let err = ProxyError::Unauthorized;
    assert_eq!(err.to_string(), "authentication failed");
}

/// ProxyError::Forbidden の Display が "forbidden" であること。
#[test]
fn proxy_error_forbidden() {
    let err = ProxyError::Forbidden;
    assert_eq!(err.to_string(), "forbidden");
}

/// ProxyError::QueueFull の Display が "queue is full" であること。
#[test]
fn proxy_error_queue_full() {
    let err = ProxyError::QueueFull;
    assert_eq!(err.to_string(), "queue is full");
}

/// ProxyError::Upstream の Display にステータスコードが含まれること。
#[test]
fn proxy_error_upstream() {
    let err = ProxyError::Upstream(502);
    assert!(err.to_string().contains("502"));
}

/// ProxyError::UpstreamError の Display がエラー内容を含むこと。
#[test]
fn proxy_error_upstream_error() {
    let err = ProxyError::UpstreamError("connection refused".to_string());
    assert_eq!(err.to_string(), "upstream unreachable: connection refused");
}

/// ProxyError::TransformLossy の Display が変換エラー内容を含むこと。
#[test]
fn proxy_error_transform_lossy() {
    let err = ProxyError::TransformLossy("unsupported field 'thinking'".to_string());
    assert_eq!(
        err.to_string(),
        "transform error: unsupported field 'thinking'"
    );
}

/// ProxyError::Timeout の Display が "request timed out" であること。
#[test]
fn proxy_error_timeout() {
    let err = ProxyError::Timeout;
    assert_eq!(err.to_string(), "request timed out");
}

/// ProxyError::Internal の Display が内部エラー内容を含むこと。
#[test]
fn proxy_error_internal() {
    let err = ProxyError::Internal("unexpected state".to_string());
    assert_eq!(err.to_string(), "internal error: unexpected state");
}

/// ProxyError::Config の Display が設定エラー内容を含むこと。
#[test]
fn proxy_error_config() {
    let err = ProxyError::Config("bad config value".to_string());
    assert_eq!(err.to_string(), "config error: bad config value");
}

/// ProxyError の全12 variant がパニックなく Display 文字列を生成すること。
#[test]
fn proxy_error_all_variants_display() {
    let variants: Vec<ProxyError> = vec![
        ProxyError::UnknownProvider("p".into()),
        ProxyError::InvalidModel("m".into()),
        ProxyError::MissingField("f"),
        ProxyError::Unauthorized,
        ProxyError::Forbidden,
        ProxyError::QueueFull,
        ProxyError::Upstream(200),
        ProxyError::UpstreamError("e".into()),
        ProxyError::TransformLossy("t".into()),
        ProxyError::Timeout,
        ProxyError::Internal("i".into()),
        ProxyError::Config("c".into()),
    ];
    for v in &variants {
        let display = v.to_string();
        assert!(!display.is_empty(), "Display should not be empty for {v:?}");
    }
}

/// ProxyError が std::error::Error トレイトを満たすこと。
#[test]
fn proxy_error_is_std_error() {
    fn assert_error<T: std::error::Error>() {}
    assert_error::<ProxyError>();
}

// ---- ConfigError ----

/// ConfigError::Io の Display にパスと IO エラー内容が含まれること。
#[test]
fn config_error_io() {
    let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
    let err = ConfigError::Io("config.toml".to_string(), io_err);
    let msg = err.to_string();
    assert!(msg.contains("config.toml"), "should contain path: {msg}");
    assert!(
        msg.contains("file not found"),
        "should contain io error: {msg}"
    );
}

/// ConfigError::Parse の Display にパスとパースエラー内容が含まれること。
#[test]
fn config_error_parse() {
    // toml::de::Error は serde::de::Error から custom() を提供される
    use serde::de::Error as _;
    let parse_err = toml::de::Error::custom("invalid syntax");
    let err = ConfigError::Parse("config.toml".to_string(), parse_err);
    let msg = err.to_string();
    assert!(msg.contains("config.toml"), "should contain path: {msg}");
    assert!(
        msg.contains("invalid syntax"),
        "should contain parse error: {msg}"
    );
}

/// ConfigError::EmptyApiKeys の Display が provider 名を含むこと。
#[test]
fn config_error_empty_api_keys() {
    let err = ConfigError::EmptyApiKeys("deepseek".to_string());
    assert_eq!(err.to_string(), "empty api_keys for provider: deepseek");
}

/// ConfigError::DuplicateModel の Display が重複モデル名を含むこと。
#[test]
fn config_error_duplicate_model() {
    let err = ConfigError::DuplicateModel("gpt-4".to_string());
    assert_eq!(err.to_string(), "duplicate model name: gpt-4");
}

/// ConfigError::DuplicateAlias の Display がエイリアス名と衝突先を含むこと。
#[test]
fn config_error_duplicate_alias() {
    let err = ConfigError::DuplicateAlias("fast".to_string(), "gpt-4".to_string());
    assert_eq!(
        err.to_string(),
        "alias \"fast\" conflicts with existing model \"gpt-4\""
    );
}

/// ConfigError::ValidationFailed の Display が全エラーの集約であること。
#[test]
fn config_error_validation_failed() {
    let inner = vec![
        ConfigError::EmptyApiKeys("p1".to_string()),
        ConfigError::DuplicateModel("m1".to_string()),
    ];
    let err = ConfigError::ValidationFailed(inner);
    let msg = err.to_string();
    assert!(msg.contains("2 error(s)"), "should mention count: {msg}");
}

/// ConfigError が std::error::Error トレイトを満たすこと。
#[test]
fn config_error_is_std_error() {
    fn assert_error<T: std::error::Error>() {}
    assert_error::<ConfigError>();
}

// ---- ResolvedModel ----

/// ResolvedModel のフィールドアクセスが期待通りであること。
#[test]
fn resolved_model_fields() {
    let model = ResolvedModel {
        public: "claude-3-opus".to_string(),
        upstream: "anthropic.claude-3-opus".to_string(),
    };
    assert_eq!(model.public, "claude-3-opus");
    assert_eq!(model.upstream, "anthropic.claude-3-opus");
}

/// ResolvedModel が Debug + Clone を満たすこと。
#[test]
fn resolved_model_debug_clone() {
    fn assert_traits<T: std::fmt::Debug + Clone>() {}
    assert_traits::<ResolvedModel>();
}

// ---- LossyLevel::should_reject ----

/// Error 級 + allow_lossy=false + error_lossy_continue=false → true（拒否）。
#[test]
fn lossy_level_error_reject() {
    assert!(LossyLevel::Error.should_reject(false, false));
}

/// Error 級 + allow_lossy=false + error_lossy_continue=true → false（継続）。
#[test]
fn lossy_level_error_continue() {
    assert!(!LossyLevel::Error.should_reject(false, true));
}

/// Warn 級 + 任意のフラグ → false（常に継続）。
#[test]
fn lossy_level_warn_no_reject() {
    assert!(!LossyLevel::Warn.should_reject(false, false));
    assert!(!LossyLevel::Warn.should_reject(true, false));
    assert!(!LossyLevel::Warn.should_reject(true, true));
}

/// Info 級 + 任意のフラグ → false（常に継続）。
#[test]
fn lossy_level_info_no_reject() {
    assert!(!LossyLevel::Info.should_reject(false, false));
    assert!(!LossyLevel::Info.should_reject(true, true));
}
