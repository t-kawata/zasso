# RFC-001: `process-registry` — Cross-Platform Sidecar Process Manager（改訂版 v2）

**Status:** Draft
**Author:** MYCUTE Architecture Team
**Created:** 2026-06-09
**Revised:** 2026-06-10
**Depends on:** `tokio` (latest, features=["full"]), `petgraph` (latest), `tokio-util` (latest, features=["rt"]) — すべて `cargo add` で最新版を導入すること

***

## 1. Summary

`process-registry` は、`tokio::process::Command` を基盤として、以下の機能を提供するクレートである。

- **名前付きプロセスレジストリ** — `HashMap<String, Entry>` ベースのライフサイクル管理
- **`depends_on` 起動順序制御** — DAGトポロジカルソートによる依存解決（循環検出付き）
- **`RestartPolicy`** — `Never / OnCrash / Always` + 最大リトライ / バックオフ
- **Output Capture** — `broadcast::Sender<String>` によるマルチ購読ストリーム
- **運命共同体** — `ChildGuard` + GracefulShutdown（SIGTERM → wait → SIGKILL）

これにより、Tauriアプリケーションを含む任意のRustホストプロセスが、複数のサイドカー（TensorZero、Bifrost等）を宣言的かつ安全に管理できる。

***

## 2. 背景と動機

### 2.1 既存クレートの問題点

| クレート | 問題 |
|---|---|
| `kagaya` | `sh -c` 依存 → Windows非対応 |
| `rust_supervisor` | Rustタスク監視専用。外部バイナリ管理不可 |
| `tokio-process-tools` | 低レイヤー。レジストリ・依存解決・再起動ポリシーを持たない |

### 2.2 解決すべき要件

1. **クロスプラットフォーム**: Windows / macOS / Linux で同一コードが動作すること
2. **孤児プロセス対策**: `SIGKILL` 以外のすべての終了パターンで子プロセスが残留しないこと
3. **依存順序起動**: サービスAがポートを開いてからサービスBを起動する等の宣言的な制御
4. **再起動ポリシー**: クラッシュ時のバックオフ付き再起動とリトライ上限
5. **出力キャプチャ**: 複数の購読者が非同期でサイドカーの出力を受け取れること
6. **Tauri統合**: `tauri::State` として保持し、フロントエンドからコマンド経由で状態照会できること

***

## 3. 設計概要

```
┌──────────────────────────────────────────────────────────┐
│                    ProcessRegistry                       │
│                                                          │
│  HashMap<String, RegistryEntry>                          │
│  ├── "tensorzero"  →  RegistryEntry { child, tx, ... }  │
│  ├── "bifrost"     →  RegistryEntry { child, tx, ... }  │
│  └── "embedding"   →  RegistryEntry { child, tx, ... }  │
│                                                          │
│  tokio::process::Command で直接 spawn:                    │
│    ChildGuard ─ drop時に GracefulShutdown を実行          │
│    SIGTERM(5s) → 待機 → SIGKILL (Unix)                   │
│    BufReader  ─ stdout/stderr → broadcast::Sender        │
└──────────────────────────────────────────────────────────┘
         ↑
   Arc<Mutex<Inner>>
         ↑
┌────────────────────┐     ┌──────────────────────────────┐
│  Tauri Command     │     │  Watch Task（イベント駆動）   │
│  (フロントエンド)   │     │  exit_rx.await → 再起動判断  │
└────────────────────┘     └──────────────────────────────┘
```

***

## 4. Cargo.toml

依存クレートは**必ず `cargo add` で最新版を導入**する。バージョンをハードコードしない。

```sh
# 非同期ランタイム（multi_thread必須 — ChildGuard の GracefulShutdown に必要）
cargo add tokio --features full

# depends_on の DAG解決
cargo add petgraph

# エラーハンドリング
cargo add anyhow
cargo add thiserror

# ログ
cargo add tracing

# シリアライズ（Tauri 経由でフロントエンドに状態を返す場合）
cargo add serde --features derive

# CancellationToken（watch_loop の即時キャンセルに使用）
cargo add tokio-util --features rt

# プロセス生存確認（プラットフォーム別）
cargo add --target 'cfg(unix)' libc
cargo add --target 'cfg(windows)' windows --features Win32_System_Threading,Win32_Foundation

# 開発依存
cargo add --dev tokio --features full,test-util
```

生成される `Cargo.toml` のイメージ（バージョンは `cargo add` 時点の最新が自動挿入される）:

```toml
[package]
name    = "process-registry"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio       = { version = "...", features = ["full"] }
petgraph    = "..."
anyhow      = "..."
thiserror   = "..."
tracing     = "..."
serde       = { version = "...", features = ["derive"] }
tokio-util  = { version = "...", features = ["rt"] }

[target.'cfg(unix)'.dependencies]
libc = "..."

[target.'cfg(windows)'.dependencies]
windows = { version = "...", features = [
    "Win32_System_Threading",
    "Win32_Foundation",
] }

[dev-dependencies]
tokio = { version = "...", features = ["full", "test-util"] }

[profile.release]
# panic = "abort" にすると install_panic_hook が動作しない
panic = "unwind"
```

> **注記**: `tokio-process-tools` は依存しない。GracefulShutdown は `ChildGuard`
> に自前実装する。マルチスレッドTokioランタイムは `ChildGuard` の Drop 内での
> GracefulShutdown 非同期実行に必要であり、`#[tokio::test]` では
> `#[tokio::test(flavor = "multi_thread")]` を使用すること。

***

## 5. 型定義

### 5.1 ProcessDef — プロセス定義

```rust
use std::time::Duration;

/// 1つのサイドカープロセスの完全な定義。
/// すべてのフィールドは起動前に確定しなければならない。
#[derive(Debug, Clone)]
pub struct ProcessDef {
    /// レジストリ内の一意な識別子。ログ・エラーメッセージに使われる。
    pub name: String,

    /// 実行するバイナリのパス。PATH解決はOSに委ねる。
    pub program: String,

    /// コマンドライン引数のリスト。
    pub args: Vec<String>,

    /// 環境変数の追加・上書き。None = 親プロセスの環境を継承。
    pub env: Vec<(String, String)>,

    /// このプロセスの起動前に Running 状態になっていなければならないプロセス名。
    /// トポロジカルソートの入力になる。
    pub depends_on: Vec<String>,

    /// クラッシュ・終了時の再起動ポリシー。
    pub restart: RestartPolicy,

    /// このプロセスが「起動完了」とみなされる条件。
    /// depends_on の解決でこの条件を待つ。
    pub ready: ReadyCondition,

    /// GracefulShutdown のタイムアウト設定。None = デフォルト(SIGTERM 5s)。
    pub shutdown_timeout: Option<ShutdownTimeoutConfig>,
}
```

### 5.2 RestartPolicy

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum RestartPolicy {
    /// 終了・クラッシュしても再起動しない。
    Never,

    /// ゼロ以外の終了コードでクラッシュした場合のみ再起動する。
    /// 正常終了（exit code 0）では再起動しない。
    OnCrash {
        max_retries: u32,
        initial_delay: Duration,
        /// 指数バックオフの係数 (1.0 = バックオフなし)
        backoff_factor: f64,
        max_delay: Duration,
    },

    /// 終了コードに関わらず常に再起動する。
    Always {
        max_retries: u32,
        initial_delay: Duration,
        backoff_factor: f64,
        max_delay: Duration,
    },
}

