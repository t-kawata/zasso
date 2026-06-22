//! # TOML 設定読込
//!
//! `AppConfig::from_toml()` による TOML ファイルからの設定読込。
//! 読込後、自動的に `validate()` を呼び出して設定の整合性を検証する。

use crate::config::{AppConfig, ConfigError};

impl AppConfig {
    /// TOML ファイルから設定を読み込む。
    ///
    /// 1. `std::fs::read_to_string` でファイル内容を読み込み
    /// 2. `toml::from_str` でデシリアライズ
    /// 3. `self.validate()` で設定の整合性を検証
    pub fn from_toml(path: &std::path::Path) -> Result<Self, ConfigError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| ConfigError::Io(path.to_string_lossy().to_string(), e))?;
        let mut config: Self = toml::from_str(&content)
            .map_err(|e| ConfigError::Parse(path.to_string_lossy().to_string(), e))?;
        config.validate().map_err(ConfigError::ValidationFailed)?;
        Ok(config)
    }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use crate::config::*;

    /// 有効な TOML ファイルから設定が読み込めること。
    #[test]
    fn from_toml_valid() {
        let dir = std::env::temp_dir();
        let path = dir.join("anthropx_test_valid.toml");
        let toml_content = r#"
[global]
port = 8088

[providers.test]
transparent = false
base_url = "https://example.com"
api_keys = ["key1"]

[[providers.test.models]]
public = "gpt-4"
upstream = "up-gpt-4"
"#;
        std::fs::write(&path, toml_content).expect("write test config");
        let result = AppConfig::from_toml(&path);
        std::fs::remove_file(&path).ok();
        assert!(
            result.is_ok(),
            "from_toml should succeed: {:?}",
            result.err()
        );
    }

    /// 存在しないファイルパスで ConfigError::Io が返ること。
    #[test]
    fn from_toml_not_found() {
        let path = std::path::Path::new("/tmp/anthropx_nonexistent_XXXXX.toml");
        let result = AppConfig::from_toml(path);
        assert!(matches!(result, Err(ConfigError::Io(_, _))));
    }
}
