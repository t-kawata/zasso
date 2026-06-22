//! # Provider モジュール
//!
//! Provider ごとの並行性制御・リクエスト実行を担当する。
//! 透過中継（transparent）とプロトコル変換（translate）の 2 モードを提供する。

pub mod limiter;

#[cfg(feature = "server")]
pub mod translate;
#[cfg(feature = "server")]
pub mod transparent;

#[cfg(feature = "server")]
use crate::config::ProviderConfig;
#[cfg(feature = "server")]
use crate::provider::limiter::ConcurrencyLimiter;
#[cfg(feature = "server")]
use crate::routing::scheduler::KeyScheduler;

/// Provider ごとの実行時リソースを束ねる単一構造体（RFC §4）。
///
/// config / http_client / scheduler / limiter の4要素を1つの HashMap エントリに
/// 統合することで、各ハンドラでの lookup を1回に削減する。
///
/// # 生成
///
/// `lifecycle::build_provider_clients()` によって起動時に一括生成される。
/// 設定値は `AppConfig` から clone されるが、起動後に変更されないため
/// コストは無視できる。
#[cfg(feature = "server")]
#[derive(Debug)]
pub struct ProviderClient {
    /// Provider 設定（AppConfig.providers から clone）
    pub config: ProviderConfig,
    /// Provider 専用の HTTP クライアント
    pub http_client: reqwest::Client,
    /// API key ラウンドロビンスケジューラ
    pub scheduler: KeyScheduler,
    /// 並行性制限器（Semaphore-based backpressure）
    pub limiter: ConcurrencyLimiter,
}