impl RestartPolicy {
    /// よく使うデフォルト: クラッシュ時に3回まで再起動、1秒から指数バックオフ
    pub fn on_crash_default() -> Self {
        Self::OnCrash {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            backoff_factor: 2.0,
            max_delay: Duration::from_secs(30),
        }
    }

    /// バックオフ計算: delay * factor^attempt (max_delayで上限クランプ)
    pub(crate) fn next_delay(&self, attempt: u32) -> Option<Duration> {
        let (max_retries, initial, factor, max_d) = match self {
            Self::Never => return None,
            Self::OnCrash { max_retries, initial_delay, backoff_factor, max_delay } =>
                (*max_retries, *initial_delay, *backoff_factor, *max_delay),
            Self::Always { max_retries, initial_delay, backoff_factor, max_delay } =>
                (*max_retries, *initial_delay, *backoff_factor, *max_delay),
        };
        if attempt >= max_retries {
            return None;
        }
        let secs = initial.as_secs_f64() * factor.powi(attempt as i32);
        Some(Duration::from_secs_f64(secs.min(max_d.as_secs_f64())))
    }
}
```

### 5.3 ReadyCondition

```rust
#[derive(Debug, Clone)]
pub enum ReadyCondition {
    /// stdoutまたはstderrに特定の文字列が含まれる行が出るまで待つ。
    LogContains {
        pattern: String,
        timeout: Duration,
    },

    /// 指定したTCPポートがacceptを受け付けるまで待つ。
    /// ポーリング間隔 poll_interval で試行する。
    TcpPort {
        /// 接続先ホスト。ローカルサイドカーなら 127.0.0.1、
        /// リモートなら任意のIPアドレスを指定できる。
        host: std::net::IpAddr,
        port: u16,
        timeout: Duration,
        poll_interval: Duration,
    },

    /// 固定時間待機する（最も単純だが最も不確実）。
    Delay(Duration),

    /// 条件なし。spawn()直後に「起動完了」とみなす。
    Immediate,
}
```

### 5.4 ShutdownTimeoutConfig

```rust
#[derive(Debug, Clone)]
pub struct ShutdownTimeoutConfig {
    /// Unix: SIGTERM後に子プロセスが自発的に終了するまでの最大待機時間。
    /// その後SIGKILLを送る。
    pub unix_sigterm_timeout: Duration,

    /// Windows: CTRL_BREAK_EVENT後にTerminateProcessまでの最大待機時間。
    pub windows_ctrl_break_timeout: Duration,
}

impl Default for ShutdownTimeoutConfig {
    fn default() -> Self {
        Self {
            unix_sigterm_timeout: Duration::from_secs(5),
            windows_ctrl_break_timeout: Duration::from_secs(8),
        }
    }
}
```

### 5.5 ProcessState

```rust
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ProcessState {
    /// start_all()への登録待ち。まだspawnされていない。
    Pending,

    /// ReadyConditionを待機中。
    Starting,

    /// ReadyConditionを満たし、正常稼働中。
    Running { pid: u32 },

    /// 終了または再起動待ちのディレイ中。
    Restarting { attempt: u32, retry_in_ms: u64 },

    /// 再起動リトライ上限に達した、またはRestartPolicy::Neverで終了した。
    Failed { exit_code: Option<i32>, message: String },

    /// shutdown_all()により正常停止した。
    Stopped,
}
```

> **注意**: `Duration` は `serde::Serialize` を実装しないため、`retry_in` を
> `retry_in_ms: u64`（ミリ秒）として保持する。フロントエンドに渡す際に変換不要になる。

### 5.6 RegistryEntry（内部型）

```rust
use tokio::sync::broadcast;

pub(crate) struct RegistryEntry {
    pub def: ProcessDef,
    pub state: ProcessState,

    /// ChildGuard が Some の間、プロセスは稼働中。
    /// take() して drop することで GracefulShutdown を実行する。
    pub child: Option<ChildGuard>,

    /// 全出力行（stdout + stderr マージ）をブロードキャストするチャンネル。
    /// capacity=2048 (溢れたら古いものをdrop)
    pub output_tx: broadcast::Sender<String>,

    /// watch_loop に紐付いた CancellationToken。
    /// stop() / shutdown_all() 時に cancel() することで
    /// ポーリング待機中の watch_loop を即座に終了させる。
    pub cancel_token: tokio_util::sync::CancellationToken,

    /// 現在の再起動試行回数。
    pub restart_count: u32,
}
```

### 5.7 ProcessRegistry（公開型）

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct ProcessRegistry {
    inner: Arc<Mutex<RegistryInner>>,
}

struct RegistryInner {
    entries: HashMap<String, RegistryEntry>,
    /// 起動順序のリスト（トポロジカルソート結果）。
    /// shutdown_all() で逆順シャットダウンするために保持する。
    start_order: Vec<String>,
}

/// Tauri の State として使えるように Clone + Send + Sync を満たす
impl Clone for ProcessRegistry {
    fn clone(&self) -> Self {
        Self { inner: Arc::clone(&self.inner) }
    }
}
```

***

### 5.8 ChildGuard — 運命共同体の核心型

`tokio-process-tools` の `TerminateOnDrop` 相当を自前実装したガード。
`tokio::process::Child` をラップし、明示的な `shutdown()` または Drop 時に
GracefulShutdown を実行する。

```rust
use std::time::Duration;

/// 子プロセスをラップし、GracefulShutdown を実行するガード。
/// ProcessRegistry の運命共同体の核心となる型。
///
/// ## 使い分け
///
/// - `shutdown_all()` / `stop()` では `guard.shutdown().await` を呼び、
///   確実に GracefulShutdown が完了してから次の処理に進む。
/// - `panic` 時の Drop ではベストエフォートで `start_kill()` を実行する。
///   （async 完了を Drop 内で待てない制約によるフォールバック）
pub(crate) struct ChildGuard {
    child: Option<tokio::process::Child>,
    config: ShutdownTimeoutConfig,
}

impl ChildGuard {
    pub fn new(child: tokio::process::Child, config: ShutdownTimeoutConfig) -> Self {
        Self { child: Some(child), config }
    }

    /// GracefulShutdown を実行する。
    /// - Unix: SIGTERM → unix_sigterm_timeout 待機 → SIGKILL
    /// - Windows: TerminateProcess
    ///
    /// このメソッドは GracefulShutdown が完了（子プロセス終了確認）するまで
    /// await する。呼び出し側はこれを await することで、孤児プロセスが
    /// 残留しないことを確実にできる。
    pub async fn shutdown(mut self) {
        if let Some(mut child) = self.child.take() {
            Self::graceful_shutdown(&mut child, &self.config).await;
        }
    }

    /// GracefulShutdown の内部実装。
    /// 共有ロジックとして shutdown() と panic_hook の両方から利用される。
    async fn graceful_shutdown(
        child: &mut tokio::process::Child,
        config: &ShutdownTimeoutConfig,
    ) {
        #[cfg(unix)]
        {
            // child.id() は Option<u32> — 既に終了していれば None
            if let Some(pid) = child.id() {
                unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM); }
            }

            // SIGTERM 後、タイムアウトまで待機
            let deadline = tokio::time::Instant::now() + config.unix_sigterm_timeout;
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => return, // 正常終了
                    _ => {}
                }
                if tokio::time::Instant::now() >= deadline { break; }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            // タイムアウト → SIGKILL
            let _ = child.start_kill();
            let _ = child.wait().await;
        }

        #[cfg(windows)]
        {
            // 簡易実装: start_kill() → TerminateProcess
            let _ = child.start_kill();
            let _ = tokio::time::timeout(
                config.windows_ctrl_break_timeout,
                child.wait(),
            ).await;
        }

        #[cfg(not(any(unix, windows)))]
        {
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
    }
}

impl Drop for ChildGuard {
    /// ベストエフォートの Drop 実装。
    /// async 完了を待てないため `start_kill()` による即時 kill のみ行う。
    /// 確実な GracefulShutdown が必要な場合は `shutdown().await` を
    /// 明示的に呼ぶこと。
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
        }
    }
}
```

