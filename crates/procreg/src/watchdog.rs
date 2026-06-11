//! # Watchdog — 埋め込みバイナリの展開
//!
//! build.rs でコンパイルされた procreg-watchdog バイナリを
//! include_bytes! で埋め込み、実行時に一時ファイルに展開する。
//!
//! # 設計意図
//!
//! - build.rs が rustc 直接呼び出しで watchdog バイナリをコンパイルする
//! - コンパイルされたバイナリは include_bytes! でライブラリに埋め込まれる
//! - 実行時に一時ファイルに展開し、process-registry が起動する
//! - 一時ファイル名に PID を含めることで、並行テスト実行時の競合を防止する

/// Watchdog 一時ファイル展開の最大リトライ回数
///
/// 同一 PID からの create_new 排他ロック衝突時にこの回数だけ再挑戦する。
/// 100回を超える場合はファイルシステムに深刻な問題があると判断し、エラーを返す。
const MAX_EXTRACT_ATTEMPTS: u32 = 100;

/// コンパイル時に埋め込まれた procreg-watchdog バイナリ
///
/// Windows では build.rs が `.exe` 拡張子で出力するため、パスもそれに合わせる。
#[cfg(target_os = "windows")]
pub(crate) static WATCHDOG_BINARY: &[u8] =
    include_bytes!(concat!(env!("PROCREG_OUT_DIR"), "/procreg-watchdog.exe"));

#[cfg(not(target_os = "windows"))]
pub(crate) static WATCHDOG_BINARY: &[u8] =
    include_bytes!(concat!(env!("PROCREG_OUT_DIR"), "/procreg-watchdog"));

/// 埋め込まれた Watchdog バイナリを一時ファイルに展開し、そのパスを返す。
///
/// ファイル名には PID とカウンタを含めることで、並行テスト実行時の
/// 競合を防止する。
///
/// # エラー
///
/// - ファイル書き込みに失敗した場合
/// - Unix で実行権限の付与に失敗した場合
pub(crate) fn extract_watchdog() -> Result<std::path::PathBuf, String> {
    let dir = std::env::temp_dir();
    let pid = std::process::id();
    let mut attempt = 0u32;

    loop {
        let path = dir.join(format!("procreg-watchdog-{pid}-{attempt}"));

        // ファイルが存在しない場合のみ書き込む（競合防止のための楽観的排他）
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut file) => {
                use std::io::Write;
                // create_new で作成したファイルに直接書き込む
                file.write_all(WATCHDOG_BINARY)
                    .map_err(|e| format!("Failed to write watchdog binary: {e}"))?;
                drop(file);

                // Unix 系OSでは実行権限を付与する
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
                        .map_err(|e| format!("Failed to set watchdog permissions: {e}"))?;
                }

                // デバッグ情報: 展開先パスを出力（テスト時のトラブルシューティング用）
                log::info!("[watchdog] Extracted to: {}", path.display());

                return Ok(path);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                attempt += 1;
                if attempt > MAX_EXTRACT_ATTEMPTS {
                    return Err(format!(
                        "Failed to create unique watchdog temp file after {MAX_EXTRACT_ATTEMPTS} attempts"
                    ));
                }
                continue;
            }
            Err(e) => {
                return Err(format!("Failed to create watchdog temp file: {e}"));
            }
        }
    }
}
