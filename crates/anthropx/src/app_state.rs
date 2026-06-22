//! # AppState — サーバー実行時状態
//!
//! プロキシサーバーの全実行時状態を保持する構造体。
//! `Arc<AppState>` として全リクエストハンドラで共有される。
//!
//! server feature 有効時のみコンパイルされる。

use std::collections::HashMap;

use tokio_util::sync::CancellationToken;

use crate::config::{AppConfig, ProxyError};
use crate::provider::ProviderClient;

/// プロキシサーバーの実行時状態（RFC §3.1）。
///
/// 起動時に一度だけ構築され、以降は `Arc` で共有される。
/// provider ごとの実行時リソースは `ProviderClient` に集約し、
/// `resolve_provider()` 経由で1回の lookup でアクセスする。
#[cfg(feature = "server")]
#[derive(Debug)]
pub struct AppState {
    /// サーバー設定（不変）
    pub config: AppConfig,
    /// Provider 名 → 実行時リソース束縛（不変）
    pub providers: HashMap<String, ProviderClient>,
    /// サーバー全体のキャンセルトークン（shutdown 時に発火）
    pub cancel: CancellationToken,
}

#[cfg(feature = "server")]
impl AppState {
    /// AppState を構築する。
    ///
    /// # Arguments
    ///
    /// * `config` - サーバー設定
    /// * `providers` - provider 名 → ProviderClient（起動時一括生成）
    /// * `cancel` - サーバー全体のキャンセルトークン（shutdown 時に発火）
    pub fn new(
        config: AppConfig,
        providers: HashMap<String, ProviderClient>,
        cancel: CancellationToken,
    ) -> Self {
        Self {
            config,
            providers,
            cancel,
        }
    }

    /// provider 名から実行時リソースを解決する。
    ///
    /// 存在しない provider 名の場合は `ProxyError::UnknownProvider` を返す。
    pub fn resolve_provider(&self, name: &str) -> Result<&ProviderClient, ProxyError> {
        self.providers
            .get(name)
            .ok_or_else(|| ProxyError::UnknownProvider(name.to_string()))
    }
}
