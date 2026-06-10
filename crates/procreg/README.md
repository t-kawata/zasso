# process-registry

**クロスプラットフォームサイドカープロセスマネージャ**

`process-registry` は、Rust アプリケーションが子プロセス（サイドカー）を宣言的に起動・監視・停止するためのライブラリです。`tokio::process::Command` を基盤とし、名前付きプロセスレジストリ・依存関係解決・自動再起動・Graceful Shutdown を提供します。

---

## 特徴

- **名前付きプロセスレジストリ** — プロセスに名前を付けて管理。`HashMap<String, Entry>` ベース
- **依存関係解決** — `depends_on` で指定した起動順序を DAG トポロジカルソートで自動決定
- **再起動ポリシー** — `Never / OnCrash / Always` + 指数バックオフ
- **出力キャプチャ** — stdout/stderr を `broadcast` チャンネルで購読可能
- **Graceful Shutdown** — Unix は SIGTERM → 待機 → SIGKILL、Windows は TerminateProcess
- **パニック安全網** — パニック時に全子プロセスを自動停止
- **クロスプラットフォーム** — macOS / Linux / Windows で同一 API

---

## クイックスタート

### 依存関係の追加

```toml
# Cargo.toml
[dependencies]
process-registry = "0.1.0"
tokio = { version = "1", features = ["full"] }
```

### 最小限の使用例

```rust,no_run
use process_registry::*;
use std::time::Duration;

#[tokio::main]
async fn main() {
    // 1. レジストリを作成
    let registry = ProcessRegistry::new();

    // 2. プロセス定義を用意
    let defs = vec![ProcessDef {
        name: "my-service".to_string(),
        program: "./sidecar/my-service".to_string(),
        args: vec!["--port".to_string(), "8080".to_string()],
        env: vec![],
        depends_on: vec![],
        restart: RestartPolicy::on_crash_default(),
        ready: ReadyCondition::TcpPort {
            host: "127.0.0.1".parse().unwrap(),
            port: 8080,
            timeout: Duration::from_secs(30),
            poll_interval: Duration::from_millis(200),
        },
        shutdown_timeout: None,
    }];

    // 3. 起動（依存順序を自動解決）
    registry.start_all(defs).await.unwrap();

    // 4. 状態を確認
    let snapshot = registry.snapshot().await;
    println!("{:?}", snapshot);

    // 5. 全プロセスを停止（Graceful Shutdown）
    registry.shutdown_all().await;
}
```

---

## チュートリアル

### Step 1: プロセス定義（`ProcessDef`）

起動するプロセスは `ProcessDef` 構造体で定義します。

```rust
use process_registry::ProcessDef;
use std::time::Duration;

let def = ProcessDef {
    // レジストリ内で一意な名前（ログやエラー表示に使われる）
    name: "database".to_string(),

    // 実行するバイナリのパス（PATH 解決は OS に委ねられる）
    program: "./bin/postgres".to_string(),

    // コマンドライン引数
    args: vec!["--port=5432".to_string()],

    // 環境変数（空の場合は親プロセスの環境を継承）
    env: vec![("PGDATA".to_string(), "/var/lib/pgdata".to_string())],

    // このプロセスの起動前に Running 状態でなければならないプロセス名
    depends_on: vec![],

    // クラッシュ時の再起動ポリシー
    restart: RestartPolicy::Never,

    // 起動完了とみなす条件
    ready: ReadyCondition::Immediate,

    // Graceful Shutdown のタイムアウト設定（None でデフォルト: Unix 5s, Windows 8s）
    shutdown_timeout: None,
};
```

### Step 2: 再起動ポリシー（`RestartPolicy`）

プロセスが終了したときの再起動動作を 3 種類から選べます。

```rust
use process_registry::RestartPolicy;
use std::time::Duration;

// 再起動しない（一度終了したら Failed 状態に遷移）
let never = RestartPolicy::Never;

// ゼロ以外の終了コードで終了した場合のみ再起動
// （PID probe の制約により、実際には正常終了（exit 0）でも再起動される）
let on_crash = RestartPolicy::OnCrash {
    max_retries: 3,          // 最大再起動回数
    initial_delay: Duration::from_secs(1),   // 初回待機時間
    backoff_factor: 2.0,     // 指数バックオフ係数
    max_delay: Duration::from_secs(30),      // バックオフ上限
};

// 終了コードに関わらず常に再起動
let always = RestartPolicy::Always {
    max_retries: 5,
    initial_delay: Duration::from_millis(500),
    backoff_factor: 1.5,
    max_delay: Duration::from_secs(60),
};

// よく使うデフォルト（OnCrash, max_retries=3, 1s→2s→4s→..., 最大30s）
let default = RestartPolicy::on_crash_default();
```

**補足**: `next_delay(attempt)` メソッドで、指定した試行回数における待機時間を計算できます。

