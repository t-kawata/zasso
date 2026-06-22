//! # anthropx — LLM Bridge Proxy Server（バイナリエントリポイント）
//!
//! 起動シーケンス: CLI parse → Config load → Server start → Graceful shutdown

#![cfg(feature = "server")]

use anthropx::cli;
use anthropx::config::AppConfig;
use anthropx::lifecycle::ProxyServer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. CLI 引数を解析
    let cli = cli::parse_args();

    // 2. 設定ファイルを読み込み
    let config = AppConfig::from_toml(&cli.config)?;

    // 3. tracing subscriber を初期化（log_format に従う）
    match config.global.log_format {
        anthropx::LogFormat::Json => {
            tracing_subscriber::fmt()
                .event_format(tracing_subscriber::fmt::format::json())
                .init();
        }
        anthropx::LogFormat::Text => {
            tracing_subscriber::fmt().init();
        }
    }

    // 4. サーバー起動
    let handle = ProxyServer::start(config).await?;

    // 5. Ctrl+C シグナル待機
    tokio::signal::ctrl_c().await?;
    tracing::info!("shutdown signal received, starting graceful shutdown");

    // 6. Graceful shutdown
    handle.shutdown().await;
    tracing::info!("server stopped");

    Ok(())
}
