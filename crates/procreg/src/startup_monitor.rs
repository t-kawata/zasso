//! # StartupMonitor — 非同期起動モードの完了監視
//!
//! `ProcessRegistry::start_all_async()` が返す monitor オブジェクト。
//! 全子プロセスの初回起動完了を非同期で待機するためのインターフェースを提供する。

use std::collections::HashMap;
use std::sync::Arc;

use crate::error::RegistryError;
use crate::state::ProcessState;

/// 監視対象の内部状態。
#[derive(Debug)]
enum MonitorState {
    /// 起動進行中。Vec は全プロセス名。
    #[allow(dead_code)]
    InProgress(Vec<String>),
    /// 全プロセス起動完了。スナップショットを保持。
    Completed(HashMap<String, ProcessState>),
    /// 起動失敗。エラー詳細を保持。
    Failed(RegistryError),
}

/// 非同期起動モードにおける全サイドカーの起動完了を監視する。
///
/// `ProcessRegistry::start_all_async()` の戻り値として取得する。
/// このオブジェクトは起動が完了したかどうかの1回限りの通知と、
/// 途中経過のスナップショット取得を提供する。
///
/// # ライフサイクル
///
/// 1. `start_all_async` が monitor を返す（即座）
/// 2. バックグラウンドで全プロセスの起動が進行する
/// 3. 利用者は `wait_for_all()` で完了を await する
/// 4. 全プロセスが Running になるか、タイムアウトで完了する
/// 5. 以降、プロセス監視は従来の watch_loop に完全に委譲される
#[derive(Debug, Clone)]
pub struct StartupMonitor {
    /// 内部状態（`Arc<Mutex>` により Clone 可能に）。
    state: Arc<std::sync::Mutex<MonitorState>>,
    /// 状態変更を通知する Notify。
    notify: Arc<tokio::sync::Notify>,
}

impl StartupMonitor {
    /// `StartupMonitor` を生成する（`pub(crate)` — レジストリ内からのみ生成可能）。
    pub(crate) fn new(process_names: Vec<String>) -> Self {
        Self {
            state: Arc::new(std::sync::Mutex::new(MonitorState::InProgress(
                process_names,
            ))),
            notify: Arc::new(tokio::sync::Notify::new()),
        }
    }

    /// 起動完了を内部状態に設定する（レジストリからのみ呼び出される）。
    pub(crate) fn set_completed(&self, snapshot: HashMap<String, ProcessState>) {
        {
            let mut guard = self.state.lock().unwrap();
            *guard = MonitorState::Completed(snapshot);
        }
        self.notify.notify_waiters();
    }

    /// 起動失敗を内部状態に設定する（レジストリからのみ呼び出される）。
    pub(crate) fn set_failed(&self, error: RegistryError) {
        {
            let mut guard = self.state.lock().unwrap();
            *guard = MonitorState::Failed(error);
        }
        self.notify.notify_waiters();
    }

    /// 全プロセスの初回起動が完了するのを待機する。
    ///
    /// # 戻り値
    ///
    /// - `Ok(snapshot)`: 全プロセスが正常に Running 状態に達した。
    ///   スナップショットには起動時点の各プロセス状態が含まれる。
    /// - `Err(RegistryError::StartupTimeout)`: タイムアウトが発生した。
    ///   一部のプロセスは Running 状態だが、全プロセスは揃っていない。
    /// - `Err(RegistryError::SpawnCancelled)`: 起動中にキャンセルされた。
    pub async fn wait_for_all(&self) -> Result<HashMap<String, ProcessState>, RegistryError> {
        loop {
            // `notified()` future を先に作成する（これにより、ロック解放〜await の間に
            // 通知が発生しても取りこぼさない）。
            let notified = self.notify.notified();

            // 現在の状態を確認する（ロック獲得は一時的）
            let should_wait = {
                let guard = self.state.lock().unwrap();
                match &*guard {
                    MonitorState::Completed(snapshot) => {
                        return Ok(snapshot.clone());
                    }
                    MonitorState::Failed(err) => {
                        return Err(Self::clone_error(err));
                    }
                    MonitorState::InProgress(_) => true,
                }
            };

            if should_wait {
                notified.await;
            }
        }
    }

