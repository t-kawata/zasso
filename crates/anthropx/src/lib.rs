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

pub mod config;
pub mod routing;
pub mod util;

// クレート内の全モジュールから共通参照される型を再公開
pub use config::{ConfigError, LogFormat, LossyLevel, OpenAiWireApi, ProxyError, ResolvedModel};
