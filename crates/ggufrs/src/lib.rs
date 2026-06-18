//! # ggufrs — Rust による GGUF モデル推論エンジン
//!
//! mistralrs をバックエンドとして GGUF 形式の量子化言語モデルを推論実行するクレート。
//! 同一プロセス内でライブラリ API（直接推論）と OpenAI/Anthropic 互換 HTTP サーバーの両方を提供し、
//! ロードされたモデルインスタンスはスレッドセーフに共有される。
//!
//! ## モジュール構成
//!
//! - `consts` — 静的定数定義（ポート番号・デフォルトパス・タイムアウト）
//! - `error` — GgufError エラー型
//! - `config` — GgufConfig / ModelConfig / ServerConfig / GpuConfig 設定構造体
//! - `registry` — ModelRegistry モデル一元管理
//! - `inference` — InferenceEngine トレイト定義と実装
//! - `server` — Axum ルーター + OpenAI/Anthropic 互換エンドポイント

// モジュール宣言（以降のチケットで実装を追加する）
pub mod config;
pub mod consts;
pub mod error;

// [::STUB::] M2-1 で InferenceEngine トレイトを実装
pub mod inference;

// [::STUB::] M2-2 で ModelRegistry を実装
pub mod registry;

// [::STUB::] M4-1 で server モジュールを実装
pub mod server;

// [::STUB::] M3-5 で以下の pub use を実際の型に差し替える
// pub use mistralrs::{
//     Model, RequestBuilder, TextMessages, TextMessageRole,
//     Constraint, ChatCompletionResponse,
//     IsqBits,
// };