```rust
let policy = RestartPolicy::on_crash_default();
assert_eq!(policy.next_delay(0), Some(Duration::from_secs(1)));  // 初回
assert_eq!(policy.next_delay(1), Some(Duration::from_secs(2)));  // 2倍
assert_eq!(policy.next_delay(2), Some(Duration::from_secs(4)));  // 4倍
assert_eq!(policy.next_delay(3), None);  // リトライ上限到達
```

### Step 3: 起動完了条件（`ReadyCondition`）

プロセスが「起動完了」とみなされる条件を 4 種類から選べます。

```rust
use process_registry::ReadyCondition;
use std::net::IpAddr;
use std::time::Duration;

// 条件なし。spawn 直後に「起動完了」とみなす
let immediate = ReadyCondition::Immediate;

// 固定時間待機する（最も単純だが最も不確実）
let delay = ReadyCondition::Delay(Duration::from_secs(3));

// stdout/stderr に特定の文字列が含まれる行が出るまで待つ
let log = ReadyCondition::LogContains {
    pattern: "listening on port".to_string(),
    timeout: Duration::from_secs(15),
};

// 指定した TCP ポートが accept を受け付けるまで待つ
let host: IpAddr = "127.0.0.1".parse().unwrap();
let tcp = ReadyCondition::TcpPort {
    host,                                    // 接続先ホスト
    port: 8080,                              // 接続先ポート
    timeout: Duration::from_secs(30),        // 最大待機時間
    poll_interval: Duration::from_millis(200), // ポーリング間隔
};
```

### Step 4: プロセス状態（`ProcessState`）

プロセスは以下の 6 状態を遷移します。`snapshot()` で取得でき、JSON シリアライズ可能です。

```rust
use process_registry::ProcessState;

let states = vec![
    ProcessState::Pending,                          // 起動待ち
    ProcessState::Starting,                         // ReadyCondition 待機中
    ProcessState::Running { pid: 12345 },            // 正常稼働中
    ProcessState::Restarting { attempt: 1, retry_in_ms: 2000 }, // 再起動待ち
    ProcessState::Failed { exit_code: Some(1), message: "...".into() }, // 異常終了
    ProcessState::Stopped,                          // 正常停止
];

// JSON シリアライズ例:
// {"state":"running","pid":12345}
// {"state":"restarting","attempt":1,"retry_in_ms":2000}
```

### Step 5: プロセスを起動する（`start_all`）

`start_all` に `ProcessDef` のリストを渡すと、`depends_on` を自動解決して順番に起動します。

```rust
use process_registry::*;
use std::time::Duration;

let registry = ProcessRegistry::new();

let defs = vec![
    ProcessDef {
        name: "db".to_string(),
        program: "./bin/postgres".to_string(),
        args: vec![],
        env: vec![],
        depends_on: vec![],
        restart: RestartPolicy::Never,
        ready: ReadyCondition::TcpPort {
            host: "127.0.0.1".parse().unwrap(),
            port: 5432,
            timeout: Duration::from_secs(30),
            poll_interval: Duration::from_millis(200),
        },
        shutdown_timeout: None,
    },
    ProcessDef {
        name: "app".to_string(),
        program: "./bin/myapp".to_string(),
        args: vec![],
        env: vec![],
        depends_on: vec!["db".to_string()],  // db の後に起動
        restart: RestartPolicy::on_crash_default(),
        ready: ReadyCondition::LogContains {
            pattern: "server started".to_string(),
            timeout: Duration::from_secs(15),
        },
        shutdown_timeout: None,
    },
];

// db → app の順に起動される
registry.start_all(defs).await.unwrap();
```

### Step 6: プロセス状態を確認する（`snapshot`）

```rust
use std::collections::HashMap;
use process_registry::ProcessState;

let snapshot: HashMap<String, ProcessState> = registry.snapshot().await;

for (name, state) in &snapshot {
    println!("{name}: {state:?}");
}
```

### Step 7: プロセス出力を購読する

起動中のプロセスの stdout/stderr をリアルタイムで受け取れます。

```rust
use tokio::sync::broadcast;

// 購読（Receiver を取得）
let mut rx: broadcast::Receiver<String> = registry
    .subscribe_output("app")
    .await
    .expect("プロセス 'app' が見つかりません");

// 出力行を受信
tokio::spawn(async move {
    while let Ok(line) = rx.recv().await {
        println!("[app] {line}");
    }
});

// または pipe_output_to でクロージャに転送
registry.pipe_output_to("app", |line| {
    // ここで line を受け取る（tokio::spawn 内で実行される）
    println!("[app] {line}");
}).await;
```

### Step 8: プロセスを停止する（`shutdown_all` / `stop`）

```rust
// 全プロセスを起動の逆順で Graceful Shutdown
// db → app の順で起動した場合、app → db の順で停止される
registry.shutdown_all().await;

// または単一プロセスのみ停止
registry.stop("app").await.unwrap();
```

