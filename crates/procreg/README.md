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
- **ポート競合検出** — 起動前にポート使用中を確認し、ゾンビプロセスがいる場合は起動をブロック
- **Watchdog ラッパー** — 全サイドカーは Watchdog プロセスを介して起動。親が死んだら子を自動終了
- **非同期起動モード** — `start_all_async` + `StartupMonitor` で setup ブロッキングなしの起動が可能
- **キャンセル対応** — `spawn_one` は `CancellationToken` による割り込みに対応。`wait_ready` 中のシャットダウン要求を検知可能
- **運命共同体（Fate Sharing）** — リトライ上限到達時はアプリ全体が停止。子も親も孤児にならない
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
setup をブロックせずに非同期的に起動したい場合は **Step 6**（`start_all_async`）を参照してください。

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

### Step 6: プロセスを非同期的に起動する（`start_all_async`）

`start_all_async` は setup をブロックせず即座に `StartupMonitor` を返します。
実際のプロセス起動はバックグラウンドで進行し、`wait_for_all()` で完了を待機できます。

```rust
use process_registry::*;
use std::time::Duration;

let registry = ProcessRegistry::new();

let defs = vec![
    ProcessDef {
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
    },
];

// 非同期的に起動（即座に戻る）
let monitor = registry.start_all_async(defs, Duration::from_secs(30)).await;

// 起動完了を待機（バックグラウンドタスクで監視）
tokio::spawn(async move {
    match monitor.wait_for_all().await {
        Ok(snapshot) => println!("全プロセス起動完了: {snapshot:?}"),
        Err(e) => {
            eprintln!("起動失敗: {e}");
            registry.shutdown_all().await;
            std::process::exit(1);
        }
    }
});

// setup はここで戻る → ウィンドウ表示等に進める
```

### Step 7: プロセス状態を確認する（`snapshot`）

```rust
use std::collections::HashMap;
use process_registry::ProcessState;

let snapshot: HashMap<String, ProcessState> = registry.snapshot().await;

for (name, state) in &snapshot {
    println!("{name}: {state:?}");
}
```

### Step 8: プロセス出力を購読する

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

### Step 9: プロセスを停止する（`shutdown_all` / `stop`）

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

### Step 10: 運命共同体（Fate Sharing）

process-registry は **Watchdog ラッパー** により全 OS で共通の運命共同体を実現します。

**仕組み**:

```
親プロセス（アプリ）
  └── spawn → [Watchdog]
        ├── 1秒ごとに kill -0 (Unix) / tasklist (Windows) で親PIDを確認
        ├── 親が死んだ → 子プロセスを強制終了 → 自身も exit
        ├── 子が先に死んだ → exit(子の終了コード)
        └── spawn → [実際のサイドカー（bifrost-http 等）]
```

Watchdog は build.rs で自動コンパイルされ、`include_bytes!` でライブラリに埋め込まれます。
利用者は意識することなく、`start_all()` が自動的に Watchdog 経由でプロセスを起動します。

**子が永久に死んだ場合の連鎖停止**:

`RestartPolicy::OnCrash` / `Always` でリトライ上限に達するか、再起動の spawn に失敗した場合、
`watch_loop` が `registry.shutdown_all().await` を呼び出し、アプリ全体を停止します。

```rust
// 通常の start_all を呼ぶだけで Watchdog による保護が適用される
registry.start_all(defs).await.unwrap();

// パニック安全網（任意）
process_registry::install_panic_hook(registry.clone());
```

| シナリオ | 動作 |
|---------|------|
| 親が SIGKILL / 即死 | Watchdog が kill -0 で検知 → 子を強制終了 |
| 親が Ctrl+C / SIGTERM | Watchdog または shutdown_all で子に SIGTERM |
| 子がクラッシュ | OnCrash でリトライ×3 → 上限到達 → shutdown_all で親も停止 |
| 子が自然終了 | 同上。exit code 0 でもリトライ上限に達すれば親も停止 |
| 起動中に親がシャットダウン | cancel_token で spawn_one 割り込み → SpawnCancelled。Watchdog が子を掃除 |
| RestartPolicy::Never | 子は終了するが親は動き続ける（設計上の意図） |

