//! # Signal — シグナルハンドリング
//!
//! Unix プラットフォーム固有の SIGTERM ハンドラを提供する。
//! 親プロセスが SIGTERM を受信した際に全子プロセスを GracefulShutdown する。

/// Unix 専用: SIGTERM を受けたら全プロセスを停止して正常終了する。
///
/// `ProcessRegistry` を `Clone` して渡す必要がある。
/// Tauri の `setup()` 内で `tauri::async_runtime::spawn` を使って呼ぶこと。
#[cfg(unix)]
pub fn install_sigterm_handler(registry: crate::registry::ProcessRegistry) {
    use tokio::signal::unix::{signal, SignalKind};

    let mut sigterm = signal(SignalKind::terminate())
        .expect("Failed to install SIGTERM handler");

    tokio::spawn(async move {
        sigterm.recv().await;
        registry.shutdown_all().await;
        std::process::exit(0);
    });
}

#[cfg(test)]
mod tests {
    /// install_sigterm_handler が cfg(unix) でコンパイル可能であることを確認する。
    ///
    /// 実際の SIGTERM 送信テストはランタイムが必要なため M13-1 統合テストで実施。
    #[cfg(unix)]
    #[test]
    fn sigterm_handler_compiles_on_unix() {
        // 型と関数シグネチャが正しいことをコンパイル時に確認
        // （実際の呼び出しには Tokio ランタイムが必要）
        let _ = crate::signal::install_sigterm_handler;
    }
}