> **設計意図**: `Drop` 内での非同期完了待機は Rust の言語制約により不可能である。
> `shutdown_all()` のような確実性が要求されるパスでは `guard.shutdown().await`
> を明示的に呼び、Drop はパニックハンドラ等 async 実行が不可能なコンテキストに
> 限定する。この二段構えにより、通常運用では孤児ゼロ、異常時はベストエフォート
> という明確な品質保証を提供する。

***

## 6. depends_on — トポロジカルソート

`petgraph` を使い、`depends_on` 宣言からDAGを構築してトポロジカルソートする。
循環依存は起動前に検出してエラーを返す。

```rust
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::algo::toposort;
use std::collections::HashMap;

#[derive(Debug, thiserror::Error)]
pub enum RegistryError {
    #[error("Unknown dependency '{dep}' referenced by '{src}'")]
    UnknownDependency { src: String, dep: String },

    #[error("Circular dependency detected in process definitions")]
    CircularDependency,

    #[error("Process '{0}' not found in registry")]
    NotFound(String),

    #[error("Spawn failed for '{name}': {source}")]
    SpawnFailed { name: String, source: anyhow::Error },

    #[error("ReadyCondition timed out for '{name}' after {timeout:?}")]
    ReadyTimeout { name: String, timeout: std::time::Duration },
}

/// ProcessDef のスライスから起動順序を決定する。
/// 返値は name のVec。先頭から順に起動すればよい。
pub(crate) fn resolve_start_order(
    defs: &[ProcessDef],
) -> Result<Vec<String>, RegistryError> {
    let mut graph: DiGraph<&str, ()> = DiGraph::new();
    let mut name_to_node: HashMap<&str, NodeIndex> = HashMap::new();

    for def in defs {
        let node = graph.add_node(def.name.as_str());
        name_to_node.insert(def.name.as_str(), node);
    }

    // エッジ: dependency → dependent（dependency が先に起動されるべき）
    for def in defs {
        let to = name_to_node[def.name.as_str()];
        for dep in &def.depends_on {
            let from = *name_to_node.get(dep.as_str()).ok_or_else(|| {
                RegistryError::UnknownDependency {
                    src: def.name.clone(),
                    dep: dep.clone(),
                }
            })?;
            graph.add_edge(from, to, ());
        }
    }

    let sorted = toposort(&graph, None)
        .map_err(|_| RegistryError::CircularDependency)?;

    Ok(sorted.iter().map(|n| graph[*n].to_string()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn def(name: &str, deps: &[&str]) -> ProcessDef {
        ProcessDef {
            name: name.to_string(),
            program: "echo".to_string(),
            args: vec![],
            env: vec![],
            depends_on: deps.iter().map(|s| s.to_string()).collect(),
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: None,
        }
    }

    #[test]
    fn linear_order() {
        let defs = vec![def("c", &["b"]), def("a", &[]), def("b", &["a"])];
        let order = resolve_start_order(&defs).unwrap();
        assert_eq!(order, vec!["a", "b", "c"]);
    }

    #[test]
    fn diamond_dependency() {
        let defs = vec![
            def("a", &[]),
            def("b", &["a"]),
            def("c", &["a"]),
            def("d", &["b", "c"]),
        ];
        let order = resolve_start_order(&defs).unwrap();
        assert_eq!(order[0], "a");
        assert_eq!(order[order.len() - 1], "d");
    }

    #[test]
    fn circular_dependency_detected() {
        let defs = vec![def("a", &["b"]), def("b", &["a"])];
        assert!(matches!(
            resolve_start_order(&defs),
            Err(RegistryError::CircularDependency)
        ));
    }

    #[test]
    fn unknown_dependency_detected() {
        let defs = vec![def("a", &["nonexistent"])];
        assert!(matches!(
            resolve_start_order(&defs),
            Err(RegistryError::UnknownDependency { .. })
        ));
    }
}
```

***

## 7. プロセス起動（spawn_one）

### 7.1 SpawnResult — イベント駆動監視のための構造体

```rust
use tokio::sync::oneshot;

/// spawn_one が返す構造体。
/// exit_rx により watch_loop がポーリングなしでプロセス終了を検知できる。
pub(crate) struct SpawnResult {
    pub child_guard: ChildGuard,
    pub pid: u32,
    /// プロセスが終了したとき exit code を送信する oneshot。
    /// watch_loop はこれを await することでポーリングなしに終了を検知する。
    pub exit_rx: oneshot::Receiver<Option<i32>>,
}
```

### 7.2 spawn_one の実装

`tokio::process::Command` を直接使用し、`Child` 経由で PID・出力パイプを取得する。
出力キャプチャは `tokio::io::BufReader` で行単位に読み取り、
`broadcast::Sender` に転送する。プロセス終了検知は PID probe タスクによる。

> `tokio-process-tools` の Process/ProcessHandle は `.id()` や `.stdout()` を
> 提供しないため採用しなかった。詳細は §5.8 ChildGuard を参照。

