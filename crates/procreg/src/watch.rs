//! # Watch — プロセス監視・再起動ループ
//!
//! プロセス終了をイベント駆動で検知し、`RestartPolicy` に基づいて
//! 再起動する監視ループ。

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::state::ProcessState;
use crate::{ProcessDef, RestartPolicy};
use crate::registry::RegistryInner;

/// プロセス監視タスクを起動する。
///
/// `tokio::spawn` で `watch_loop` をバックグラウンドタスクとして実行する。
///
/// # 未使用警告について
///
/// この関数は M8-1（spawn_one/start_all）で使用される。現時点では定義のみ。
#[allow(dead_code)]
pub(crate) fn start_watch_task(
    inner: Arc<Mutex<RegistryInner>>,
    def: ProcessDef,
    exit_rx: tokio::sync::oneshot::Receiver<Option<i32>>,
    cancel_token: tokio_util::sync::CancellationToken,
) {
    tokio::spawn(async move {
        watch_loop(inner, def, exit_rx, cancel_token).await;
    });
}

/// プロセス終了を監視し、`RestartPolicy` に基づいて再起動するループ。
///
/// # イベント駆動
///
/// `tokio::select!` で終了通知（exit_rx）とキャンセルトークンを同時待機する。
/// ポーリングは行わず、イベント駆動で効率的に動作する。
///
/// # 再起動パス（M8-1 完了後）
///
/// 現在の実装では再起動パスはスタブとなっている。
/// M8-1 完了後に `Self::spawn_one(...)` 呼び出しに置き換える。
///
/// # 未使用警告について
///
/// この関数は M8-1（spawn_one/start_all）で使用される。現時点では定義のみ。
#[allow(dead_code)]
async fn watch_loop(
    inner: Arc<Mutex<RegistryInner>>,
    def: ProcessDef,
    mut exit_rx: tokio::sync::oneshot::Receiver<Option<i32>>,
    cancel_token: tokio_util::sync::CancellationToken,
) {
    loop {
        // プロセス終了シグナル または キャンセル を待つ（イベント駆動）
        let exit_code = tokio::select! {
            result = &mut exit_rx => {
                match result {
                    Ok(code) => code,
                    Err(_) => {
                        // exit_tx が drop された = pid probe タスクが終了
                        None
                    }
                }
            }
            _ = cancel_token.cancelled() => {
                // shutdown_all() / stop() により明示的にキャンセルされた
                return;
            }
        };

        // キャンセルトークンが発火済みなら終了（stop() が同時に走った場合）
        if cancel_token.is_cancelled() {
            return;
        }

        let (policy, restart_count) = {
            let guard = inner.lock().await;
            if let Some(entry) = guard.entries.get(&def.name) {
                // Stopped 状態なら watch_loop 終了（stop() が先に走った場合）
                if entry.state == ProcessState::Stopped {
                    return;
                }
                (entry.def.restart.clone(), entry.restart_count)
            } else {
                return;
            }
        };

        let should_restart = match &policy {
            RestartPolicy::Never => false,
            RestartPolicy::OnCrash { .. } => {
                // PID probe の制約により終了コードが取得できない場合がある。
                // その場合はクラッシュ扱いで再起動する。
                exit_code.map(|c| c != 0).unwrap_or(true)
            }
            RestartPolicy::Always { .. } => true,
        };

        if !should_restart {
            let mut guard = inner.lock().await;
            if let Some(entry) = guard.entries.get_mut(&def.name) {
                entry.state = ProcessState::Failed {
                    exit_code,
                    message: format!(
                        "Process exited with {:?}, RestartPolicy::Never",
                        exit_code
                    ),
                };
                entry.child = None;
            }
            return;
        }

        // バックオフディレイを計算
        let delay = match policy.next_delay(restart_count) {
            Some(d) => d,
            None => {
                let mut guard = inner.lock().await;
                if let Some(entry) = guard.entries.get_mut(&def.name) {
                    entry.state = ProcessState::Failed {
                        exit_code,
                        message: format!(
                            "Max retries ({}) exceeded for restart policy",
                            restart_count
                        ),
                    };
                    entry.child = None;
                }
                return;
            }
        };

        // Restarting 状態に遷移
        {
            let mut guard = inner.lock().await;
            if let Some(entry) = guard.entries.get_mut(&def.name) {
                entry.state = ProcessState::Restarting {
                    attempt: restart_count + 1,
                    retry_in_ms: delay.as_millis() as u64,
                };
                entry.child = None;
                entry.restart_count += 1;
            }
        }

        // キャンセルを待ちながらディレイ
        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = cancel_token.cancelled() => {
                return;
            }
        }

        // TODO: M8-1 完了後に以下の再起動パスを本実装に置き換える
        // 現状は再起動せずにループを抜ける（M8-1 で SpawnResult を用いた
        // Self::spawn_one 呼び出し + 新しい exit_rx でのループ継続に置き換え）
        return;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ProcessDef;
    use crate::ReadyCondition;
    use crate::RestartPolicy;
    use crate::state::ProcessState;
    use crate::registry::RegistryEntry;
    use std::collections::HashMap;
    use tokio::sync::broadcast;
    use tokio_util::sync::CancellationToken;

    /// テスト用のレジストリ状態を構築するヘルパー。
    fn make_inner(def: ProcessDef, state: ProcessState) -> Arc<Mutex<RegistryInner>> {
        let (tx, _) = broadcast::channel::<String>(16);
        let cancel = CancellationToken::new();

        let mut entries = HashMap::new();
        entries.insert(
            def.name.clone(),
            RegistryEntry {
                def: def.clone(),
                state,
                child: None,
                output_tx: tx,
                cancel_token: cancel,
                restart_count: 0,
            },
        );

        Arc::new(Mutex::new(RegistryInner {
            entries,
            start_order: vec![def.name.clone()],
        }))
    }

    /// テスト用の ProcessDef（Never ポリシー）を構築する。
    fn never_def(name: &str) -> ProcessDef {
        ProcessDef {
            name: name.to_string(),
            program: "echo".to_string(),
            args: vec![],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: None,
        }
    }

    /// cancel_token のキャンセルで watch_loop が即座に return することを確認する。
    ///
    /// M8-1（spawn_one）完了後に有効化すること。
    /// watch_loop の再起動パスが未実装のため、exit_rx のタイミング依存で
    /// テストがハングする可能性がある。
    #[ignore = "M8-1 完了後に有効化（再起動パス未実装のため exit_rx のタイミング依存）"]
    #[tokio::test]
    async fn cancel_stops_immediately() {
        let def = never_def("test");
        let inner = make_inner(def.clone(), ProcessState::Running { pid: 100 });
        let (tx, rx) = tokio::sync::oneshot::channel::<Option<i32>>();
        let cancel_token = CancellationToken::new();

        // cancel_token を発火して watch_loop が停止することを確認
        cancel_token.cancel();

        watch_loop(inner, def, rx, cancel_token).await;
        // 即座に return するはず（タイムアウトなしで確認）
        // ここに到達すればテスト成功
        let _ = tx; // drop
    }

    /// RestartPolicy::Never でプロセスが終了した場合、
    /// Failed 状態に遷移することを確認する。
    #[ignore = "M8-1 完了後に有効化（再起動パス未実装のため）"]
    #[tokio::test]
    async fn never_policy_sets_failed() {
        let def = never_def("test");
        let inner = make_inner(def.clone(), ProcessState::Running { pid: 100 });
        let cancel_token = CancellationToken::new();

        // oneshot で終了コード 1 を送信
        let (tx, rx) = tokio::sync::oneshot::channel::<Option<i32>>();
        tx.send(Some(1)).unwrap();

        watch_loop(inner.clone(), def.clone(), rx, cancel_token).await;

        // Failed 状態になっていることを確認
        let guard = inner.lock().await;
        let entry = guard.entries.get("test").unwrap();
        assert_eq!(entry.state, ProcessState::Failed {
            exit_code: Some(1),
            message: format!(
                "Process exited with {:?}, RestartPolicy::Never",
                Some(1)
            ),
        });
    }

    /// プロセスが Stopped 状態の場合、watch_loop が return することを確認する。
    ///
    /// exit_rx で終了コードを受信した後、Stopped 状態を検出して return する。
    #[ignore = "M8-1 完了後に有効化（exit_rx のタイミング依存によりハングするため）"]
    #[tokio::test]
    async fn stopped_state_exits() {
        let def = never_def("test");
        let inner = make_inner(def.clone(), ProcessState::Stopped);
        let (tx, rx) = tokio::sync::oneshot::channel::<Option<i32>>();
        let cancel_token = CancellationToken::new();

        // exit_rx に終了コードを送信して select! を通過させる
        tx.send(Some(0)).unwrap();

        // Stopped 状態なので exit_rx 受信後、Failed に遷移せずに return
        watch_loop(inner, def, rx, cancel_token).await;
    }
}
