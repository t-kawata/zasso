//! # anthropx: LLM Bridge Proxy Server
//!
//! Anthropic 互換 API プロキシサーバー。単一バイナリとして独立稼働するだけでなく、
//! 他の Rust プロジェクトに crate として埋め込んで使用できるデュアルモード構成を採用する。
//!
//! ## モジュール構成
//!
//! - `config`: 設定構造体群（AppConfig, GlobalConfig, ProviderConfig, ModelConfig 等）
//! - `routing`: ルーティング純粋関数（parse_provider_model, resolve_model, resolve_api_format）
//! - `util`: ユーティリティ関数（build_upstream_headers）

pub mod cli;
pub mod config;
pub mod provider;
pub mod routing;
pub mod util;

// server feature が有効な場合のみ HTTP / 可観測性モジュールをコンパイルする
#[cfg(feature = "server")]
pub mod app_state;
#[cfg(feature = "server")]
pub mod http;
#[cfg(feature = "server")]
pub mod observability;

// クレート内の全モジュールから共通参照される型を再公開
//
// AppConfig — 最上位設定構造体
// ConfigError — 設定読み込み・検証エラー
// LogFormat — ログ出力形式（Text / Json）
// LossyLevel — Lossy translation の重大度分類
// OpenAiWireApi — 上流 provider の API ワイヤー形式
// ProxyError — プロキシサーバーの全エラーを表現する単一 enum
// ResolvedModel — model 名解決結果
pub use config::{
    AppConfig, ConfigError, LogFormat, LossyLevel, OpenAiWireApi, ProxyError, ResolvedModel,
};