停止時の動作:
1. `CancellationToken` を `cancel` → `watch_loop` が即座に終了
2. `Mutex` から `ChildGuard` を取り出す
3. `Mutex` を解放 → **デッドロック回避**
4. `ChildGuard::shutdown().await` で Graceful Shutdown:
   - **Unix**: SIGTERM → `unix_sigterm_timeout`(デフォルト5秒)待機 → SIGKILL
   - **Windows**: `start_kill()` → `windows_ctrl_break_timeout`(デフォルト8秒)待機

### Step 9: アプリ終了時の安全網

```rust
use process_registry::ProcessRegistry;

// パニック時に全プロセスを自動停止するフック
// main() の最初に呼んでおく
process_registry::install_panic_hook(registry.clone());

// Unix の場合: SIGTERM を受けたら全プロセスを停止
#[cfg(unix)]
process_registry::install_sigterm_handler(registry.clone());
```

`install_panic_hook` は専用スレッド + `current_thread` Tokio ランタイムで `shutdown_all` を実行するため、Tokio ワーカースレッド上でのパニックでもデッドロックしません。

### Step 10: コンパイル時の注意

`install_sigterm_handler` は Unix 専用です。Windows ではコンパイルされません。

```rust
#[cfg(unix)]
process_registry::install_sigterm_handler(registry.clone());
```

また、`install_panic_hook` を正しく動作させるには、`Cargo.toml` で `panic = "unwind"` を設定する必要があります。

```toml
[profile.release]
panic = "unwind"    # デフォルト値。abort に変更しないこと
```

---

## アーキテクチャ

```
┌──────────────────────────────────────────┐
│              ProcessRegistry              │
│                                          │
│  HashMap<String, RegistryEntry>          │
│  ├── "db"   → RegistryEntry{child,tx,…} │
│  └── "app"  → RegistryEntry{child,tx,…} │
│                                          │
│  tokio::process::Command で直接 spawn:    │
│    ChildGuard ─ drop 時に GracefulShutdown│
│    BufReader  ─ stdout/stderr→broadcast  │
└──────────────────────────────────────────┘
         ↑
   Arc<Mutex<Inner>>
         ↑
┌────────────────────┐  ┌───────────────────┐
│  アプリケーション   │  │   Watch Task      │
│  (snapshot / stop) │  │  exit_rx.await    │
│                    │  │  → 再起動判断     │
└────────────────────┘  └───────────────────┘
```

### 主要モジュール

| モジュール | 役割 |
|-----------|------|
| `registry` | `ProcessRegistry` — 公開 API（new, snapshot, subscribe, start_all, shutdown_all, stop）|
| `graph` | `resolve_start_order` — DAG トポロジカルソート |
| `spawn` | `spawn_one` — プロセス起動・出力キャプチャ・PID probe |
| `child` | `ChildGuard` — Graceful Shutdown（SIGTERM → wait → SIGKILL）|
| `ready` | `wait_ready` — 起動完了条件の非同期待機 |
| `watch` | `watch_loop` — イベント駆動監視・再起動ループ |
| `platform` | `is_process_alive` — クロスプラットフォーム生存確認 |
| `signal` | `install_sigterm_handler` — Unix SIGTERM ハンドラ |
| `panic` | `install_panic_hook` — パニック安全網 |
| `error` | `RegistryError` — エラー型（5バリアント）|
| `state` | `ProcessState` — プロセス状態（serde 対応）|

---

## エラーハンドリング

`RegistryError` は 5 種類のエラーを統一的に扱います。

| エラーバリアント | 発生タイミング | 意味 |
|-----------------|--------------|------|
| `UnknownDependency { src, dep }` | `start_all` | 存在しないプロセスを依存先に指定した |
| `CircularDependency` | `start_all` | 依存関係に循環が存在する |
| `NotFound(String)` | `stop` | 指定したプロセス名が存在しない |
| `SpawnFailed { name, source }` | `start_all` / 再起動 | プロセスの起動に失敗した |
| `ReadyTimeout { name, timeout }` | 起動時 | ReadyCondition がタイムアウトした |

```rust
use process_registry::RegistryError;

match registry.start_all(defs).await {
    Ok(()) => println!("全プロセス起動完了"),
    Err(RegistryError::CircularDependency) => {
        eprintln!("依存関係に循環があります");
    }
    Err(RegistryError::UnknownDependency { src, dep }) => {
        eprintln!("{src} が依存する {dep} が見つかりません");
    }
    Err(e) => eprintln!("起動エラー: {e}"),
}
```

---

## テスト

```bash
# 全テスト実行（単体 76 + 統合 2 = 78）
cargo test

# 高速フィードバック（単体のみ）
cargo test --lib
```

---

## ライセンス

MIT
