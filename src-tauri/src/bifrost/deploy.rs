//! ビルド済みbifrostバイナリをエディションホームに展開する
//!
//! バンドルされた圧縮アーカイブ（tar.gz）を `EDITION_HOME/bifrost/` に展開する。
//! バージョンマーカー `.version` を用いて再展開の要否を判断する。

use std::path::Path;

use crate::bifrost::assets::{bundled_archive, BIFROST_VERSION};

/// バージョンマーカーファイル名
const VERSION_MARKER: &str = ".version";

/// EDITION_HOME/bifrost/ にbifrostバイナリが展開済みであることを保証する
///
/// # 動作
///
/// 1. `EDITION_HOME/bifrost/` ディレクトリを作成する
/// 2. `.version` ファイルが存在し、内容が `BIFROST_VERSION` と一致すればスキップ
/// 3. 不一致または不在なら、バンドルされた tar.gz を展開する
/// 4. Unix 系OSでは実行権限 (0755) を付与する
/// 5. `.version` に `BIFROST_VERSION` を書き込む
pub(crate) fn ensure_bifrost_binary(home: &Path) -> Result<(), String> {
    let bifrost_dir = home.join("bifrost");
    std::fs::create_dir_all(&bifrost_dir).map_err(|e| {
        format!(
            "Failed to create bifrost directory {:?}: {}",
            bifrost_dir, e
        )
    })?;

    // バージョンマーカーを確認する
    let marker_path = bifrost_dir.join(VERSION_MARKER);
    if marker_path.exists() {
        let current = std::fs::read_to_string(&marker_path).unwrap_or_default();
        if current.trim() == BIFROST_VERSION {
            return Ok(());
        }
    }

    // バンドルされたアーカイブを展開する
    let compressed = bundled_archive();
    let decoder = flate2::read::GzDecoder::new(compressed);
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(&bifrost_dir)
        .map_err(|e| format!("Failed to extract bifrost archive: {}", e))?;

    // Unix 系OSでは実行権限を付与する
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let binary_path = bifrost_dir.join(binary_filename());
        std::fs::set_permissions(&binary_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions on {:?}: {}", binary_path, e))?;
    }

    // バージョンマーカーを書き込む
    std::fs::write(&marker_path, BIFROST_VERSION)
        .map_err(|e| format!("Failed to write version marker: {}", e))?;

    Ok(())
}

/// プラットフォームに応じたbifrost実行ファイル名を返す
fn binary_filename() -> &'static str {
    if cfg!(target_os = "windows") {
        "bifrost-http.exe"
    } else {
        "bifrost-http"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// テスト用の一時ホームディレクトリを作成する
    fn temp_home() -> Result<(tempfile::TempDir, std::path::PathBuf), String> {
        let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
        let path = dir.path().to_path_buf();
        Ok((dir, path))
    }

    /// 初回呼び出しでディレクトリが作成され、バイナリが展開されることを確認する
    #[test]
    fn test_first_deployment_creates_directory_and_extracts() -> Result<(), String> {
        let (_guard, home) = temp_home()?;

        ensure_bifrost_binary(&home)?;

        let bifrost_dir = home.join("bifrost");
        assert!(bifrost_dir.exists(), "bifrost directory should exist");

        let binary = bifrost_dir.join(binary_filename());
        assert!(binary.exists(), "bifrost binary should exist");
        let binary_meta = binary.metadata().map_err(|e| e.to_string())?;
        assert!(binary_meta.len() > 0, "binary should not be empty");

        let marker = bifrost_dir.join(VERSION_MARKER);
        assert!(marker.exists(), "version marker should exist");
        let version = std::fs::read_to_string(&marker).map_err(|e| e.to_string())?;
        assert_eq!(
            version.trim(),
            BIFROST_VERSION,
            "version marker should match"
        );

        Ok(())
    }

    /// バージョンマーカーが一致する場合、展開をスキップすることを確認する
    #[test]
    fn test_deployment_skipped_when_version_matches() -> Result<(), String> {
        let (_guard, home) = temp_home()?;

        // 初回展開（確実に展開される）
        ensure_bifrost_binary(&home)?;
        let binary_path = home.join("bifrost").join(binary_filename());
        let original_meta = binary_path.metadata().map_err(|e| e.to_string())?;
        let original_modified = original_meta.modified().map_err(|e| e.to_string())?;

        // 2回目（マーカー一致 → スキップ）
        ensure_bifrost_binary(&home)?;

        // バイナリのメタデータが変わっていないことを確認
        let after_meta = binary_path.metadata().map_err(|e| e.to_string())?;
        let after_modified = after_meta.modified().map_err(|e| e.to_string())?;
        assert_eq!(
            original_modified, after_modified,
            "binary should not be re-extracted when version matches"
        );

        Ok(())
    }

    /// バージョンマーカーが不一致の場合、再展開されることを確認する
    #[test]
    fn test_deployment_re_extracts_when_version_mismatches() -> Result<(), String> {
        let (_guard, home) = temp_home()?;

        // 初回展開
        ensure_bifrost_binary(&home)?;

        // マーカーを書き換えて古いバージョンを偽装する
        let marker_path = home.join("bifrost").join(VERSION_MARKER);
        std::fs::write(&marker_path, "v0.0.0").map_err(|e| e.to_string())?;

        // もう一度展開（マーカー不一致 → 再展開）
        ensure_bifrost_binary(&home)?;

        // マーカーが最新バージョンに戻っていることを確認
        let version = std::fs::read_to_string(&marker_path).map_err(|e| e.to_string())?;
        assert_eq!(version.trim(), BIFROST_VERSION, "version should be updated");

        Ok(())
    }

    /// ターゲットに応じたバイナリファイル名が返ることを確認する
    #[test]
    fn test_binary_filename_is_platform_specific() {
        let name = binary_filename();
        #[cfg(not(target_os = "windows"))]
        assert_eq!(name, "bifrost-http");
        #[cfg(target_os = "windows")]
        assert_eq!(name, "bifrost-http.exe");
    }
}
