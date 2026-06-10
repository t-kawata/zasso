//! # Registry — プロセスレジストリの内部構造
//!
//! プロセスの実行時状態を保持する `RegistryEntry`、レジストリ全体の
//! 内部状態 `RegistryInner`、および公開 API `ProcessRegistry` を定義する。

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::state::ProcessState;
use crate::ProcessDef;

/// プロセスレジストリ全体を表す公開構造体。
///
/// 内部状態は `Arc<Mutex<RegistryInner>>` でラップされ、
/// スレッド安全に共有される。Clone は `Arc::clone` により
/// 内部状態を共有する（ディープコピーではない）。
///
/// # Tauri 統合
///
/// `Clone + Send + Sync` を満たすため、`tauri::State` として
/// 管理可能。
#[derive(Debug)]
pub struct ProcessRegistry {
    inner: Arc<Mutex<RegistryInner>>,
}

impl Clone for ProcessRegistry {
    /// `Arc::clone` により内部状態を共有する。
    /// 元の `ProcessRegistry` とクローンは同一の `RegistryInner` を指す。
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

impl ProcessRegistry {
    /// 空のプロセスレジストリを作成する。
    ///
    /// entries も start_order も空の状態で初期化される。
    /// プロセスは `start_all()` または手動で追加されるまで存在しない。
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RegistryInner {
                entries: HashMap::new(),
                start_order: Vec::new(),
            })),
        }
    }

    /// レジストリ内の全プロセスの状態スナップショットを返す。
    ///
    /// 返り値はプロセス名 → `ProcessState` のマップ。
    /// Tauri フロントエンドはこのメソッドを定期ポーリングして状態を表示する。
    pub async fn snapshot(&self) -> HashMap<String, ProcessState> {
        let guard = self.inner.lock().await;
        guard
            .entries
            .iter()
            .map(|(name, entry)| (name.clone(), entry.state.clone()))
            .collect()
    }

    /// 指定されたプロセスの出力ストリームを購読する。
    ///
    /// 存在するプロセス名の場合は `Some(broadcast::Receiver)` を返す。
    /// 存在しないプロセス名の場合は `None` を返す。
    pub async fn subscribe_output(
        &self,
        name: &str,
    ) -> Option<broadcast::Receiver<String>> {
        let guard = self.inner.lock().await;
        guard.entries.get(name).map(|entry| entry.output_tx.subscribe())
    }

    /// 指定されたプロセスの出力を sink クロージャに流す専用タスクを起動する。
    ///
    /// 返り値の `JoinHandle` を `abort()` することで転送を停止できる。
    /// 存在しないプロセス名の場合は `None` を返す。
    pub async fn pipe_output_to<F>(
        &self,
        name: &str,
        mut sink: F,
    ) -> Option<tokio::task::JoinHandle<()>>
    where
        F: FnMut(String) + Send + 'static,
    {
        let mut rx = self.subscribe_output(name).await?;
        let handle = tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(line) => sink(line),
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        // Lagged: 購読者が遅い場合に発生。行が飛ぶ可能性があるが継続可能。
                    }
                }
            }
        });
        Some(handle)
    }

    /// 全プロセス定義を受け取り、`depends_on` を解決して順番に起動する。
    ///
    /// 1. `resolve_start_order()` で依存関係を解決
    /// 2. 各プロセスを順に: RegistryEntry 登録 → `spawn_one` → 状態更新 → `start_watch_task`
    /// 3. 一つでも起動に失敗した場合は即座に `Err` を返す
    pub async fn start_all(
        &self,
        defs: Vec<ProcessDef>,
    ) -> Result<(), crate::error::RegistryError> {
        use std::collections::HashMap;
        use crate::graph;

        let order = graph::resolve_start_order(&defs)?;

        // 起動順序を保存（shutdown_all での逆順停止に使用）
        {
            let mut guard = self.inner.lock().await;
            guard.start_order = order.clone();
        }

        let def_map: HashMap<String, ProcessDef> = defs
            .into_iter()
            .map(|d| (d.name.clone(), d))
            .collect();

        for name in &order {
            let def = def_map[name].clone();
            let cancel_token = CancellationToken::new();
            let (tx, _) = broadcast::channel::<String>(2048);

            // RegistryEntry を事前登録
            {
                let mut guard = self.inner.lock().await;
                guard.entries.insert(name.clone(), RegistryEntry {
                    def: def.clone(),
                    state: ProcessState::Pending,
                    child: None,
                    output_tx: tx.clone(),
                    cancel_token: cancel_token.clone(),
                    restart_count: 0,
                });
            }

            // spawn_one（ReadyCondition 待機を含む）
            let result = crate::spawn::spawn_one(
                Arc::clone(&self.inner),
                def.clone(),
                tx.clone(),
                cancel_token.clone(),
            )
            .await
            .map_err(|e| e)?;

            // SpawnResult をレジストリに反映
            {
                let mut guard = self.inner.lock().await;
                if let Some(entry) = guard.entries.get_mut(&def.name) {
                    entry.state = ProcessState::Running { pid: result.pid };
                    entry.child = Some(result.child_guard);
                }
            }

            // watch_loop タスクを起動（リトライ上限到達時の shutdown_all 用に registry も渡す）
            crate::watch::start_watch_task(
                Arc::clone(&self.inner),
                def.clone(),
                result.exit_rx,
                cancel_token.clone(),
                self.clone(),
            );
        }

        Ok(())
    }

    /// 全プロセスを起動の逆順で停止する。
    ///
    /// 1. `CancellationToken.cancel()` → `watch_loop` を即座に終了
    /// 2. `ChildGuard::shutdown().await` で GracefulShutdown 完了まで待機
    ///
    /// # デッドロック回避
    ///
    /// Mutex ロック内で `child.take()` し、ロック解放後に
    /// `shutdown().await` することでデッドロックを防止する。
    pub async fn shutdown_all(&self) {
        let stop_order: Vec<String> = {
            let guard = self.inner.lock().await;
            guard.start_order.iter().rev().cloned().collect()
        };

        for name in &stop_order {
            let guard = {
                let mut g = self.inner.lock().await;
                if let Some(entry) = g.entries.get_mut(name) {
                    entry.cancel_token.cancel();
                    entry.state = ProcessState::Stopped;
                    entry.child.take()
                } else {
                    None
                }
            };
            // Mutex ロック解放後に GracefulShutdown を await
            if let Some(child_guard) = guard {
                child_guard.shutdown().await;
            }
        }
    }

    /// 単一プロセスのみ停止する（デバッグ・動的管理用）。
    ///
    /// 存在しないプロセス名の場合は `RegistryError::NotFound` を返す。
    pub async fn stop(&self, name: &str) -> Result<(), crate::error::RegistryError> {
        let guard = {
            let mut g = self.inner.lock().await;
            let entry = g
                .entries
                .get_mut(name)
                .ok_or_else(|| crate::error::RegistryError::NotFound(name.to_string()))?;
            entry.cancel_token.cancel();
            entry.state = ProcessState::Stopped;
            entry.child.take()
        };
        if let Some(child_guard) = guard {
            child_guard.shutdown().await;
        }
        Ok(())
    }
}