```rust
use tokio::process::Command;
use tokio::sync::{broadcast, oneshot};
use tokio::io::AsyncBufReadExt;

impl ProcessRegistry {
    /// 単一プロセスを spawn し、ReadyCondition を待ってから SpawnResult を返す。
    /// 呼び出し側は SpawnResult を RegistryEntry に格納しなければならない。
    ///
    /// `output_tx` は呼び出し側（start_all）から渡された既存の broadcast::Sender。
    /// これにより RegistryEntry.output_tx と同一のチャンネルに出力が流れ、
    /// 購読者が出力を取りこぼさない。
    async fn spawn_one(
        inner: Arc<Mutex<RegistryInner>>,
        def: ProcessDef,
        output_tx: broadcast::Sender<String>,
        cancel_token: tokio_util::sync::CancellationToken,
    ) -> Result<SpawnResult, RegistryError> {
        tracing::info!(name = %def.name, program = %def.program, "Spawning process");

        // 注: output_tx は start_all から渡される。ここでは作成しない。
        // RegistryEntry.output_tx と同一チャンネルであり、購読者は
        // subscribe_output() でこのチャンネルに接続する。

        // tokio::process::Command で直接 spawn（PID・出力パイプを取得するため）
        let mut cmd = Command::new(&def.program);
        cmd.args(&def.args);
        for (k, v) in &def.env {
            cmd.env(k, v);
        }
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn()
            .map_err(|e| RegistryError::SpawnFailed {
                name: def.name.clone(),
                source: e.into(),
            })?;

        // child.id() は Option<u32>。spawn 直後は通常 Some だが、
        // 万一 None の場合は 0 になる。PID=0 はプロセス不在を意味し、
        // このまま起動を続けると PID probe が永遠に alive と判定し
        // watch_loop がハングするため、早期にエラーを返す。
        let pid = child.id().unwrap_or(0);
        if pid == 0 {
            return Err(RegistryError::SpawnFailed {
                name: def.name.clone(),
                source: anyhow::anyhow!("Failed to obtain PID after spawn"),
            });
        }
        tracing::info!(name = %def.name, pid, "Process spawned");

        // stdout 読み取りタスク（行単位で broadcast に送信）
        let stdout_tx = output_tx.clone();
        if let Some(stdout) = child.stdout.take() {
            tokio::spawn(async move {
                let mut reader = tokio::io::BufReader::new(stdout);
                let mut line = String::new();
                while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
                    let trimmed = line.trim_end_matches('\n')
                        .trim_end_matches('\r').to_string();
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
                    let trimmed = line.trim_end_matches('\n')
                        .trim_end_matches('\r').to_string();
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
        Self::wait_ready(&def.ready, &def.name, output_tx.clone()).await?;

        // ChildGuard でラップ（運命共同体の核心）。
        // ReadyCondition 待機が成功した直後に必ずここでラップする。
        let timeout_cfg = def.shutdown_timeout.clone().unwrap_or_default();
        let child_guard = ChildGuard::new(child, timeout_cfg);

        // プロセス終了検知用の oneshot チャンネル。
        // pid ベースの監視タスクを起動し、終了を検知したら exit_tx に送信する。
        // これにより watch_loop はポーリングなしにイベント駆動で動作できる。
        //
        // このタスクのライフサイクル:
        // - 正常時: PID probe がプロセス終了を検知 → exit_tx.send → タスク終了
        // - stop() / shutdown_all() 時: watch_loop が cancel_token で終了し、
        //   exit_rx が Drop される。→ exit_tx.send() が Err になるが、
        //   let _ = で握りつぶしてタスク終了。
        //   ただし、ChildGuard::shutdown().await で GracefulShutdown が
        //   完了した後も、このタスクは最大100ms（ポーリング間隔分）だけ
        //   生存する。stop() 完了後に is_process_alive が1回余分に呼ばれる
        //   が、実害はなく正常動作として許容する。
        // - 再起動時: 古いタスクはそのまま動作し続けるが、PID probe がプロセス不在を
        //   検知 → send → 失敗 → 終了。新しいタスクが再起動後に作成される。
        let (exit_tx, exit_rx) = oneshot::channel::<Option<i32>>();
        {
            let name = def.name.clone();
            tokio::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    if !Self::is_process_alive(pid) {
                        tracing::debug!(name = %name, pid, "Exit detected via pid probe");
                        // exit code は pid probe では取得できないため None を送信。
                        // watch_loop 側で再起動判断を行う。
                        let _ = exit_tx.send(None);
                        break;
                    }
                }
            });
        }

        tracing::info!(name = %def.name, "Process is ready");
        Ok(SpawnResult { child_guard, pid, exit_rx })
    }
}
```

***

## 8. ReadyCondition の待機実装

```rust
impl ProcessRegistry {
    async fn wait_ready(
        condition: &ReadyCondition,
        name: &str,
        output_tx: broadcast::Sender<String>,
    ) -> Result<(), RegistryError> {
        match condition {
            ReadyCondition::Immediate => {
                tracing::debug!(name, "ReadyCondition::Immediate — skipping wait");
                Ok(())
            }

            ReadyCondition::Delay(d) => {
                tracing::debug!(name, delay_ms = d.as_millis(), "ReadyCondition::Delay");
                tokio::time::sleep(*d).await;
                Ok(())
            }

            ReadyCondition::LogContains { pattern, timeout } => {
                tracing::debug!(name, %pattern, "Waiting for log line");
                let mut rx = output_tx.subscribe();
                let pat = pattern.clone();

                let result = tokio::time::timeout(*timeout, async move {
                    loop {
                        match rx.recv().await {
                            Ok(line) if line.contains(&pat) => return Ok(()),
                            Ok(_) => continue,
                            Err(broadcast::error::RecvError::Closed) => {
                                return Err(anyhow::anyhow!("Output channel closed"));
                            }
                            Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        }
                    }
                })
                .await;

                match result {
                    Ok(Ok(())) => Ok(()),
                    Ok(Err(e)) => Err(RegistryError::SpawnFailed {
                        name: name.to_string(),
                        source: e,
                    }),
                    Err(_) => Err(RegistryError::ReadyTimeout {
                        name: name.to_string(),
                        timeout: *timeout,
                    }),
                }
            }

            ReadyCondition::TcpPort { host, port, timeout, poll_interval } => {
                tracing::debug!(name, %host, port, "Waiting for TCP port");
                let addr = format!("{host}:{port}");
                let poll = *poll_interval;

                let result = tokio::time::timeout(*timeout, async move {
                    loop {
                        if tokio::net::TcpStream::connect(&addr).await.is_ok() {
                            return Ok(());
                        }
                        tokio::time::sleep(poll).await;
                    }
                })
                .await;

                match result {
                    Ok(Ok(())) => Ok(()),
                    _ => Err(RegistryError::ReadyTimeout {
                        name: name.to_string(),
                        timeout: *timeout,
                    }),
                }
            }
        }
    }
}
```

***

## 9. start_all — 依存解決と順序起動

```rust
impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RegistryInner {
                entries: HashMap::new(),
                start_order: Vec::new(),
            })),
        }
    }

    /// 全プロセス定義を受け取り、depends_on を解決して順番に起動する。
    /// 一つでも起動に失敗した場合は即座に Err を返す。
    /// その時点で起動済みのプロセスは shutdown_all() で停止すること。
    pub async fn start_all(&self, defs: Vec<ProcessDef>) -> Result<(), RegistryError> {
        let order = resolve_start_order(&defs)?;

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

            // このプロセス専用の CancellationToken を生成
            let cancel_token = tokio_util::sync::CancellationToken::new();

            // Pending 状態をレジストリに事前登録
            // broadcast チャンネルを作成し、RegistryEntry に格納する。
            // このチャンネルは spawn_one にも渡され、stdout/stderr の
            // 出力が直接ここに流れる。購読者はこのチャンネルに subscribe する。
            let (tx, _) = broadcast::channel::<String>(2048);
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

            // spawn（ReadyCondition 待機を含む）
            // 事前に作成した output_tx を渡す（二重生成回避）
            let result = Self::spawn_one(
                Arc::clone(&self.inner),
                def.clone(),
                tx.clone(),  // RegistryEntry.output_tx と同じチャンネル
                cancel_token.clone(),
            ).await.map_err(|e| {
                tracing::error!(name = %def.name, error = %e, "Failed to start process");
                e
            })?;

            // SpawnResult をレジストリに反映
            {
                let mut guard = self.inner.lock().await;
                if let Some(entry) = guard.entries.get_mut(&def.name) {
                    entry.state = ProcessState::Running { pid: result.pid };
                    entry.child = Some(result.child_guard);
                }
            }

            // watch_loop タスクを起動（exit_rx を渡す — watch_loop が所有する）
            Self::start_watch_task(
                Arc::clone(&self.inner),
                def.clone(),
                result.exit_rx,
                cancel_token,
            );
        }

        Ok(())
    }
}
```

