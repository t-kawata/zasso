//! # AppState — サーバー実行時状態
//!
//! プロキシサーバーの全実行時状態を保持する構造体。
//! `Arc<AppState>` として全リクエストハンドラで共有される。
//!
//! server feature 有効時のみコンパイルされる。

use std::collections::HashMap;

use crate::config::AppConfig;
use crate::provider::limiter::ConcurrencyLimiter;
use crate::routing::scheduler::KeyScheduler;

/// プロキシサーバーの実行時状態（RFC §3.1）。
///
/// 起動時に一度だけ構築され、以降は `Arc` で共有される。
/// 全フィールドはイミュータブルな参照として公開されることを前提とし、
/// 内部で可変性が必要な場合は interior mutability パターンを使用する。
#[cfg(feature = "server")]
pub struct AppState {
    /// サーバー設定（不変）
    pub config: AppConfig,
    /// Provider ごとの HTTP クライアント（起動時一括生成）
    pub http_clients: HashMap<String, reqwest::Client>,
    /// Provider ごとの API key スケジューラ
    pub schedulers: HashMap<String, KeyScheduler>,
    /// Provider ごとの並行性制限器
    pub limiters: HashMap<String, ConcurrencyLimiter>,
}

#[cfg(feature = "server")]
impl AppState {
    /// AppState を構築する。
    ///
    /// 全フィールドは呼び出し元から注入される。
    /// # Arguments
    ///
    /// * `config` - サーバー設定
    /// * `http_clients` - provider 名 → HTTP クライアント
    /// * `schedulers` - provider 名 → key scheduler
    /// * `limiters` - provider 名 → concurrency limiter
    pub fn new(
        config: AppConfig,
        http_clients: HashMap<String, reqwest::Client>,
        schedulers: HashMap<String, KeyScheduler>,
        limiters: HashMap<String, ConcurrencyLimiter>,
    ) -> Self {
        Self {
            config,
            http_clients,
            schedulers,
            limiters,
        }
    }
}