/// レジストリの内部状態（非公開）。
///
/// - `entries`: プロセス名 → `RegistryEntry` のマップ
/// - `start_order`: トポロジカルソートされた起動順序のリスト。
///   `shutdown_all()` で逆順シャットダウンするために保持する。
///
/// # 未使用警告について
///
/// `entries` は M6-1（snapshot）で読み取り済み。
/// `start_order` は後続チケット（M8-1, M9-1）で使用される。
#[derive(Debug)]
#[allow(dead_code)]
pub(crate) struct RegistryInner {
    /// 全プロセスエントリのマップ。キーはプロセス名。
    pub(crate) entries: HashMap<String, RegistryEntry>,
    /// 起動順序のリスト。`shutdown_all()` で逆順に停止するために使用する。
    pub(crate) start_order: Vec<String>,
}

/// 1 つのプロセスの実行時状態を保持する内部構造体。
///
/// プロセス定義 `ProcessDef` と実行時状態 `ProcessState` を紐付け、
/// 子プロセスハンドル・出力購読チャンネル・キャンセルトークンを保持する。
///
/// # 未使用警告について
///
/// フィールドは後続チケットで使用される。現時点では型定義のみ確定させる段階。
#[derive(Debug)]
#[allow(dead_code)]
pub(crate) struct RegistryEntry {
    /// 起動時に使用したプロセス定義（不変）。
    pub def: ProcessDef,
    /// 現在のプロセス状態。
    pub state: ProcessState,
    /// 子プロセスのハンドル。
    ///
    /// `Some` の間、プロセスは稼働中。
    /// `take()` して `ChildGuard::shutdown().await` を呼ぶことで
    /// GracefulShutdown を実行する。
    ///
    /// TODO: M3-1 で本実装に置き換え。現在はスタブ。
    pub child: Option<ChildGuard>,
    /// 全出力行（stdout + stderr マージ）をブロードキャストするチャンネル。
    /// capacity = 2048（溢れたら古いものを drop）。
    pub output_tx: broadcast::Sender<String>,
    /// `watch_loop` に紐付いた CancellationToken。
    /// `stop()` / `shutdown_all()` 時に `cancel()` することで
    /// ポーリング待機中の `watch_loop` を即座に終了させる。
    pub cancel_token: CancellationToken,
    /// 現在の再起動試行回数。
    pub restart_count: u32,
}