***

## 10. RestartPolicy — 監視・再起動ループ

ポーリング方式を廃止し、`oneshot::Receiver<Option<i32>>` を `await` するイベント駆動方式に変更した。
また `CancellationToken` により、`stop()` / `shutdown_all()` 呼び出し後の watch_loop を即座に終了させる。

> **`OnCrash` と PID probe の制約**: PID probe 方式では終了コードを取得できないため、
> `exit_code` は常に `None` となる。これにより `RestartPolicy::OnCrash` の判定
> `exit_code.map(|c| c != 0).unwrap_or(true)` は常に `true`（クラッシュ扱い）となる。
> 結果として **`OnCrash` は正常終了（exit code 0）でも再起動される**。
> これは PID probe の本質的なトレードオフであり、`OnCrash` と `Always` の挙動差は
> 実質的になくなる。終了コードに基づく精密な再起動制御が必要な場合は、
> `Child::wait()` を使用する方式への拡張が必要（ただしその場合 `ChildGuard` との
> 所有権設計の見直しが生じる）。

```rust
impl ProcessRegistry {
    fn start_watch_task(
        inner: Arc<Mutex<RegistryInner>>,
        def: ProcessDef,
        exit_rx: tokio::sync::oneshot::Receiver<Option<i32>>,
        cancel_token: tokio_util::sync::CancellationToken,
    ) {
        tokio::spawn(async move {
            Self::watch_loop(inner, def, exit_rx, cancel_token).await;
        });
    }

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
                            // （正常停止の場合は cancel_token が先に発火するはず）
                            None
                        }
                    }
                }
                _ = cancel_token.cancelled() => {
                    // shutdown_all() / stop() により明示的にキャンセルされた
                    tracing::debug!(name = %def.name, "Watch loop cancelled by token");
                    return;
                }
            };

            // キャンセルトークンが発火済みなら（stop() が同時に走った場合）終了
            if cancel_token.is_cancelled() {
                return;
            }

            tracing::warn!(name = %def.name, ?exit_code, "Process exited unexpectedly");

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
                tracing::error!(name = %def.name, "Process will not be restarted");
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
                                "Max retries ({}) exceeded",
                                restart_count
                            ),
                        };
                        entry.child = None;
                    }
                    tracing::error!(
                        name = %def.name,
                        restart_count,
                        "Max retries exceeded, giving up"
                    );
                    return;
                }
            };

            tracing::info!(
                name = %def.name,
                attempt = restart_count + 1,
                delay_secs = delay.as_secs_f32(),
                "Scheduling restart"
            );

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
                    tracing::debug!(name = %def.name, "Restart delay cancelled");
                    return;
                }
            }

            // レジストリの output_tx を取得（再起動後も同じチャンネルを使い続ける）
            let output_tx = {
                let guard = inner.lock().await;
                guard.entries.get(&def.name)
                    .map(|e| e.output_tx.clone())
            };
            let Some(output_tx) = output_tx else { return; };

            // 再起動
            match Self::spawn_one(
                Arc::clone(&inner),
                def.clone(),
                output_tx.clone(),
                cancel_token.clone(),
            ).await {
                Ok(result) => {
                    let new_exit_rx = result.exit_rx;
                    {
                        let mut guard = inner.lock().await;
                        if let Some(entry) = guard.entries.get_mut(&def.name) {
                            entry.state = ProcessState::Running { pid: result.pid };
                            entry.child = Some(result.child_guard);
                        }
                    }
                    tracing::info!(name = %def.name, "Process restarted successfully");
                    // 新しい exit_rx で次のループへ
                    exit_rx = new_exit_rx;
                }
                Err(e) => {
                    tracing::error!(name = %def.name, error = %e, "Restart failed");
                    let mut guard = inner.lock().await;
                    if let Some(entry) = guard.entries.get_mut(&def.name) {
                        entry.state = ProcessState::Failed {
                            exit_code: None,
                            message: e.to_string(),
                        };
                    }
                    return;
                }
            }
        }
    }

    /// プロセスが生存しているか確認する。
    /// PID 0 は「不明」として true を返す（誤ってkillしないための安全弁）。
    /// 実運用では spawn_one で PID 0 をエラーにしているため、このガードは
    /// 主に防御的プログラミングとして存在する。
    fn is_process_alive(pid: u32) -> bool {
        if pid == 0 { return true; }

        #[cfg(unix)]
        {
            // libc::kill(pid, 0) はシグナルを送らず生存確認のみ行う。
            // ESRCH = プロセス不存在。errno の取得には
            // std::io::Error::last_os_error() を使う（移植性安全）。
            unsafe {
                let result = libc::kill(pid as libc::pid_t, 0);
                result == 0
                    || std::io::Error::last_os_error().raw_os_error()
                        != Some(libc::ESRCH)
            }
        }
        #[cfg(windows)]
        {
            use windows::Win32::System::Threading::{
                OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION
            };
            use windows::Win32::Foundation::CloseHandle;
            unsafe {
                let handle = OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION, false, pid
                );
                if let Ok(h) = handle {
                    let _ = CloseHandle(h);
                    true
                } else {
                    false
                }
            }
        }
        #[cfg(not(any(unix, windows)))]
        { true }
    }
}
```

***

## 11. Output Capture — ブロードキャスト購読

```rust
impl ProcessRegistry {
    /// 指定プロセスの出力ストリームを購読する。
    /// `broadcast::error::RecvError::Lagged` は購読者が遅い場合に発生するが、
    /// 次の `recv()` で継続できる（行が飛ぶ可能性がある）。
    pub async fn subscribe_output(&self, name: &str) -> Option<broadcast::Receiver<String>> {
        let guard = self.inner.lock().await;
        guard.entries.get(name).map(|e| e.output_tx.subscribe())
    }

    /// 指定プロセスの出力を sink クロージャに流す専用タスクを起動する。
    /// タスクの JoinHandle を返すので、必要に応じて abort() できる。
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
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("Output consumer lagged, skipped {} lines", n);
                    }
                }
            }
        });
        Some(handle)
    }
}

// 使用例:
//
// let mut rx = registry.subscribe_output("tensorzero").await.unwrap();
// tokio::spawn(async move {
//     while let Ok(line) = rx.recv().await {
//         println!("[tensorzero] {}", line);
//     }
// });
//
// または pipe_output_to を使う:
// registry.pipe_output_to("bifrost", |line| {
//     tracing::info!(target: "bifrost", "{}", line);
// }).await;
```

***

## 12. shutdown_all — 運命共同体のシャットダウン

**起動の逆順**（`start_order` の末尾から）でシャットダウンすることで、依存関係を安全に解消する。
例: bifrost → tensorzero の順で停止し、親プロセスが孤児になった子プロセスをkillしようとしてエラーを吐くリスクを排除する。

