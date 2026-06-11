//! # Watch — プロセス監視・再起動ループ
//!
//! プロセス終了をイベント駆動で検知し、`RestartPolicy` に基づいて
//! 再起動する監視ループ。

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::registry::ProcessRegistry;
use crate::registry::RegistryInner;
use crate::state::ProcessState;
use crate::{ProcessDef, RestartPolicy};

/// プロセス監視タスクを起動する。
///
/// `tokio::spawn` で `watch_loop` をバックグラウンドタスクとして実行する。
/// `registry` はリトライ上限到達時に `shutdown_all()` を呼び出すために使用される。
pub(crate) fn start_watch_task(
    inner: Arc<Mutex<RegistryInner>>,
    def: ProcessDef,
    exit_rx: tokio::sync::oneshot::Receiver<Option<i32>>,
    cancel_token: tokio_util::sync::CancellationToken,
    registry: ProcessRegistry,
) {
    tokio::spawn(async move {
        watch_loop(inner, def, exit_rx, cancel_token, registry).await;
    });
}

/// プロセス終了を監視し、`RestartPolicy` に基づいて再起動するループ。
///
/// `registry` が必要な理由: リトライ上限到達時や spawn 失敗時に
/// `shutdown_all()` を呼び出し、子の永久死を検知してアプリ全体を停止する。
/// これにより「親が死ねば子も死ぬ、子が永久に死ねば親も死ぬ」が実現する。
///
/// # イベント駆動
///
/// `tokio::select!` で終了通知（exit_rx）とキャンセルトークンを同時待機する。
/// ポーリングは行わず、イベント駆動で効率的に動作する。
async fn watch_loop(
    inner: Arc<Mutex<RegistryInner>>,
    def: ProcessDef,
    mut exit_rx: tokio::sync::oneshot::Receiver<Option<i32>>,
    cancel_token: tokio_util::sync::CancellationToken,
    registry: ProcessRegistry,
) {
    loop {
        // プロセス終了シグナル または キャンセル を待つ（イベント駆動）
        let exit_code = tokio::select! {
            result = &mut exit_rx => {
                // exit_tx が drop された場合は None（pid probe タスク終了）
                result.unwrap_or(None)
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
                    message: format!("Process exited with {:?}, RestartPolicy::Never", exit_code),
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
                // リトライ上限に達した = 子は永久に復帰しない
                // Mutex ロックを解放してから shutdown_all を呼ぶ（デッドロック回避）
                drop(guard);
                registry.shutdown_all().await;
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

        // レジストリの output_tx を取得（再起動後も同じチャンネルを使い続ける）
        let output_tx = {
            let guard = inner.lock().await;
            guard.entries.get(&def.name).map(|e| e.output_tx.clone())
        };
        let Some(output_tx) = output_tx else {
            return;
        };

        // 再起動
        match crate::spawn::spawn_one(
            Arc::clone(&inner),
            def.clone(),
            output_tx,
            cancel_token.clone(),
        )
        .await
        {
            Ok(result) => {
                let new_exit_rx = result.exit_rx;
                {
                    let mut guard = inner.lock().await;
                    if let Some(entry) = guard.entries.get_mut(&def.name) {
                        entry.state = ProcessState::Running { pid: result.pid };
                        entry.child = Some(result.child_guard);
                    }
                }
                // 新しい exit_rx で次のループへ
                exit_rx = new_exit_rx;
            }
            Err(e) => {
                let mut guard = inner.lock().await;
                if let Some(entry) = guard.entries.get_mut(&def.name) {
                    entry.state = ProcessState::Failed {
                        exit_code: None,
                        message: e.to_string(),
                    };
                }
                // 再起動の spawn 自体に失敗 = 子は永久に復帰しない
                // Mutex ロックを解放してから shutdown_all を呼ぶ（デッドロック回避）
                drop(guard);
                registry.shutdown_all().await;
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::RegistryEntry;
    use crate::state::ProcessState;
    use crate::ProcessDef;
    use crate::ReadyCondition;
    use crate::RestartPolicy;
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
    #[tokio::test]
    async fn cancel_stops_immediately() {
        let def = never_def("test");
        let inner = make_inner(def.clone(), ProcessState::Running { pid: 100 });
        let (tx, rx) = tokio::sync::oneshot::channel::<Option<i32>>();
        let cancel_token = CancellationToken::new();

        // cancel_token を発火して watch_loop が停止することを確認
        cancel_token.cancel();

        let registry = ProcessRegistry::new();
        watch_loop(inner, def, rx, cancel_token, registry).await;
        // 即座に return するはず（タイムアウトなしで確認）
        // ここに到達すればテスト成功
        let _ = tx; // drop
    }

    /// RestartPolicy::Never でプロセスが終了した場合、
    /// Failed 状態に遷移することを確認する。
    #[tokio::test]
    async fn never_policy_sets_failed() {
        let def = never_def("test");
        let inner = make_inner(def.clone(), ProcessState::Running { pid: 100 });
        let cancel_token = CancellationToken::new();

        // oneshot で終了コード 1 を送信
        let (tx, rx) = tokio::sync::oneshot::channel::<Option<i32>>();
        tx.send(Some(1)).unwrap();

        let registry = ProcessRegistry::new();
        watch_loop(inner.clone(), def.clone(), rx, cancel_token, registry).await;

        // Failed 状態になっていることを確認
        let guard = inner.lock().await;
        let entry = guard.entries.get("test").unwrap();
        assert_eq!(
            entry.state,
            ProcessState::Failed {
                exit_code: Some(1),
                message: format!("Process exited with {:?}, RestartPolicy::Never", Some(1)),
            }
        );
    }

    /// プロセスが Stopped 状態の場合、watch_loop が return することを確認する。
    ///
    /// 本番と同様に `watch_loop` を `tokio::spawn` でバックグラウンド実行し、
    /// PID probe タスク相当の遅延後に `oneshot` で終了コードを送信する。
    /// タイムアウトでラップすることでハングを防止する。
    #[tokio::test]
    async fn stopped_state_exits() {
        let def = never_def("test");
        let inner = make_inner(def.clone(), ProcessState::Stopped);
        let (tx, rx) = tokio::sync::oneshot::channel::<Option<i32>>();
        let cancel_token = CancellationToken::new();

        let registry = ProcessRegistry::new();
        // watch_loop をバックグラウンドで起動（本番と同様の実行順序）
        let handle = tokio::spawn(watch_loop(inner, def, rx, cancel_token, registry));

        // PID probe タスク相当: 短い遅延後に終了コードを送信
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        tx.send(Some(0)).unwrap();

        // watch_loop が Stopped を検出して return するのを待つ（タイムアウト付き）
        tokio::time::timeout(std::time::Duration::from_secs(1), handle)
            .await
            .expect("watch_loop timed out - Stopped state was not detected")
            .expect("watch_loop task panicked");
    }
}