pub(crate) use crate::child::ChildGuard;

#[cfg(test)]
mod tests {
    use super::*;

    /// RegistryInner が正しく構築でき、フィールドにアクセスできることを確認する。
    #[test]
    fn registry_inner_new() {
        let inner = RegistryInner {
            entries: HashMap::new(),
            start_order: vec![],
        };
        assert!(inner.entries.is_empty());
        assert!(inner.start_order.is_empty());
    }

    /// ProcessRegistry::clone() が `Arc::clone` であり、
    /// クローン後も内部状態が共有されることを確認する。
    #[test]
    fn process_registry_clone_is_arc_clone() {
        let reg = ProcessRegistry {
            inner: Arc::new(Mutex::new(RegistryInner {
                entries: HashMap::new(),
                start_order: vec![],
            })),
        };

        let cloned = reg.clone();

        // 両方の inner が同一の Arc を指していることを確認する
        assert!(Arc::ptr_eq(&reg.inner, &cloned.inner));
    }

    // ============================================================
    // M6-1: ProcessRegistry::new / snapshot / subscribe_output / pipe_output_to
    // ============================================================

    /// new() で作成したレジストリが空であることを確認する。
    #[tokio::test]
    async fn new_creates_empty_registry() {
        let reg = ProcessRegistry::new();
        let snapshot = reg.snapshot().await;
        assert!(snapshot.is_empty());
    }