### Step 11: コンパイル時の注意

`install_panic_hook` を正しく動作させるには、`Cargo.toml` で `panic = "unwind"` を設定する必要があります。

```toml
[profile.release]
panic = "unwind"    # デフォルト値。abort に変更しないこと
```

---

## アーキテクチャ

```
                    ┌─────────────────────────────────────┐
                    │           ProcessRegistry            │
                    │                                     │
                    │  HashMap<String, RegistryEntry>     │
                    │  ├── "bifrost" → Entry              │
                    │  └── "tensorzero" → Entry            │
                    ├─────────────────────────────────────┤
                    │  start_all()  ── 同期的（逐次起動）  │
                    │  start_all_async() ── 非同期＋Monitor│
                    └─────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   StartupMonitor     │ ← 非同期起動時のみ
                    │  wait_for_all()      │
                    │  is_complete()        │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  spawn_one()        │
                    │  ─ ポート競合チェック │
                    │  ─ Watchdog 展開     │
                    │  ─ cancel_token 対応 │ ← NEW
                    └─────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    [Watchdog]        │ ← 独立プロセス
                    │  kill -0 親PID      │    親が死んだら子をkill
                    │  1秒間隔            │    全OS共通
                    └──────────▼──────────┘
                               │ spawn
                    ┌──────────▼──────────┐
                    │  [サイドカー]        │
                    │  bifrost-http 等     │
                    └─────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   watch_loop         │
                    │  exit_rx.await       │
                    │  → 再起動 or         │
                    │  → 上限到達→親停止   │
                    └─────────────────────┘
```

### 主要モジュール

| モジュール | 役割 |
|-----------|------|
| `registry` | `ProcessRegistry` — 公開 API（new, snapshot, subscribe, start_all, start_all_async, shutdown_all, stop）|
| `graph` | `resolve_start_order`（逐次起順） / `resolve_start_levels`（レベル分割）|
| `spawn` | `spawn_one` — Watchdog ラッパー経由のプロセス起動・出力キャプチャ・cancel_token 対応 |
| `child` | `ChildGuard` — Graceful Shutdown（SIGTERM → wait → SIGKILL）、Clone 対応 |
| `ready` | `wait_ready` — 起動完了条件の非同期待機 |
| `watch` | `watch_loop` — イベント駆動監視・再起動ループ・Fate Sharing |
| `platform` | `is_process_alive` — クロスプラットフォーム生存確認 |
| `port` | `is_port_free` — ポート競合検出（`TcpListener::bind`）|
| `watchdog`（build.rs）| `procreg-watchdog` — 親死検知ラッパーバイナリ（全OS統一）|
| `startup_monitor` | `StartupMonitor` — 非同期起動の完了監視（wait_for_all, is_complete）|
| `signal` | `install_sigterm_handler` — Unix SIGTERM ハンドラ |
| `panic` | `install_panic_hook` — パニック安全網 |
| `error` | `RegistryError` — エラー型（8バリアント）|
| `state` | `ProcessState` — プロセス状態（serde 対応）|

---

## エラーハンドリング

`RegistryError` は 8 種類のエラーを統一的に扱います。

| エラーバリアント | 発生タイミング | 意味 |
|-----------------|--------------|------|
| `UnknownDependency { src, dep }` | `start_all` | 存在しないプロセスを依存先に指定した |
| `CircularDependency` | `start_all` | 依存関係に循環が存在する |
| `NotFound(String)` | `stop` | 指定したプロセス名が存在しない |
| `SpawnFailed { name, source }` | `start_all` / 再起動 | プロセスの起動に失敗した |
| `ReadyTimeout { name, timeout }` | 起動時 | ReadyCondition がタイムアウトした |
| `PortInUse { host, port }` | `start_all` | ポートが既に他のプロセスに占有されている |
| `SpawnCancelled { name }` | `start_all_async` / キャンセル時 | shutdown_all により起動が中断された |
| `StartupTimeout { ready, pending, timeout }` | `start_all_async` | 全体タイムアウト内に起動が完了しなかった |

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
# 全テスト実行
cargo test

# 高速フィードバック（単体のみ）
cargo test --lib          # 106 tests
```

---

## ライセンス

MIT