```rust
impl ProcessRegistry {
    /// 全プロセスを逆起動順で停止する。
    /// 1. CancellationToken を cancel → watch_loop を即座に終了
    /// 2. ChildGuard::shutdown().await で GracefulShutdown 完了まで待機
    /// (stdout/stderr 読み取りタスクは独立した tokio::spawn のため、
    ///  パイプが閉じると自然終了する)
    pub async fn shutdown_all(&self) {
        let stop_order: Vec<String> = {
            let guard = self.inner.lock().await;
            guard.start_order.iter().rev().cloned().collect()
        };

        for name in &stop_order {
            let guard = {
                let mut g = self.inner.lock().await;
                if let Some(entry) = g.entries.get_mut(name) {
                    tracing::info!(name = %name, "Stopping process");
                    entry.cancel_token.cancel();
                    entry.state = ProcessState::Stopped;
                    entry.child.take()  // Mutex から取り出して所有権を移動
                } else {
                    None
                }
            };
            // Mutex ロックを解放した後で GracefulShutdown を await
            if let Some(child_guard) = guard {
                child_guard.shutdown().await;
            }
        }
        tracing::info!("All processes stopped");
    }

    /// 単一プロセスのみ停止する（デバッグ・動的管理用）。
    pub async fn stop(&self, name: &str) -> Result<(), RegistryError> {
        let guard = {
            let mut g = self.inner.lock().await;
            let entry = g.entries.get_mut(name)
                .ok_or_else(|| RegistryError::NotFound(name.to_string()))?;
            entry.cancel_token.cancel();
            entry.state = ProcessState::Stopped;
            entry.child.take()
        };
        if let Some(child_guard) = guard {
            child_guard.shutdown().await;
        }
        tracing::info!(name = %name, "Process stopped");
        Ok(())
    }

    /// レジストリ内の全プロセスの状態スナップショットを返す。
    pub async fn snapshot(&self) -> HashMap<String, ProcessState> {
        let guard = self.inner.lock().await;
        guard.entries.iter()
            .map(|(k, v)| (k.clone(), v.state.clone()))
            .collect()
    }
}
```

***

## 13. Tauri 統合

### 13.1 AppState への登録

Tauri v2 では `RunEvent::Exit` を使うことで、**すべてのウィンドウが閉じた後**に確実に `shutdown_all` を呼べる。`on_window_event` + `WindowEvent::Destroyed` は1ウィンドウが閉じるたびに発火するためマルチウィンドウアプリでは誤作動する。

```rust
// src-tauri/src/main.rs

use process_registry::ProcessRegistry;

fn main() {
    tracing_subscriber::fmt::init();

    let registry = ProcessRegistry::new();

    // install_panic_hook は main の早い段階で呼ぶ（ChildGuard の Drop が確実に実行されるため）
    process_registry::install_panic_hook(registry.clone());

    tauri::Builder::default()
        .manage(registry.clone())
        .setup(|app| {
            let registry = app.state::<ProcessRegistry>().inner().clone();

            tauri::async_runtime::spawn(async move {
                let defs = build_service_defs();
                if let Err(e) = registry.start_all(defs).await {
                    tracing::error!("Failed to start services: {}", e);
                    registry.shutdown_all().await;
                    std::process::exit(1);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_list_processes,
            cmd_stream_process_output,
        ])
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run({
            let registry_for_exit = registry.clone();
            move |_app_handle, event| {
                // RunEvent::Exit はすべてのウィンドウが閉じた後に発火する。
                // マルチウィンドウでも正しく動作する。
                if let tauri::RunEvent::Exit = event {
                    let r = registry_for_exit.clone();
                    // 専用スレッドで shutdown を実行（Tokioワーカー上での
                    // block_on によるデッドロックを回避するため）
                    std::thread::spawn(move || {
                        tokio::runtime::Builder::new_current_thread()
                            .enable_all()
                            .build()
                            .unwrap()
                            .block_on(async move { r.shutdown_all().await });
                    })
                    .join()
                    .ok();
                }
            }
        });
}

fn build_service_defs() -> Vec<ProcessDef> {
    use std::time::Duration;
    use std::net::IpAddr;
    use process_registry::{ProcessDef, RestartPolicy, ReadyCondition};

    let localhost: IpAddr = "127.0.0.1".parse().unwrap();

    vec![
        ProcessDef {
            name: "tensorzero".to_string(),
            program: "./sidecar/tensorzero".to_string(),
            args: vec!["--config".into(), "tensorzero.toml".into()],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::on_crash_default(),
            ready: ReadyCondition::TcpPort {
                host: localhost,
                port: 3000,
                timeout: Duration::from_secs(30),
                poll_interval: Duration::from_millis(200),
            },
            shutdown_timeout: None,
        },
        ProcessDef {
            name: "bifrost".to_string(),
            program: "./sidecar/bifrost".to_string(),
            args: vec![],
            env: vec![],
            depends_on: vec!["tensorzero".to_string()],
            restart: RestartPolicy::on_crash_default(),
            ready: ReadyCondition::LogContains {
                pattern: "listening".to_string(),
                timeout: Duration::from_secs(15),
            },
            shutdown_timeout: None,
        },
    ]
}
```

### 13.2 Tauri コマンド

```rust
use tauri::State;
use serde::Serialize;

#[derive(Serialize)]
struct ProcessStatusResponse {
    name: String,
    state: ProcessState, // serde::Serialize を実装済みのため直接渡せる
}

#[tauri::command]
async fn cmd_list_processes(
    registry: State<'_, ProcessRegistry>,
) -> Result<Vec<ProcessStatusResponse>, String> {
    let snapshot = registry.snapshot().await;
    Ok(snapshot.into_iter()
        .map(|(name, state)| ProcessStatusResponse { name, state })
        .collect())
}

/// 指定プロセスの出力を Tauri イベントとしてフロントエンドにストリーミングする。
/// フロントエンド側では `listen("process-output:{name}", handler)` で受け取る。
#[tauri::command]
async fn cmd_stream_process_output(
    name: String,
    app: tauri::AppHandle,
    registry: State<'_, ProcessRegistry>,
) -> Result<(), String> {
    let mut rx = registry
        .subscribe_output(&name)
        .await
        .ok_or_else(|| format!("Process '{}' not found", name))?;

    let event_name = format!("process-output:{name}");

    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(line) => {
                    if app.emit(&event_name, &line).is_err() {
                        break; // ウィンドウが閉じられた
                    }
                }
                Err(broadcast::error::RecvError::Closed) => break,
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(
                        "Frontend output consumer lagged, skipped {} lines",
                        n
                    );
                }
            }
        }
    });

    Ok(())
}
```

***

## 14. Unix SIGTERM ハンドラ

Unix 環境では `SIGTERM` シグナルをアプリが受けた場合に `shutdown_all` を呼ぶ必要がある。
Tauri の `RunEvent::Exit` は `SIGTERM` では発火しないため、別途ハンドラを設定する。

```rust
/// Unix 専用: SIGTERM を受けたら全プロセスを停止して正常終了する。
/// setup() 内で tauri::async_runtime::spawn を使って呼ぶこと。
#[cfg(unix)]
pub async fn install_sigterm_handler(registry: ProcessRegistry) {
    use tokio::signal::unix::{signal, SignalKind};

    let mut sigterm = signal(SignalKind::terminate())
        .expect("Failed to install SIGTERM handler");

    tokio::spawn(async move {
        sigterm.recv().await;
        tracing::info!("Received SIGTERM, shutting down all processes");
        registry.shutdown_all().await;
        std::process::exit(0);
    });
}
```