    /// snapshot() が登録されたエントリの状態を正しく返すことを確認する。
    #[tokio::test]
    async fn snapshot_returns_all_states() {
        let reg = ProcessRegistry::new();
        let (tx, _) = broadcast::channel::<String>(16);
        let cancel = CancellationToken::new();

        // 直接エントリを追加する
        {
            let mut guard = reg.inner.lock().await;
            guard.entries.insert(
                "test".to_string(),
                RegistryEntry {
                    def: crate::ProcessDef {
                        name: "test".to_string(),
                        program: "echo".to_string(),
                        args: vec![],
                        env: vec![],
                        depends_on: vec![],
                        restart: crate::RestartPolicy::Never,
                        ready: crate::ReadyCondition::Immediate,
                        shutdown_timeout: None,
                    },
                    state: ProcessState::Running { pid: 42 },
                    child: None,
                    output_tx: tx,
                    cancel_token: cancel,
                    restart_count: 0,
                },
            );
        }

        let snapshot = reg.snapshot().await;
        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot.get("test"), Some(&ProcessState::Running { pid: 42 }));
    }

    /// 存在するプロセス名に対して subscribe_output() が Some を返すことを確認する。
    #[tokio::test]
    async fn subscribe_output_existing_process() {
        let reg = ProcessRegistry::new();
        let (tx, _) = broadcast::channel::<String>(16);
        let cancel = CancellationToken::new();

        {
            let mut guard = reg.inner.lock().await;
            guard.entries.insert(
                "test".to_string(),
                RegistryEntry {
                    def: crate::ProcessDef {
                        name: "test".to_string(),
                        program: "echo".to_string(),
                        args: vec![],
                        env: vec![],
                        depends_on: vec![],
                        restart: crate::RestartPolicy::Never,
                        ready: crate::ReadyCondition::Immediate,
                        shutdown_timeout: None,
                    },
                    state: ProcessState::Running { pid: 1 },
                    child: None,
                    output_tx: tx,
                    cancel_token: cancel,
                    restart_count: 0,
                },
            );
        }

        let rx = reg.subscribe_output("test").await;
        assert!(rx.is_some());
    }

    /// 存在しないプロセス名に対して subscribe_output() が None を返すことを確認する。
    #[tokio::test]
    async fn subscribe_output_nonexistent_process() {
        let reg = ProcessRegistry::new();
        let rx = reg.subscribe_output("nonexistent").await;
        assert!(rx.is_none());
    }

    /// subscribe_output() で取得した Receiver が実際に出力行を受信できることを確認する。
    #[tokio::test]
    async fn subscribe_output_receives_lines() {
        let reg = ProcessRegistry::new();
        let (tx, _) = broadcast::channel::<String>(16);
        let cancel = CancellationToken::new();

        {
            let mut guard = reg.inner.lock().await;
            guard.entries.insert(
                "test".to_string(),
                RegistryEntry {
                    def: crate::ProcessDef {
                        name: "test".to_string(),
                        program: "echo".to_string(),
                        args: vec![],
                        env: vec![],
                        depends_on: vec![],
                        restart: crate::RestartPolicy::Never,
                        ready: crate::ReadyCondition::Immediate,
                        shutdown_timeout: None,
                    },
                    state: ProcessState::Running { pid: 1 },
                    child: None,
                    output_tx: tx.clone(),
                    cancel_token: cancel,
                    restart_count: 0,
                },
            );
        }

        let mut rx = reg.subscribe_output("test").await.unwrap();

        // 出力行を送信して受信できることを確認する
        let _ = tx.send("hello".to_string());
        let line = rx.recv().await.unwrap();
        assert_eq!(line, "hello");
    }

    /// pipe_output_to() が sink を正しく設定し JoinHandle を返すことを確認する。
    ///
    /// sink クロージャが出力行で呼ばれることは、コンパイルが通ることで
    /// 型シグネチャの正しさが証明される。実際の転送動作は M13-1 統合テストで検証する。
    #[tokio::test]
    async fn pipe_output_to_returns_handle() {
        let reg = ProcessRegistry::new();
        let (tx, _) = broadcast::channel::<String>(16);
        let cancel = CancellationToken::new();

        {
            let mut guard = reg.inner.lock().await;
            guard.entries.insert(
                "test".to_string(),
                RegistryEntry {
                    def: crate::ProcessDef {
                        name: "test".to_string(),
                        program: "echo".to_string(),
                        args: vec![],
                        env: vec![],
                        depends_on: vec![],
                        restart: crate::RestartPolicy::Never,
                        ready: crate::ReadyCondition::Immediate,
                        shutdown_timeout: None,
                    },
                    state: ProcessState::Running { pid: 1 },
                    child: None,
                    output_tx: tx.clone(),
                    cancel_token: cancel,
                    restart_count: 0,
                },
            );
        }

        let handle = reg
            .pipe_output_to("test", |line| {
                // sink: 出力行を受け取る（統合テストで実際の転送を検証）
                let _ = line;
            })
            .await
            .expect("pipe_output_to should return Some for existing process");

        // noneixstent プロセスには None
        let none_handle = reg.pipe_output_to("nonexistent", |_| {}).await;
        assert!(none_handle.is_none());

        handle.abort();
    }

    // ============================================================
    // M9-1: ProcessRegistry::shutdown_all / stop
    // ============================================================

    /// shutdown_all() が空のレジストリでもパニックせず完了することを確認する。
    #[tokio::test]
    async fn shutdown_all_empty_registry() {
        let reg = ProcessRegistry::new();
        // 空のレジストリで shutdown_all を呼んでもパニックしない
        reg.shutdown_all().await;
    }

    /// stop() が存在しないプロセス名に NotFound を返すことを確認する。
    #[tokio::test]
    async fn stop_nonexistent_returns_not_found() {
        let reg = ProcessRegistry::new();
        let result = reg.stop("nonexistent").await;
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            crate::error::RegistryError::NotFound(_)
        ));
    }
}
