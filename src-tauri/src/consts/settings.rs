// src-tauri/src/consts/settings.rs
// アプリケーション全体で共有される設定定数
//
// このファイルの一部の定数は Rust コード中では直接参照されないが、
// scripts/sync-version.mjs が読み取る Frontend Source of Truth として
// 存在する。それらには #[allow(dead_code)] を付与し、
// 警告がノイズにならないようにしている。
//
// SOT（Source of Truth）:
//   - APP_VERSION: sync-version.mjs が fe/package.json, tauri.conf.json 等に反映
//   - APP_DISPLAY_NAME, APP_IDENTIFIER, APP_SLUG: 同上
//   - WINDOW_WIDTH_*, WINDOW_HEIGHT_*: fe/src/configs/settings.ts に同期
//
// Cargo.toml のバージョンは 0.0.0 固定のダミーであり参照してはならない。

/// アプリケーションバージョン（セマンティックバージョニング）
/// sync-version.mjs が読み取る SOT（Rust 未参照）
#[allow(dead_code)]
pub(crate) const APP_VERSION: &str = "v0.24.276";

/// アプリケーション表示名
/// sync-version.mjs が読み取る SOT（Rust 未参照）
#[allow(dead_code)]
pub(crate) const APP_DISPLAY_NAME: &str = "zasso";

/// アプリケーション識別子（バンドルID）
/// sync-version.mjs が読み取る SOT（Rust 未参照）
#[allow(dead_code)]
pub(crate) const APP_IDENTIFIER: &str = "com.t-kawata.zasso";

/// アプリケーションスラッグ
/// sync-version.mjs が読み取る SOT（Rust 未参照）
#[allow(dead_code)]
pub(crate) const APP_SLUG: &str = "zasso";

// ──────────────────────────────────────────────
// ウィンドウサイズ設定
// fe/src/configs/settings.ts にも同期される（sync-version.mjs）
// ──────────────────────────────────────────────

/// ウィンドウ折りたたみ時の幅（CSSピクセル）— 初期状態
/// fe/src/configs/settings.ts に同期される SOT（Rust 未参照）
#[allow(dead_code)]
pub(crate) const WINDOW_WIDTH_COLLAPSED: u16 = 160;

/// ウィンドウ折りたたみ時の高さ（CSSピクセル）— 初期状態
/// fe/src/configs/settings.ts に同期される SOT（Rust 未参照）
#[allow(dead_code)]
pub(crate) const WINDOW_HEIGHT_COLLAPSED: u16 = 185;

/// ウィンドウ展開時の幅（CSSピクセル）
/// fe/src/configs/settings.ts に同期される SOT（Rust 未参照）
#[allow(dead_code)]
pub(crate) const WINDOW_WIDTH_EXPANDED: u16 = 400;

/// ウィンドウ展開時の高さ（CSSピクセル）
/// fe/src/configs/settings.ts に同期される SOT（Rust 未参照）
#[allow(dead_code)]
pub(crate) const WINDOW_HEIGHT_EXPANDED: u16 = 760;

// ──────────────────────────────────────────────
// ポート番号設定
// プロジェクト全体で統一されたポート割り当ては CLAUDE.md を参照
// ──────────────────────────────────────────────

/// Bifrost LLM Proxy がリッスンする TCP ポート
pub(crate) const BIFROST_PORT: u16 = 3912;

/// 全サイドカーの非同期起動完了を待機する全体タイムアウト（秒）
///
/// 個別の wait_ready タイムアウト（bifrost は 10秒）とは独立して設定される。
/// 全プロセス起動完了をこの時間内に確認できない場合、アプリは終了する。
pub(crate) const SIDECAR_STARTUP_TIMEOUT_SECS: u64 = 30;
