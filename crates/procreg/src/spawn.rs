//! # Process Spawn — プロセス起動・出力キャプチャ・終了検知
//!
//! `tokio::process::Command` を使用したプロセス起動と、その後の
//! 出力キャプチャ・起動完了待機・PID probe タスクの一連の処理を実装する。
//!
//! プロセスは Watchdog ラッパーを経由して起動される。Watchdog は独立した
//! プロセスとして親PIDを監視し、親が死んだ場合に子プロセスを強制終了する。
//! これにより全OSで「子が親を監視して自殺する」が統一方式で実現される。

use std::sync::Arc;
use tokio::io::AsyncBufReadExt;
use tokio::sync::{broadcast, oneshot, Mutex};
use tokio_util::sync::CancellationToken;

use crate::error::RegistryError;
use crate::port;
use crate::ready;
use crate::registry::RegistryInner;
use crate::state::ProcessState;
use crate::registry::ChildGuard;
use crate::{ProcessDef, ReadyCondition};

/// `spawn_one` の戻り値。
///
/// `exit_rx` により `watch_loop` がポーリングなしでプロセス終了を検知できる。
#[derive(Debug)]
pub(crate) struct SpawnResult {
    /// GracefulShutdown を実行するガード。
    pub child_guard: ChildGuard,
    /// プロセスの OS 上の PID（Watchdog の PID）。
    pub pid: u32,
    /// プロセス終了時に終了コードを送信する oneshot レシーバ。
    /// `watch_loop` はこれを `await` することで終了を検知する。
    pub exit_rx: oneshot::Receiver<Option<i32>>,
}

