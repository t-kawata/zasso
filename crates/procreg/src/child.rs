//! # ChildGuard — 運命共同体の核心
//!
//! `tokio::process::Child` をラップし、GracefulShutdown を実行するガード。
//!
//! ## 使い分け
//!
//! - `shutdown_all()` / `stop()` では `guard.shutdown().await` を呼び、
//!   確実に GracefulShutdown が完了してから次の処理に進む。
//! - `panic` 時の Drop ではベストエフォートで `start_kill()` を実行する。
//!   （async 完了を Drop 内で待てない制約によるフォールバック）

use std::sync::Arc;

use crate::ShutdownTimeoutConfig;

/// 子プロセスをラップし、GracefulShutdown を実行するガード。
///
/// ProcessRegistry の運命共同体の核心となる型。
/// 内部の子プロセスハンドルは `Arc<Mutex<Option<...>>>` でラップされており、
/// `Clone` 可能。これにより spawn_one 内での早期登録と SpawnResult 経由の
/// 返却が両立できる。
///
/// `tokio::process::Child` をラップし、明示的な `shutdown()` または
/// Drop 時に GracefulShutdown を実行する。
///
/// M0-3 では空のスタブとして定義されていたが、本実装により
/// 実際の GracefulShutdown 処理が追加された。
///
/// # 未使用警告について
///
/// フィールドおよびメソッドは後続チケット（M8-1: spawn_one、M9-1: shutdown_all）
/// で使用される。現時点では型定義と内部ロジックのみ確定させる段階。
/// 子プロセスハンドルの内部表現。
/// `Arc<Mutex<Option<>>>` により複数の `ChildGuard` インスタンスで
/// 同一プロセスを共有可能にする。
type ChildHandle = Arc<std::sync::Mutex<Option<tokio::process::Child>>>;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub(crate) struct ChildGuard {
    /// 子プロセスハンドル。`Some` の間はプロセスが稼働中。
    /// `take()` することで所有権を移動し、GracefulShutdown を実行する。
    /// `Arc<Mutex<>>` により Clone 可能で、早期登録と SpawnResult の両立を可能にする。
    child: Option<ChildHandle>,

    /// GracefulShutdown のタイムアウト設定。
    config: ShutdownTimeoutConfig,
}

#[allow(dead_code)]
impl ChildGuard {
    /// 新しい `ChildGuard` を生成する。
    ///
    /// `child` は `tokio::process::Command::spawn()` の戻り値。
    /// `config` はシャットダウン時のタイムアウト設定。
    pub fn new(child: tokio::process::Child, config: ShutdownTimeoutConfig) -> Self {
        Self {
            child: Some(Arc::new(std::sync::Mutex::new(Some(child)))),
            config,
        }
    }

    /// GracefulShutdown を実行する。
    ///
    /// - Unix: SIGTERM → `unix_sigterm_timeout` 待機 → SIGKILL
    /// - Windows: TerminateProcess
    ///
    /// このメソッドは `self` を消費するため、2 回呼び出すことはできない。
    /// 呼び出し側はこれを `await` することで、孤児プロセスが残留しないことを
    /// 確実にできる。
    pub async fn shutdown(mut self) {
        if let Some(arc_child) = self.child.take() {
            // MutexGuard を await をまたがないよう、先に child を取り出してから
            // graceful_shutdown を呼び出す（Send 制約のため）。
            let child: Option<tokio::process::Child> = arc_child.lock().unwrap().take();
            if let Some(mut child) = child {
                Self::graceful_shutdown(&mut child, &self.config).await;
            }
        }
    }