    /// RegistryError をクローンする（内部に Clone 非対応のフィールドがあるため）。
    fn clone_error(err: &RegistryError) -> RegistryError {
        match err {
            RegistryError::StartupTimeout {
                ready,
                pending,
                timeout,
            } => RegistryError::StartupTimeout {
                ready: ready.clone(),
                pending: pending.clone(),
                timeout: *timeout,
            },
            RegistryError::SpawnCancelled { name } => {
                RegistryError::SpawnCancelled { name: name.clone() }
            }
            other => RegistryError::SpawnCancelled {
                name: other.to_string(),
            },
        }
    }

    /// 起動が完了しているかどうかを確認する（非ブロッキング）。
    pub fn is_complete(&self) -> bool {
        let guard = self.state.lock().unwrap();
        matches!(*guard, MonitorState::Completed(_) | MonitorState::Failed(_))
    }

    /// 現在の各プロセスの状態スナップショットを取得する（非ブロッキング）。
    ///
    /// 通常の `ProcessRegistry::snapshot()` と異なり、起動中のみの
    /// 経過確認を目的とする。起動完了後は registry の snapshot を使用すること。
    ///
    /// # 戻り値
    ///
    /// 起動中の状態。プロセスが1つも起動していない場合は空のマップを返す。
    pub fn snapshot_blocking(&self) -> HashMap<String, ProcessState> {
        let guard = self.state.lock().unwrap();
        match &*guard {
            MonitorState::Completed(snap) => snap.clone(),
            MonitorState::Failed(_) => HashMap::new(),
            MonitorState::InProgress(_) => HashMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ProcessState;
    use std::time::Duration;

    /// テスト用の完了済みモニターを構築する。
    fn make_completed(snapshot: HashMap<String, ProcessState>) -> StartupMonitor {
        let monitor = StartupMonitor::new(vec![]);
        monitor.set_completed(snapshot);
        monitor
    }

    /// テスト用の失敗モニターを構築する。
    fn make_failed(err: RegistryError) -> StartupMonitor {
        let monitor = StartupMonitor::new(vec![]);
        monitor.set_failed(err);
        monitor
    }

    /// 空の定義リストで即座に complete することを確認する。
    #[tokio::test]
    async fn empty_defs_completes_immediately() {
        let snapshot = HashMap::new();
        let monitor = make_completed(snapshot.clone());
        let result = monitor.wait_for_all().await;
        assert!(result.is_ok(), "empty defs should complete immediately");
        assert!(result.unwrap().is_empty());
    }

    /// 単一プロセス起動完了を通知できることを確認する。
    #[tokio::test]
    async fn single_process_startup() {
        let mut snapshot = HashMap::new();
        snapshot.insert("bifrost".to_string(), ProcessState::Running { pid: 100 });
        let monitor = make_completed(snapshot.clone());
        let result = monitor.wait_for_all().await;
        assert!(result.is_ok(), "single process should complete");
        let state = result.unwrap();
        assert_eq!(state.len(), 1);
        assert!(matches!(
            state.get("bifrost"),
            Some(ProcessState::Running { .. })
        ));
    }

    /// 複数プロセスが全件完了することを確認する。
    #[tokio::test]
    async fn multiple_processes_all_ready() {
        let mut snapshot = HashMap::new();
        snapshot.insert("svc_a".to_string(), ProcessState::Running { pid: 100 });
        snapshot.insert("svc_b".to_string(), ProcessState::Running { pid: 101 });
        snapshot.insert("svc_c".to_string(), ProcessState::Running { pid: 102 });
        let monitor = make_completed(snapshot.clone());
        let result = monitor.wait_for_all().await;
        assert!(result.is_ok(), "all processes should complete");
        assert_eq!(result.unwrap().len(), 3);
    }

    /// タイムアウトエラーが通知されることを確認する。
    #[tokio::test]
    async fn multiple_processes_with_timeout() {
        use std::collections::HashMap;
        let mut ready = HashMap::new();
        ready.insert("svc_a".to_string(), ProcessState::Running { pid: 100 });
        let err = RegistryError::StartupTimeout {
            ready,
            pending: vec!["svc_b".to_string()],
            timeout: Duration::from_secs(10),
        };
        let monitor = make_failed(err);
        let result = monitor.wait_for_all().await;
        assert!(result.is_err(), "timeout should return error");
        match result.unwrap_err() {
            RegistryError::StartupTimeout { pending, .. } => {
                assert_eq!(pending, vec!["svc_b"]);
            }
            other => panic!("Expected StartupTimeout, got {other:?}"),
        }
    }

    /// 起動中のスナップショットが正しいことを確認する。
    #[test]
    fn snapshot_during_startup() {
        let monitor = StartupMonitor::new(vec!["svc_a".to_string(), "svc_b".to_string()]);
        // 起動中（InProgress）は空のスナップショット
        let snap = monitor.snapshot_blocking();
        assert!(snap.is_empty());

        // 完了後はスナップショットが取得できる
        let mut snapshot = HashMap::new();
        snapshot.insert("svc_a".to_string(), ProcessState::Running { pid: 100 });
        snapshot.insert("svc_b".to_string(), ProcessState::Starting);
        monitor.set_completed(snapshot.clone());
        let snap = monitor.snapshot_blocking();
        assert_eq!(snap.len(), 2);
        assert!(matches!(
            snap.get("svc_a"),
            Some(ProcessState::Running { .. })
        ));
    }

    /// 起動完了前後での `is_complete()` の変化を確認する。
    #[test]
    fn is_complete_behavior() {
        let monitor = StartupMonitor::new(vec!["svc_a".to_string()]);

        // 起動中は is_complete() == false
        assert!(!monitor.is_complete());

        // 完了を通知
        monitor.set_completed(HashMap::new());

        // 完了後は is_complete() == true
        assert!(monitor.is_complete());
    }

    /// キャンセルエラーが伝播されることを確認する。
    #[tokio::test]
    async fn cancel_propagates_to_pending() {
        let err = RegistryError::SpawnCancelled {
            name: "svc_b".to_string(),
        };
        let monitor = make_failed(err);
        let result = monitor.wait_for_all().await;
        assert!(result.is_err(), "cancel should return error");
        match result.unwrap_err() {
            RegistryError::SpawnCancelled { name } => {
                assert_eq!(name, "svc_b");
            }
            other => panic!("Expected SpawnCancelled, got {other:?}"),
        }
    }

    /// 既に Running のプロセスはキャンセルの影響を受けないことを確認する。
    #[tokio::test]
    async fn cancel_does_not_affect_running() {
        let mut snapshot = HashMap::new();
        snapshot.insert("svc_a".to_string(), ProcessState::Running { pid: 100 });
        let err = RegistryError::SpawnCancelled {
            name: "svc_b".to_string(),
        };
        let monitor = make_failed(err);
        let result = monitor.wait_for_all().await;
        assert!(result.is_err(), "partial failure should return error");
    }

    /// wait_for_all が InProgress 状態から Completed への遷移を正しく待機することを確認する。
    #[tokio::test]
    async fn wait_for_all_awaits_completion() {
        let monitor = StartupMonitor::new(vec!["svc".to_string()]);

        // 別タスクで非同期的に完了を通知
        let monitor_clone = monitor.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            let mut snapshot = HashMap::new();
            snapshot.insert("svc".to_string(), ProcessState::Running { pid: 42 });
            monitor_clone.set_completed(snapshot);
        });

        // 完了を待機（50ms の遅延があるがタイムアウトしないこと）
        let result =
            tokio::time::timeout(std::time::Duration::from_secs(5), monitor.wait_for_all())
                .await
                .expect("wait_for_all should complete before timeout");
        assert!(result.is_ok());
        let snap = result.unwrap();
        assert_eq!(snap.len(), 1);
    }
}
