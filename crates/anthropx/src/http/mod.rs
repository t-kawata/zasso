//! # HTTP サーバーモジュール
//!
//! Axum Router の組立と HTTP エラーハンドリング、ルートハンドラを提供する。
//! server feature 有効時のみコンパイルされる。
//!
//! サブモジュール:
//! - `auth`: クライアント認証 + upstream 認証の Tower middleware
//! - `errors`: ProxyError → IntoResponse 変換
//! - `router`: Axum Router 組立（build_router）
//! - `routes`: エンドポイントハンドラ

pub mod auth;
pub mod errors;
pub mod router;
pub mod routes;

// build_router は router.rs に、各ハンドラは routes.rs に、
// エラー変換は errors.rs に実装されている。
// 本ファイルはサブモジュールの宣言と公開のみを行う。
