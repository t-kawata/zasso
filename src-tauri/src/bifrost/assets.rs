//! ビルド済みbifrostバイナリをOS別にバンドルする
//!
//! 各プラットフォーム向けのbifrost-http圧縮アーカイブをコンパイル時に
//! バイナリに埋め込み、実行時に取り出すためのインターフェースを提供する。

/// 現在バンドルされているbifrostのバージョン
pub(crate) const BIFROST_VERSION: &str = "v1.5.11";

/// 現在のビルドターゲットに対応するbifrost圧縮アーカイブのファイル名
///
/// デバッグログ用。include_bytes! の埋め込みファイル名と一致する。
/// 現時点では Rust コード中から直接参照されていないが、`bundled_archive()`
/// と対をなす定数であり、将来のログ出力のために維持する。
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[allow(dead_code)]
pub(crate) const ARCHIVE_FILENAME: &str = "bifrost-http-darwin-arm64-v1.5.11.tar.gz";

/// 現在のビルドターゲットに対応するbifrost圧縮アーカイブのファイル名
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
#[allow(dead_code)]
pub(crate) const ARCHIVE_FILENAME: &str = "bifrost-http-linux-amd64-v1.5.11.tar.gz";

/// 現在のビルドターゲットに対応するbifrost圧縮アーカイブのファイル名
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
#[allow(dead_code)]
pub(crate) const ARCHIVE_FILENAME: &str = "bifrost-http-windows-amd64-v1.5.11.tar.gz";

/// 現在のビルドターゲットに対応するbifrost圧縮アーカイブのバイト列を返す
///
/// 戻り値は tar.gz 形式の圧縮データ。展開と利用は呼び出し側で行う。
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub(crate) fn bundled_archive() -> &'static [u8] {
    include_bytes!("bifrost-http-darwin-arm64-v1.5.11.tar.gz")
}

/// 現在のビルドターゲットに対応するbifrost圧縮アーカイブのバイト列を返す
///
/// 戻り値は tar.gz 形式の圧縮データ。展開と利用は呼び出し側で行う。
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
pub(crate) fn bundled_archive() -> &'static [u8] {
    include_bytes!("bifrost-http-linux-amd64-v1.5.11.tar.gz")
}

/// 現在のビルドターゲットに対応するbifrost圧縮アーカイブのバイト列を返す
///
/// 戻り値は tar.gz 形式の圧縮データ。展開と利用は呼び出し側で行う。
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
pub(crate) fn bundled_archive() -> &'static [u8] {
    include_bytes!("bifrost-http-windows-amd64-v1.5.11.tar.gz")
}

#[cfg(not(any(
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "linux", target_arch = "x86_64"),
    all(target_os = "windows", target_arch = "x86_64"),
)))]
compile_error!(
    "unsupported target platform for bifrost: expected one of \
     macos-aarch64, linux-x86_64, windows-x86_64"
);