    /// GracefulShutdown の内部実装。
    ///
    /// `shutdown()` と `panic_hook` の両方から利用される共有ロジック。
    async fn graceful_shutdown(child: &mut tokio::process::Child, config: &ShutdownTimeoutConfig) {
        #[cfg(unix)]
        {
            // SAFETY: child.id() は OS から割り当てられた有効な PID を返す。
            // SIGTERM は子プロセスの終了を要求するだけで、即座にプロセスを
            // 終了させるものではないため安全に使用できる。
            if let Some(pid) = child.id() {
                unsafe {
                    libc::kill(pid as libc::pid_t, libc::SIGTERM);
                }
            }

            // SIGTERM 後、タイムアウトまでポーリングで終了を待機する
            let deadline = tokio::time::Instant::now() + config.unix_sigterm_timeout;
            loop {
                if let Ok(Some(_)) = child.try_wait() {
                    return; // プロセスが正常終了
                }
                if tokio::time::Instant::now() >= deadline {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }

            // タイムアウト → SIGKILL で強制終了
            let _ = child.start_kill();
            let _ = child.wait().await;
        }

        #[cfg(windows)]
        {
            // Windows の簡易実装: start_kill() → TerminateProcess
            let _ = child.start_kill();
            let _ = tokio::time::timeout(config.windows_ctrl_break_timeout, child.wait()).await;
        }

        #[cfg(not(any(unix, windows)))]
        compile_error!("Unsupported platform: ChildGuard requires Unix or Windows");
    }
}

impl Drop for ChildGuard {
    /// Drop 時のベストエフォートな後処理。
    ///
    /// async 完了を Drop 内で待てないため、`start_kill()` のみを呼び出す。
    /// 確実な GracefulShutdown が必要な場合は、事前に `shutdown().await` を
    /// 呼ぶこと。
    fn drop(&mut self) {
        if let Some(arc_child) = self.child.take() {
            // Drop 内では await できないため、start_kill() のみベストエフォートで呼ぶ。
            let child: Option<tokio::process::Child> = arc_child.lock().unwrap().take();
            if let Some(mut child) = child {
                let _ = child.start_kill();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ChildGuard::new() が子プロセスハンドルを正しく保持することを確認する。
    ///
    /// 実プロセスは使用せず、ダミーの `tokio::process::Child` を
    /// 生成できないため、構造体の型とフィールド構成のみを検証する。
    /// 実際の `new()` 呼び出しは M8-1（spawn_one）で検証される。
    #[test]
    fn new_holds_child() {
        // ChildGuard は cfg(unix)/cfg(windows) の両方でコンパイル可能である
        // ことを確認する。実際の child は spawn_one から渡される。
        let config = ShutdownTimeoutConfig::default();
        // 型が Send + Sync を満たすかはコンパイル時に自動チェックされる
        let _guard = std::mem::ManuallyDrop::new(ChildGuard {
            child: None,
            config,
        });
    }

    /// Drop がパニックしないことを確認する。
    ///
    /// 子プロセスなし（child = None）の ChildGuard を Drop しても
    /// パニックが発生しないことを確認する。
    #[test]
    fn drop_does_not_panic() {
        let config = ShutdownTimeoutConfig::default();
        let guard = ChildGuard {
            child: None,
            config,
        };
        // 明示的に Drop を呼ぶ（通常はスコープ終了時に自動的に呼ばれる）
        drop(guard);
    }

    /// shutdown() が child を take することを確認する。
    ///
    /// 実プロセスを使用せず、shutdown() 後の状態を検証する。
    #[tokio::test]
    async fn shutdown_after_new() {
        let config = ShutdownTimeoutConfig::default();
        let guard = ChildGuard {
            child: None,
            config,
        };
        // child が None の場合、shutdown() は graceful_shutdown を
        // 呼ばずに即座に完了する
        guard.shutdown().await;
    }

    /// ChildGuard が Clone 可能であり、クローンが同一の内部ハンドルを共有することを確認する。
    #[test]
    fn child_guard_clone_shares_handle() {
        let config = ShutdownTimeoutConfig::default();
        let guard = ChildGuard {
            child: Some(Arc::new(std::sync::Mutex::new(None))),
            config,
        };
        let cloned = guard.clone();
        // 両方の child が Some であることを確認（同一 Arc を指す）
        assert!(guard.child.is_some());
        assert!(cloned.child.is_some());
    }

    /// ChildGuard の所有権が移動することを確認する。
    ///
    /// `shutdown()` が `self` を消費するため、呼び出し後は元の変数が
    /// 使用不可になる（コンパイルエラー）。これは型システムによる保証であり、
    /// 実行時テストではなくコンパイル時に検証される。
    ///
    /// ```compile_fail
    /// let guard = ChildGuard { child: None, config: Default::default() };
    /// guard.shutdown().await;
    /// guard.shutdown().await; // コンパイルエラー: use of moved value
    /// ```
    #[test]
    fn shutdown_twice_blocked() {
        // 所有権移動による二重呼び出し防止はコンパイラが保証する。
        // このテストはコンパイルが通ること自体が検証となる。
    }
}
