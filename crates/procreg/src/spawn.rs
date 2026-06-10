//! # Process Spawn — プロセス起動・出力キャプチャ・終了検知
//!
//! `tokio::process::Command` を使用したプロセス起動と、その後の
//! 出力キャプチャ・起動完了待機・PID probe タスクの一連の処理を実装する。

use std::sync::Arc;
use tokio::io::AsyncBufReadExt;
use tokio::sync::{broadcast, oneshot, Mutex};
use tokio_util::sync::CancellationToken;

use crate::error::RegistryError;
use crate::ready;
use crate::registry::RegistryInner;
use crate::state::ProcessState;
use crate::registry::ChildGuard;
use crate::ProcessDef;

/// `spawn_one` の戻り値。
///
/// `exit_rx` により `watch_loop` がポーリングなしでプロセス終了を検知できる。
#[derive(Debug)]
pub(crate) struct SpawnResult {
    /// GracefulShutdown を実行するガード。
    pub child_guard: ChildGuard,
    /// プロセスの OS 上の PID。
    pub pid: u32,
    /// プロセス終了時に終了コードを送信する oneshot レシーバ。
    /// `watch_loop` はこれを `await` することで終了を検知する。
    pub exit_rx: oneshot::Receiver<Option<i32>>,
}

/// 単一プロセスを spawn し、`ReadyCondition` を待ってから `SpawnResult` を返す。
///
/// # 処理フロー
///
/// 1. `tokio::process::Command` でプロセスを起動
/// 2. PID 取得（0 の場合はエラー）
/// 3. stdout/stderr 読み取りタスクを起動（行単位で broadcast に送信）
/// 4. State を Starting に更新
/// 5. `wait_ready` で起動完了条件を待機
/// 6. `ChildGuard` でラップ
/// 7. PID probe タスクを起動（終了検知用）
///
/// `start_all` から、または `watch_loop` の再起動パスから呼び出される。
#[allow(dead_code)]
pub(crate) async fn spawn_one(
    inner: Arc<Mutex<RegistryInner>>,
    def: ProcessDef,
    output_tx: broadcast::Sender<String>,
    _cancel_token: CancellationToken,
) -> Result<SpawnResult, RegistryError> {
    // tokio::process::Command で直接 spawn（PID・出力パイプを取得するため）
    let mut cmd = tokio::process::Command::new(&def.program);
    cmd.args(&def.args);
    for (k, v) in &def.env {
        cmd.env(k, v);
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| RegistryError::SpawnFailed {
        name: def.name.clone(),
        source: e.into(),
    })?;

    // child.id() は Option<u32>。spawn 直後は通常 Some だが、
    // 万一 None の場合は 0 になる。PID=0 はプロセス不在を意味する。
    let pid = child.id().unwrap_or(0);
    if pid == 0 {
        return Err(RegistryError::SpawnFailed {
            name: def.name.clone(),
            source: anyhow::anyhow!("Failed to obtain PID after spawn"),
        });
    }

    // stdout 読み取りタスク（行単位で broadcast に送信）
    let stdout_tx = output_tx.clone();
    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(async move {
            let mut reader = tokio::io::BufReader::new(stdout);
            let mut line = String::new();
            while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
                let trimmed = line
                    .trim_end_matches('\n')
                    .trim_end_matches('\r')
                    .to_string();
                let _ = stdout_tx.send(trimmed);
                line.clear();
            }
        });
    }

    // stderr 読み取りタスク（同じ output_tx にマージして送信）
    let stderr_tx = output_tx.clone();
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut reader = tokio::io::BufReader::new(stderr);
            let mut line = String::new();
            while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
                let trimmed = line
                    .trim_end_matches('\n')
                    .trim_end_matches('\r')
                    .to_string();
                let _ = stderr_tx.send(trimmed);
                line.clear();
            }
        });
    }

    // State を Starting に更新
    {
        let mut guard = inner.lock().await;
        if let Some(entry) = guard.entries.get_mut(&def.name) {
            entry.state = ProcessState::Starting;
        }
    }

    // ReadyCondition を待機
    ready::wait_ready(&def.ready, &def.name, output_tx.clone()).await?;

    // ChildGuard でラップ（運命共同体の核心）
    let timeout_cfg = def
        .shutdown_timeout
        .clone()
        .unwrap_or_default();
    let child_guard = ChildGuard::new(child, timeout_cfg);

    // プロセス終了検知用の oneshot チャンネル
    let (exit_tx, exit_rx) = oneshot::channel::<Option<i32>>();
    {
        let _name = def.name.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                if !crate::platform::is_process_alive(pid) {
                    // exit code は pid probe では取得できないため None を送信
                    let _ = exit_tx.send(None);
                    break;
                }
            }
        });
    }

    Ok(SpawnResult {
        child_guard,
        pid,
        exit_rx,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ProcessDef;
    use crate::ReadyCondition;
    use crate::RestartPolicy;
    use crate::registry::RegistryEntry;
    use std::collections::HashMap;

    /// テスト用の ProcessDef を構築する。
    fn test_def(name: &str, program: &str) -> ProcessDef {
        ProcessDef {
            name: name.to_string(),
            program: program.to_string(),
            args: vec![],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: None,
        }
    }

    /// /bin/echo を spawn し、プロセスが正常に起動して出力が broadcast に
    /// 配信されることを確認する。
    #[tokio::test(flavor = "multi_thread")]
    async fn spawn_one_echo_process() {
        let inner = Arc::new(Mutex::new(RegistryInner {
            entries: HashMap::new(),
            start_order: vec![],
        }));
        let (tx, _rx) = broadcast::channel::<String>(2048);
        let cancel = CancellationToken::new();
        let def = test_def("echo_test", "/bin/echo");

        // RegistryEntry を事前登録（start_all 相当）
        let entry = RegistryEntry {
            def: def.clone(),
            state: ProcessState::Pending,
            child: None,
            output_tx: tx.clone(),
            cancel_token: cancel.clone(),
            restart_count: 0,
        };
        {
            let mut guard = inner.lock().await;
            guard.entries.insert("echo_test".to_string(), entry);
        }

        let result = spawn_one(inner, def, tx.clone(), cancel).await;
        assert!(result.is_ok(), "spawn_one should succeed: {:?}", result.err());

        let spawn_result = result.unwrap();
        assert!(spawn_result.pid > 0, "PID should be positive");
    }

    /// 存在しないコマンドを spawn しようとすると SpawnFailed が返ることを確認する。
    #[tokio::test(flavor = "multi_thread")]
    async fn spawn_one_nonexistent_program() {
        let inner = Arc::new(Mutex::new(RegistryInner {
            entries: HashMap::new(),
            start_order: vec![],
        }));
        let (tx, _rx) = broadcast::channel::<String>(16);
        let cancel = CancellationToken::new();
        let def = test_def("nonexistent", "/nonexistent/command");

        let result = spawn_one(inner, def, tx, cancel).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), RegistryError::SpawnFailed { .. }));
    }
}
