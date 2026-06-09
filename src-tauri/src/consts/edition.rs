// 構造体・関数は将来のコードから参照されるまで未使用警告を抑止する
#![allow(dead_code)]

use serde::Deserialize;
use std::collections::HashMap;

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

/// 現在のエディション設定を editions.json から取得する
pub fn current_edition() -> Result<EditionConfig, String> {
    let editions: HashMap<String, EditionConfig> = serde_json::from_str(EDITIONS_JSON)
        .map_err(|e| format!("editions.json のパースに失敗しました: {}", e))?;

    editions.get(EDITION_SLUG).cloned().ok_or_else(|| {
        format!(
            "edition '{slug}' が editions.json に見つかりません",
            slug = EDITION_SLUG
        )
    })
}