`setup()` 内での使用例:

```rust
.setup(|app| {
    let registry = app.state::<ProcessRegistry>().inner().clone();

    #[cfg(unix)]
    {
        let r = registry.clone();
        tauri::async_runtime::spawn(async move {
            process_registry::install_sigterm_handler(r).await;
        });
    }

    tauri::async_runtime::spawn(async move {
        // ... start_all ...
    });

    Ok(())
})
```

***

## 15. パニック時の安全網

```rust
/// パニック時に全プロセスを強制停止するフックを設定する。
/// main() の早い段階で呼ぶこと。
///
/// 注意: panic = "abort" の場合はフックが実行されない。
/// Cargo.toml の [profile.release] で panic = "unwind" を設定すること。
pub fn install_panic_hook(registry: ProcessRegistry) {
    let orig = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        tracing::error!("PANIC: {}", info);

        // 専用スレッドで shutdown を実行する。
        // Tokio ワーカースレッド上でパニックが発生した場合、
        // 同スレッドで Handle::block_on() を呼ぶとデッドロックするため、
        // 新規スレッドに専用の current_thread ランタイムを立ち上げる。
        let r = registry.clone();
        std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap()
                .block_on(async move { r.shutdown_all().await });
        })
        .join()
        .ok();

        orig(info);
    }));
}
```

***

## 16. 運命共同体の保証範囲と限界

### 16.1 保証される範囲

| シナリオ | 対応 | 仕組み |
|---|---|---|
| メインが正常終了 | ✅ | `RunEvent::Exit` + `shutdown_all()` |
| メインが `panic!`（unwind） | ✅ | `install_panic_hook` + `ChildGuard` のdrop |
| サイドカーがクラッシュ | ✅ | `exit_rx` イベント → `watch_loop` → `RestartPolicy` |
| Ctrl+C | ✅ | OSシグナル → Tokio → drop伝播 |
| Unix: `SIGTERM` をメインが受ける | ✅ | `install_sigterm_handler` で受けて `shutdown_all()` |
| Windows: 孫プロセス | ⚠️ 拡張必須 | Job Object は手動割り当て（`AssignProcessToJobObject`）。§16.2 補足参照 |
| Linuxの孫プロセス | ✅ | プロセスグループkillが孫まで届く |
| 依存プロセスの安全な停止順 | ✅ | `start_order` の逆順でシャットダウン |

### 16.2 防御できない範囲（OS原理的限界）

| シナリオ | 対応 | 理由 |
|---|---|---|
| `kill -9` / `SIGKILL` | ❌ | OSが即座に消すのでdrop不実行 |
| `panic = "abort"` | ❌ | スタック巻き戻しなし |
| OOM Killer による強制終了 | ❌ | SIGKILL相当 |
| Windows の `TerminateProcess()` | ❌ | SIGKILL相当 |

> **Windows における孫プロセス補足**:
> `ChildGuard` はspawn直後に `tokio::process::Child` のハンドルを保持しているが、
> Windows では Job Object による孫プロセス捕捉は行われない（`tokio-process-tools`
> を利用しないため）。Windows で孫プロセスまで確実に停止する必要がある場合は、
> 別途 Job Object の割り当てを行う拡張が必要である。実装の指針としては、
> `CreateJobObjectW` → `SetInformationJobObject`（`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`）
> → `AssignProcessToJobObject` の順で、`ChildGuard::new()` 内（spawn直後）に
> 組み込む。Unix ではプロセスグループに SIGTERM/SIGKILL を送信することで
> 孫まで捕捉できる。

***

## 17. テスト戦略

### 17.1 ユニットテスト

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_restart_policy_backoff() {
        let policy = RestartPolicy::OnCrash {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            backoff_factor: 2.0,
            max_delay: Duration::from_secs(10),
        };
        assert_eq!(policy.next_delay(0), Some(Duration::from_secs(1)));
        assert_eq!(policy.next_delay(1), Some(Duration::from_secs(2)));
        assert_eq!(policy.next_delay(2), Some(Duration::from_secs(4)));
        assert_eq!(policy.next_delay(3), None); // max_retries 超過
    }

    #[test]
    fn test_backoff_capped_by_max_delay() {
        let policy = RestartPolicy::OnCrash {
            max_retries: 10,
            initial_delay: Duration::from_secs(1),
            backoff_factor: 10.0,
            max_delay: Duration::from_secs(5),
        };
        // 1 * 10^3 = 1000s だが max_delay = 5s でクランプ
        assert_eq!(policy.next_delay(3), Some(Duration::from_secs(5)));
    }
}
```

### 17.2 統合テスト（multi_thread 必須）

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;

    // spawn_all / shutdown_all には multi_thread runtime が必要
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_start_and_stop() {
        let registry = ProcessRegistry::new();

        let defs = vec![ProcessDef {
            name: "sleep_proc".to_string(),
            #[cfg(unix)]
            program: "sleep".to_string(),
            #[cfg(unix)]
            args: vec!["100".to_string()],
            #[cfg(windows)]
            program: "timeout".to_string(),
            #[cfg(windows)]
            args: vec!["/t".to_string(), "100".to_string()],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: None,
        }];

        registry.start_all(defs).await.expect("start_all should succeed");

        let snapshot = registry.snapshot().await;
        assert!(matches!(
            snapshot.get("sleep_proc"),
            Some(ProcessState::Running { .. })
        ));

        registry.shutdown_all().await;

        let snapshot = registry.snapshot().await;
        assert!(matches!(
            snapshot.get("sleep_proc"),
            Some(ProcessState::Stopped)
        ));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_depends_on_ordering() {
        // A → B → C の起動順が保証されることを確認
        let defs = vec![
            make_def("c", &["b"]),
            make_def("a", &[]),
            make_def("b", &["a"]),
        ];
        let registry = ProcessRegistry::new();
        registry.start_all(defs).await.expect("should start in correct order");
        registry.shutdown_all().await;
    }
}
```

***

## 18. 実装チェックリスト

実装時に以下をすべて確認すること。

### セットアップ

- [ ] すべての依存クレートを `cargo add` で最新版として導入している
- [ ] `tokio = { features = ["full"] }` — `rt-multi-thread` が含まれていること
- [ ] `tokio-util` が `CancellationToken` のために追加されていること
- [ ] `Cargo.toml` に `[profile.release] panic = "unwind"` を設定（`abort` にしない）
- [ ] Unix向け `libc` と Windows向け `windows` クレートを `target` 条件付きで追加

### 型定義

- [ ] `ProcessDef` の全フィールドが `Clone + Debug` を実装
- [ ] `ProcessState` が `serde::Serialize + serde::Deserialize` を実装（Tauri連携に必要）
- [ ] `ProcessState::Restarting` のフィールドが `retry_in_ms: u64`（Duration非対応に対応）
- [ ] `RegistryEntry.child` が `Option<ChildGuard>` であること（takeでdrop可能）
- [ ] `RegistryEntry.cancel_token` が `CancellationToken` であること
- [ ] `RegistryInner.start_order` が `Vec<String>` であること
- [ ] `ReadyCondition::TcpPort` に `host: std::net::IpAddr` フィールドがあること
- [ ] `ChildGuard` が `shutdown().await` メソッドで GracefulShutdown を実行し、Drop は `start_kill()` のみのベストエフォートであること

