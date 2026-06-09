// src-tauri/src/consts/settings.rs
// アプリケーション全体で共有される設定定数
//
// このファイルの APP_VERSION がバージョンの唯一の情報源（Source of Truth）である。
// ビルド前に scripts/sync-version.mjs が自動的に以下へ反映する：
//   - src-tauri/tauri.conf.json
//   - fe/package.json
//   - fe/src/configs/settings.ts
//
// Cargo.toml のバージョンは 0.0.0 固定のダミーであり参照してはならない。

/// アプリケーションバージョン（セマンティックバージョニング）
pub(crate) const APP_VERSION: &str = "v0.24.241";

/// アプリケーション表示名
pub(crate) const APP_DISPLAY_NAME: &str = "zasso";

/// アプリケーション識別子（バンドルID）
pub(crate) const APP_IDENTIFIER: &str = "com.t-kawata.zasso";

/// アプリケーションスラッグ
pub(crate) const APP_SLUG: &str = "zasso";

// ──────────────────────────────────────────────
// ウィンドウサイズ設定
// fe/src/configs/settings.ts にも同期される（sync-version.mjs）
// ──────────────────────────────────────────────

/// ウィンドウ折りたたみ時の幅（CSSピクセル）— 初期状態
pub(crate) const WINDOW_WIDTH_COLLAPSED: u16 = 160;

/// ウィンドウ折りたたみ時の高さ（CSSピクセル）— 初期状態
pub(crate) const WINDOW_HEIGHT_COLLAPSED: u16 = 185;

/// ウィンドウ展開時の幅（CSSピクセル）
pub(crate) const WINDOW_WIDTH_EXPANDED: u16 = 400;

/// ウィンドウ展開時の高さ（CSSピクセル）
pub(crate) const WINDOW_HEIGHT_EXPANDED: u16 = 760;
