// 構造体・関数は将来のコードから参照されるまで未使用警告を抑止する
#![allow(dead_code)]

use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;

use super::EDITIONS_JSON;
use super::EDITION_SLUG;

/// エディション設定
#[derive(Debug, Clone, Deserialize)]
pub struct EditionConfig {
    pub display_name: String,
    pub slug: String,
    pub identifier: String,
    pub data_dir: String,
    pub repo: String,
    pub icon_path: String,
    pub app_caption: String,
    pub logo_img_src: String,
    pub logo_img_white_src: String,
}

impl EditionConfig {
    /// データディレクトリの絶対パスを返す（例: /Users/kawata/.zasso/zasso）
    pub fn data_dir_path(&self) -> Result<PathBuf, String> {
        let home = dirs::home_dir()
            .ok_or_else(|| "Failed to determine home directory".to_string())?;
        Ok(home.join(&self.data_dir))
    }

    /// データディレクトリが存在しなければ作成する
    pub fn ensure_data_dir(&self) -> Result<(), String> {
        let path = self.data_dir_path()?;
        std::fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create data directory {:?}: {}", path, e))
    }
}

/// 現在のエディション設定を editions.json から取得する
pub fn current_edition() -> Result<EditionConfig, String> {
    let editions: HashMap<String, EditionConfig> = serde_json::from_str(EDITIONS_JSON)
        .map_err(|e| format!("Failed to parse editions.json: {}", e))?;

    editions.get(EDITION_SLUG).cloned().ok_or_else(|| {
        format!(
            "Edition '{}' not found in editions.json",
            EDITION_SLUG
        )
    })
}

/// 起動時に現在のエディションのデータディレクトリを確保する
pub fn ensure_edition_data_dir() -> Result<(), String> {
    let edition = current_edition()?;
    edition.ensure_data_dir()
}

// ──────────────────────────────────────────────
// EDITION_HOME — エディションホームディレクトリの絶対パスをキャッシュする
// ──────────────────────────────────────────────

/// エディションホームディレクトリの絶対パス（OnceLock で遅延初期化）
static EDITION_HOME: OnceLock<PathBuf> = OnceLock::new();

/// setup() フックで EDITION_HOME を初期化する
///
/// editions.json から現在のエディション設定を読み取り、データディレクトリの
/// 絶対パスを OnceLock に設定する。2回目以降の呼び出しはエラーを返す。
pub fn init_edition_home() -> Result<(), String> {
    let path = current_edition()?.data_dir_path()?;
    EDITION_HOME.set(path).map_err(|_| "EDITION_HOME already initialized".to_string())
}

/// エディションホームディレクトリの絶対パスを返す
///
/// 事前に init_edition_home() が setup() フックで呼ばれている必要がある。
/// 未初期化状態では Err を返す。
pub fn edition_home() -> Result<&'static PathBuf, String> {
    EDITION_HOME.get().ok_or_else(|| "EDITION_HOME not initialized".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 正常系: init → edition_home が絶対パスを返す。
    /// 異常系: 二重初期化がエラーになること。
    ///
    /// OnceLock はプロセス全体で共有されるため、テストの並列実行を考慮して
    /// 一つのテスト関数内で正常系と異常系を連続検証する。
    #[test]
    fn test_edition_home_lifecycle() -> Result<(), String> {
        // 正常系: 初回 init は成功する
        assert!(init_edition_home().is_ok(), "first init should succeed");

        let home = edition_home().map_err(|e| e.to_string())?;
        assert!(home.is_absolute(), "edition home should be an absolute path");
        assert!(
            home.ends_with(EDITION_SLUG),
            "edition home should end with the current slug"
        );

        // 異常系: 二重 init はエラーになる
        let err_msg = match init_edition_home() {
            Err(msg) => msg,
            Ok(()) => return Err("second init should have failed".to_string()),
        };
        assert!(
            err_msg.contains("already initialized"),
            "error should mention already initialized"
        );

        Ok(())
    }
}