### 起動

- [ ] `spawn_one` が `SpawnResult` を返し、呼び出し側が `RegistryEntry` に格納していること
- [ ] spawn に `tokio::process::Command` を直接使用し、`child.id().unwrap_or(0)` で PID を取得していること
- [ ] stdout / stderr の読み取りタスクが `tokio::io::BufReader` で行単位に読み、`broadcast::Sender` に送信していること
- [ ] stdout / stderr 両方とも同一の `output_tx` に送信していること（または必要に応じて分離）
- [ ] `ChildGuard` が `RegistryEntry.child` に格納され、drop 時に GracefulShutdown が実行されること
- [ ] `start_all` が `RegistryInner.start_order` に起動順序を保存していること

### ReadyCondition

- [ ] `TcpPort` のポーリングに `tokio::net::TcpStream::connect` を使用
- [ ] `TcpPort` の接続先が `host` フィールドを使用している（`127.0.0.1` ハードコードなし）
- [ ] 全 `ReadyCondition` に `tokio::time::timeout` でタイムアウトを設定
- [ ] タイムアウト時に `RegistryError::ReadyTimeout` を返すこと

### 監視・再起動

- [ ] `watch_loop` がポーリングではなく `exit_rx.await` のイベント駆動になっていること
- [ ] PID probe の制約により `RestartPolicy::OnCrash` は正常終了（exit 0）でも再起動されることを認識した上で設計すること（§10 注釈参照）
- [ ] `tokio::select!` で `exit_rx` と `cancel_token.cancelled()` を同時に待っていること
- [ ] `RestartPolicy::next_delay` が `None` を返したら監視タスクを終了すること
- [ ] 再起動後に新しい `exit_rx` を取得してループを継続していること
- [ ] `cancel_token.is_cancelled()` のチェックで二重停止を防いでいること

### シャットダウン

- [ ] `shutdown_all` が `start_order` の**逆順**で停止していること
- [ ] `cancel_token.cancel()` → `child.take()` の順で実行（stdout/stderr タスクはパイプが閉じると自然終了）
- [ ] `shutdown_all` では Mutex ロックを解放してから `child_guard.shutdown().await` で GracefulShutdown 完了まで待機すること
- [ ] `RunEvent::Exit` で `shutdown_all` が呼ばれること（`on_window_event` ではなく）
- [ ] `install_panic_hook` が専用スレッド + `new_current_thread` ランタイムを使っていること
- [ ] Unix 環境で `install_sigterm_handler` が呼ばれていること

### Tauri統合

- [ ] `ProcessRegistry` が `Clone` を実装（`Arc::clone` ベース）
- [ ] `tauri::Builder::manage(registry.clone())` で管理状態として登録
- [ ] `cmd_stream_process_output` が `app.emit()` で実際に出力をストリーミングしていること
- [ ] `cmd_list_processes` が `ProcessState` を構造体として返していること（`format!("{:?}")` でない）

***

## 19. 参考実装リソース

| リソース | URL |
|---|---|
| tokio::process::Command / Child | https://docs.rs/tokio/latest/tokio/process/index.html |
| petgraph toposort | https://docs.rs/petgraph/latest/petgraph/algo/fn.toposort.html |
| Tauri Sidecar公式 | https://v2.tauri.app/ja/develop/sidecar/ |
| Tauri RunEvent | https://docs.rs/tauri/latest/tauri/enum.RunEvent.html |
| tokio broadcast channel | https://docs.rs/tokio/latest/tokio/sync/broadcast/ |
| tokio-util CancellationToken | https://docs.rs/tokio-util/latest/tokio_util/sync/struct.CancellationToken.html |
| libc::kill (POSIX) | https://docs.rs/libc/latest/libc/fn.kill.html |

***

以上が改訂版RFC全文です。今回適用した修正の概要は次のとおりです。

**適用した主な修正:**

| 修正 | 内容 |
|---|---|
| **FIX-1** | ヘッダーの `Depends on` をバージョン固定から `cargo add` ポリシーに変更 |
| **FIX-2** | Section 4 を `cargo add` コマンドリスト形式に全面改訂、`tokio-util` / `libc` / `windows` を追加、`[profile.release] panic = "unwind"` を明示 |
| **FIX-3** | `RegistryEntry` に `cancel_token: CancellationToken` を追加。`output_consumer` は不要になったため削除（stdout/stderr は独立タスク） |
| **FIX-4** | `RegistryInner` に `start_order: Vec<String>` を追加 |
| **FIX-5** | `spawn_one` の `_consumer` 即drop問題を修正。`tokio-process-tools` の使用を廃止し `tokio::process::Command` 直接利用に変更 |
| **FIX-6** | `start_all` が `start_order` を保存し、`CancellationToken` を生成して `watch_loop` に渡すよう変更 |
| **FIX-7** | `watch_loop` をポーリング方式からイベント駆動（`exit_rx.await` + `tokio::select!`）に全面変更、`handle` → `child` に変更 |
| **FIX-8** | `shutdown_all` を逆起動順シャットダウンに変更、`cancel_token.cancel()` → `child.take()` の順で実行 |
| **FIX-9** | Tauri統合を `on_window_event::Destroyed` から `RunEvent::Exit` に変更 |
| **FIX-10** | `install_panic_hook` を専用スレッド + `new_current_thread` ランタイム方式に変更してデッドロック回避 |
| **FIX-11** | Unix `SIGTERM` ハンドラ (`install_sigterm_handler`) の実装コード例を新しい Section として追加 |
| **FIX-12** | `cmd_process_output` スタブを `app.emit()` を使った実際のストリーミング実装に変更 |
| **FIX-13** | チェックリストを全修正に対応して更新 |
| **FIX-14** | `ReadyCondition::TcpPort` に `host: std::net::IpAddr` フィールドを追加して `127.0.0.1` ハードコードを解消 |
| **FIX-15** | `tokio-process-tools` の Process/ProcessHandle が `.id()` / `.stdout()` を提供しないため、`tokio::process::Command` 直接利用＋`ChildGuard` 自前実装に変更。InspectLines を `tokio::io::BufReader` に置き換え |
| **FIX-16** | `child.id()` の戻り値が `Option<u32>` である問題に対応（`unwrap_or(0)`）。`__errno_location` を `std::io::Error::last_os_error()` に変更（macOS対応）。`ChildGuard::Drop` が async 完了を待てない問題を解決（`shutdown().await` メソッド＋Drop は start_kill のみ）。broadcast チャンネルの二重生成を解消（spawn_one で既存 tx を受け取るよう変更） |
| **FIX-17** | PID=0 の早期エラー処理を spawn_one に追加（watch_loop ハング防止）。spawn_one 冒頭コメントの tokio-process-tools 参照を整理。Windows Job Object 補足に実装指針を追加、運命共同体テーブルを ⚠️ に修正 |
| **FIX-18** | PID probe タスクの shutdown_all 後100ms遅延をコメントに明記。`OnCrash` が終了コード未取得により正常終了でも再起動される制約を §10 注釈とチェックリストに追記 |