/// 単一プロセスを spawn し、`ReadyCondition` を待ってから `SpawnResult` を返す。
///
/// # 処理フロー
///
/// 1. ポート競合チェック（`ReadyCondition::TcpPort` の場合のみ）
/// 2. Watchdog バイナリを一時ファイルに展開
/// 3. Watchdog 経由で実プロセスを起動
/// 4. PID 取得（0 の場合はエラー）
/// 5. stdout/stderr 読み取りタスクを起動（行単位で broadcast に送信）
/// 6. State を Starting に更新
/// 7. `wait_ready` で起動完了条件を待機
/// 8. `ChildGuard` でラップ
/// 9. PID probe タスクを起動（終了検知用）
///
/// `start_all` から、または `watch_loop` の再起動パスから呼び出される。
#[allow(dead_code)]
pub(crate) async fn spawn_one(
    inner: Arc<Mutex<RegistryInner>>,
    def: ProcessDef,
    output_tx: broadcast::Sender<String>,
    _cancel_token: CancellationToken,
) -> Result<SpawnResult, RegistryError> {
    // ---- Step 1: ポート競合チェック ----
    // TcpPort レディネス条件のプロセスのみ、起動前にポート使用中を確認する。
    // 占有済みのポートに新しいプロセスを起動しても無駄になるため、
    // 先に確認して早期エラーとする。
    if let ReadyCondition::TcpPort { host, port, .. } = &def.ready {
        let is_free = port::is_port_free(*host, *port).map_err(|_| RegistryError::PortInUse {
            host: *host,
            port: *port,
        })?;
        if !is_free {
            return Err(RegistryError::PortInUse {
                host: *host,
                port: *port,
            });
        }
    }

    // ---- Step 2: Watchdog バイナリを展開 ----
    let watchdog_path = crate::watchdog::extract_watchdog()
        .map_err(|e| RegistryError::SpawnFailed {
            name: def.name.clone(),
            source: anyhow::anyhow!("Failed to extract watchdog: {e}"),
        })?;

    // ---- Step 3: Watchdog 経由でプロセスを起動 ----
    // コマンド構成: watchdog -- <program> [args...]
    let mut cmd = tokio::process::Command::new(&watchdog_path);
    cmd.arg("--");
    cmd.arg(&def.program);
    cmd.args(&def.args);
    // ユーザー定義の環境変数を設定する
    for (k, v) in &def.env {
        cmd.env(k, v);
    }
    // Watchdog に親PIDを伝達する
    cmd.env(
        "PROCREG_WATCHDOG_PARENT_PID",
        std::process::id().to_string(),
    );

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

    /// echo 相当のプロセスを spawn し、正常に起動することを確認する。
    ///
    /// Unix: `/bin/echo`（引数なし。起動して即終了）
    /// Windows: `cmd.exe /c echo`（同上）
    #[tokio::test(flavor = "multi_thread")]
    async fn spawn_one_echo_process() {
        let inner = Arc::new(Mutex::new(RegistryInner {
            entries: HashMap::new(),
            start_order: vec![],
        }));
        let (tx, _rx) = broadcast::channel::<String>(2048);
        let cancel = CancellationToken::new();
        #[cfg(unix)]
        let def = test_def("echo_test", "/bin/echo");
        #[cfg(windows)]
        let def = ProcessDef {
            name: "echo_test".to_string(),
            program: "cmd.exe".to_string(),
            args: vec!["/c".to_string(), "echo".to_string()],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: None,
        };

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

    /// Watchdog 経由で env が正しく設定されることを確認する。
    ///
    /// `printenv`（Unix）または `echo`（Windows）で
    /// `PROCREG_WATCHDOG_PARENT_PID` の値を検証する。
    #[tokio::test(flavor = "multi_thread")]
    async fn watchdog_parent_env_var_is_set() {
        let inner = Arc::new(Mutex::new(RegistryInner {
            entries: HashMap::new(),
            start_order: vec![],
        }));
        let (tx, mut rx) = broadcast::channel::<String>(2048);
        let cancel = CancellationToken::new();

        #[cfg(unix)]
        let def = ProcessDef {
            name: "printenv_test".to_string(),
            program: "/usr/bin/printenv".to_string(),
            args: vec!["PROCREG_WATCHDOG_PARENT_PID".to_string()],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: None,
        };
        #[cfg(windows)]
        let def = ProcessDef {
            name: "printenv_test".to_string(),
            program: "cmd.exe".to_string(),
            args: vec![
                "/c".to_string(),
                "echo".to_string(),
                "%PROCREG_WATCHDOG_PARENT_PID%".to_string(),
            ],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: None,
        };

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
            guard.entries.insert("printenv_test".to_string(), entry);
        }

        let result = spawn_one(inner, def, tx.clone(), cancel).await;
        assert!(result.is_ok(), "spawn_one should succeed: {:?}", result.err());

        // stdout に出力された PROCREG_WATCHDOG_PARENT_PID の値を broadcast から受信する
        let parent_pid = std::process::id().to_string();
        let output = tokio::time::timeout(std::time::Duration::from_secs(3), rx.recv())
            .await
            .expect("timeout waiting for printenv output")
            .expect("broadcast channel closed unexpectedly");

        assert_eq!(
            output.trim(),
            parent_pid,
            "PROCREG_WATCHDOG_PARENT_PID env var should be set to parent PID"
        );
    }

    /// 存在しないコマンドを Watchdog 経由で spawn した場合、
    /// Watchdog 自体は起動するため `spawn_one()` は成功することを確認する。
    ///
    /// Watchdog は子プロセスの起動に失敗すると内部で exit(1) するが、
    /// それは非同期に発生するイベントである。spawn_one() は Watchdog の
    /// 起動成功をもって成功を返す。
    ///
    /// この動作は設計上正しい。Watchdog が非同期に検出した子プロセスの
    /// 起動失敗は watch_loop によって Failed 状態として処理される。
    #[tokio::test(flavor = "multi_thread")]
    async fn spawn_one_nonexistent_program() {
        let inner = Arc::new(Mutex::new(RegistryInner {
            entries: HashMap::new(),
            start_order: vec![],
        }));
        let (tx, _rx) = broadcast::channel::<String>(16);
        let cancel = CancellationToken::new();
        let def = test_def("nonexistent", "/nonexistent/command");

        // Watchdog 自体は正常に起動するため spawn_one は成功する
        let result = spawn_one(inner, def, tx, cancel).await;
        assert!(result.is_ok(), "spawn_one should succeed because watchdog starts");
    }
}
