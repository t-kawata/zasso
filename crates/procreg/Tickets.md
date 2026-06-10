# process-registry 実装チケット分解設計書

> **生成元:** docs/RFC-001-process-registry.md
> **生成日:** 2026-06-10
> **分析済みセクション:** §1–§19（全文）
> **依存5層モデル:** L0型定義 → L1純粋関数 → L2非同期ランタイム → L3ライフサイクル管理 → L4統合・プラットフォーム

---

## Phase 0: 純粋ロジック・状態機械の完全隔離検証

> **外部依存:** なし（`std::time::Duration`、`std::collections::HashMap` のみ）
> **特性:** 全テストがメモリ内完結・決定論的・0msで完了

### M0: 公開・非公開型の定義

> **DB:** メモリ内完結
> **依存関係の基盤:** このマイルストーンに後続する全チケットの型基盤となる

#### チケット M0-1: 純粋データ型の定義

* **参照設計書:** docs/RFC-001-process-registry.md (§5.1, §5.2, §5.3, §5.4)
* **対象不変条件 / 規範:** §5.1 ProcessDef、§5.2 RestartPolicy、§5.3 ReadyCondition、§5.4 ShutdownTimeoutConfig
* **実装の背景と目的:** プロセス定義・再起動ポリシー・起動完了条件・シャットダウンタイムアウトの4つの純粋データ型を定義する。これらは一切の非同期・I/Oを含まない値オブジェクトであり、実装の最下層基盤となる。`ProcessDef` は後続の `RegistryEntry` に格納され、`RestartPolicy` は watch_loop での再起動判断に使用される。
* **実装スコープ:**
  - `ProcessDef` 構造体（name, program, args, env, depends_on, restart, ready, shutdown_timeout）— `Clone + Debug`
  - `RestartPolicy` 列挙型（Never, OnCrash { max_retries, initial_delay, backoff_factor, max_delay }, Always { ... }）— `Clone + Debug + PartialEq`
  - `ReadyCondition` 列挙型（Immediate, Delay(Duration), LogContains { pattern, timeout }, TcpPort { host, port, timeout, poll_interval }）— `Clone + Debug`
  - `ShutdownTimeoutConfig` 構造体（unix_sigterm_timeout, windows_ctrl_break_timeout）— `Clone + Debug + Default`
  - 各型への derive マクロ（Debug, Clone, PartialEq 等）
* **テストコードによる検証:**
  1. `ProcessDef` の全フィールド代入と読み出し
  2. `RestartPolicy` の3バリアントの構築とパターンマッチ
  3. `ReadyCondition` の4バリアントの構築
  4. `ShutdownTimeoutConfig::default()` の値確認
  5. 全型の `Clone` がフィールド単位で正しく動作すること
* **計装方法・観測対象:** コンパイル成功確認、各型のメモリサイズログ

#### チケット M0-2: エラー型の定義

* **参照設計書:** docs/RFC-001-process-registry.md (§6)
* **対象不変条件 / 規範:** §6 `RegistryError`
* **実装の背景と目的:** クレート全体で使用するエラー型を定義する。`thiserror` による `std::error::Error` の自動 derive、`Display` のフォーマット文字列まで含めて確定させる。後続の全チケットがこのエラー型を返す。
* **実装スコープ:**
  - `RegistryError` 列挙型（UnknownDependency, CircularDependency, NotFound, SpawnFailed, ReadyTimeout）— `#[derive(Debug, thiserror::Error)]`
  - 各バリアントのエラーメッセージフォーマット（`#[error("...")]`）
  - SpawnFailed は `anyhow::Error` を内包
* **テストコードによる検証:**
  1. 各バリアントの構築と `Display` 出力の確認
  2. `std::error::Error` トレイトの充足確認
  3. `SpawnFailed` の `source()` が内包された `anyhow::Error` を返すこと
* **計装方法・観測対象:** コンパイル時エラーハンドリングの網羅性チェック

#### チケット M0-3: プロセス状態とレジストリ型の定義

* **参照設計書:** docs/RFC-001-process-registry.md (§5.5, §5.6, §5.7)
* **対象不変条件 / 規範:** §5.5 ProcessState、§5.6 RegistryEntry、§5.7 ProcessRegistry（構造体のみ）、RegistryInner
* **実装の背景と目的:** プロセスのライフサイクルを表現する状態機械と、レジストリの内部構造を定義する。`ProcessState` は `serde::Serialize + Deserialize` を実装し Tauri フロントエンドに状態を返せるようにする。`RegistryEntry` は各プロセスの実行時状態を保持し、`ProcessRegistry` は `Arc<Mutex<RegistryInner>>` でスレッド安全な共有を実現する。
* **実装スコープ:**
  - `ProcessState` 列挙型（Pending, Starting, Running { pid: u32 }, Restarting { attempt, retry_in_ms }, Failed { exit_code, message }, Stopped）— `serde::Serialize + Deserialize`、`#[serde(tag = "state", rename_all = "snake_case")]`
  - `RegistryEntry` 構造体（def, state, child: Option<ChildGuard>, output_tx, cancel_token, restart_count）— `pub(crate)`
  - `RegistryInner` 構造体（entries: HashMap<String, RegistryEntry>, start_order: Vec<String>）
  - `ProcessRegistry` 公開構造体（inner: Arc<Mutex<RegistryInner>>）— `Clone` 実装（`Arc::clone`）
* **テストコードによる検証:**
  1. `ProcessState` 全6バリアントの serde ラウンドトリップ（JSON エンコード→デコード一致）
  2. `ProcessRegistry::clone()` が `Arc::clone` であることの確認（内部状態の共有）
* **計装方法・観測対象:** シリアライズ出力のスナップショットテスト

### M1: RestartPolicy 純粋関数

> **DB:** メモリ内完結
> **依存:** M0-1（RestartPolicy）

#### チケット M1-1: RestartPolicy::on_crash_default と next_delay の実装

* **参照設計書:** docs/RFC-001-process-registry.md (§5.2)
* **対象不変条件 / 規範:** §5.2 RestartPolicy（`on_crash_default()`、`next_delay()`）
* **実装の背景と目的:** 再起動ポリシーのデフォルト構築と指数バックオフ計算を実装する。純粋関数であり外部I/O・非同期ランタイムに依存しないため Phase 0 で完全に分離して実装・検証できる。
* **実装スコープ:**
  - `RestartPolicy::on_crash_default()` — `OnCrash { max_retries: 3, initial_delay: 1s, backoff_factor: 2.0, max_delay: 30s }`
  - `fn next_delay(&self, attempt: u32) -> Option<Duration>` — Never なら None、`attempt >= max_retries` なら None、`initial_delay * factor^attempt` を `max_delay` でクランプ
* **テストコードによる検証:**
  1. `on_crash_default()` の全フィールド値確認
  2. 0回目 → `initial_delay` が返ること
  3. 1回目 → `initial_delay * factor` が返ること
  4. `max_retries` 超過 → `None`
  5. `max_delay` でのクランプ確認
  6. `Never` では常に `None`
  7. 同一入力→同一出力の決定論性（1000回ランダム入力）
* **計装方法・観測対象:** 全テストケースの通過、決定論的出力

### M2: DAG トポロジカルソート

> **DB:** メモリ内完結
> **依存:** M0-1（ProcessDef）、M0-2（RegistryError）

#### チケット M2-1: resolve_start_order の実装

* **参照設計書:** docs/RFC-001-process-registry.md (§6)
* **対象不変条件 / 規範:** §6 depends_on — トポロジカルソート（循環検出＋不明依存検出）
* **実装の背景と目的:** `petgraph` の `toposort` を使用して `depends_on` 宣言から起動順序を決定する。循環依存と不明な依存先を検出する。純粋関数であり非同期ランタイム不要。
* **実装スコープ:**
  - `pub(crate) fn resolve_start_order(defs: &[ProcessDef]) -> Result<Vec<String>, RegistryError>`
  - DiGraph 構築 → `toposort` → エラー時は CircularDependency / UnknownDependency
* **テストコードによる検証:**
  1. 線形依存（A→B→C）→ [A, B, C]（順不同入力でも）
  2. ダイヤモンド依存 → A 先頭、D 末尾
  3. 循環依存 → CircularDependency
  4. 不明依存 → UnknownDependency
  5. 依存なし単一 → そのまま出力
  6. 空リスト → 空 Vec
* **計装方法・観測対象:** 全順序テストケースの通過

---

## Phase 1: 非同期ランタイム・Mock可能な実行基盤

> **外部依存:** `tokio`、`tokio-util`（CancellationToken）
> **特性:** 非同期ランタイム導入。プロセス起動は Mock / Fake で代替

### M3: ChildGuard — 運命共同体の核心

> **DB:** メモリ内完結
> **依存:** M0-1（ShutdownTimeoutConfig）、`tokio`、`libc` / `windows`

#### チケット M3-1: ChildGuard 構造体と shutdown メソッドの実装

* **参照設計書:** docs/RFC-001-process-registry.md (§5.8)
* **対象不変条件 / 規範:** §5.8 ChildGuard
* **実装の背景と目的:** `tokio::process::Child` をラップし GracefulShutdown を実行するガード。Unix は SIGTERM → 待機 → SIGKILL、Windows は TerminateProcess。`shutdown().await` は完了まで待機、Drop は `start_kill()` のみのベストエフォート。
* **実装スコープ:**
  - `ChildGuard` 構造体（child: Option<Child>, config: ShutdownTimeoutConfig）
  - `ChildGuard::new(child, config)` — コンストラクタ
  - `pub async fn shutdown(mut self)` — take → graceful_shutdown を await
  - `async fn graceful_shutdown(child, config)` — 内部実装（cfg(unix) / cfg(windows)）
  - `impl Drop for ChildGuard` — `child.start_kill()` のみ
* **テストコードによる検証:**
  1. ユニットテスト: `new()` 保持確認、`shutdown()` 後 child=None、Drop 非パニック
  2. 統合テスト: 実プロセス（sleep）での shutdown 完了確認
* **計装方法・観測対象:** プロセス終了確認（try_wait）、タイムアウト計測

### M4: Platform モジュール（プロセス生存確認）

> **DB:** メモリ内完結
> **依存:** `libc`（Unix）、`windows`（Windows）

#### チケット M4-1: is_process_alive の実装

* **参照設計書:** docs/RFC-001-process-registry.md (§10)
* **対象不変条件 / 規範:** §10 `is_process_alive`、PID 0 ガード
* **実装の背景と目的:** PID ベースのプロセス生存確認。`std::io::Error::last_os_error()` で macOS/Linux 互換。
* **実装スコープ:**
  - `fn is_process_alive(pid: u32) -> bool`
  - Unix: `libc::kill(pid, 0)` + `last_os_error() != ESRCH`
  - Windows: `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)`
* **テストコードによる検証:**
  1. PID=0 → true
  2. 自プロセス → true
  3. 存在しない PID → false
  4. 子プロセス生死の検出

---

## Phase 2: ライフサイクル管理・統合

> **外部依存:** `tokio`（multi_thread）、`tokio-util`（CancellationToken）
> **特性:** 全コンポーネント統合、Phase 3 に備えた skeleton

### M5: wait_ready

> **依存:** M0-1（ReadyCondition）、M0-2（RegistryError）

#### チケット M5-1: wait_ready の実装

* **参照設計書:** docs/RFC-001-process-registry.md (§8)
* **対象不変条件 / 規範:** §8 ReadyCondition の待機実装
* **実装の背景と目的:** プロセス起動完了条件を待機する。4つのバリアント（Immediate, Delay, LogContains, TcpPort）はすべて `tokio::time::timeout` で制御され、output_tx の broadcast subscribe または TcpStream connect ポーリングで完了を検出する。
* **実装スコープ:**
  - Immediate / Delay / LogContains（broadcast subscribe + pattern match）/ TcpPort（TcpStream connect polling）
  - 全バリアントに `tokio::time::timeout`
* **テストコードによる検証:**
  1. Immediate: 即座に Ok
  2. Delay: 指定時間経過後 Ok
  3. LogContains: パターン一致/不一致/チャンネル切断/timeout
  4. TcpPort: 接続成功/タイムアウト

### M6: ProcessRegistry 基本API

> **依存:** M0-3（全型）

#### チケット M6-1: ProcessRegistry::new, snapshot, subscribe_output, pipe_output_to

* **参照設計書:** docs/RFC-001-process-registry.md (§9, §11, §12)
* **対象不変条件 / 規範:** §9（new）、§11（Output Capture）、§12（snapshot）
* **実装の背景と目的:** ProcessRegistry の基本API。`new()` で空のレジストリを作成、`snapshot()` で状態取得、`subscribe_output()` / `pipe_output_to()` で出力購読を提供する。spawn 機能が未実装でも独立してテスト可能。
* **実装スコープ:**
  - `new()` — 空のレジストリ
  - `snapshot()` — 全状態のスナップショット
  - `subscribe_output(name)` — broadcast subscribe
  - `pipe_output_to(name, sink)` — sink に流す専用タスク
* **テストコードによる検証:** 空レジストリ、存在しないプロセス名のハンドリング

### M7: watch_loop

> **依存:** M1-1、M6-1

#### チケット M7-1: start_watch_task と watch_loop の実装

* **参照設計書:** docs/RFC-001-process-registry.md (§10)
* **対象不変条件 / 規範:** §10 監視・再起動ループ
* **実装の背景と目的:** プロセス終了をイベント駆動（exit_rx.await）で検知し、RestartPolicy に基づいて再起動するループ。PID probe の制約により OnCrash は正常終了でも再起動される（§10 注釈）。
* **実装スコープ:**
  - `start_watch_task()` — tokio::spawn
  - `watch_loop()` — `tokio::select!`（exit_rx vs cancel_token）→ RestartPolicy → backoff → restart
  - PID probe の制約による OnCrash = Always 相当の挙動（§10 注釈）
* **テストコードによる検証:**
  1. cancel → 即時 return
  2. Never → Failed 状態
  3. OnCrash/Always → 再起動（Fake spawn_one）
  4. 再起動成功/失敗の状態遷移

### M8: spawn_one と start_all

> **依存:** M5-1（wait_ready）、M6-1、M7-1

#### チケット M8-1: spawn_one（Fake プロセス版）と start_all の実装

* **参照設計書:** docs/RFC-001-process-registry.md (§7, §9)
* **対象不変条件 / 規範:** §7 プロセス起動（spawn_one）、§9 start_all
* **実装の背景と目的:** 単一プロセスの spawn（出力キャプチャ＋PID probe＋ChildGuard）と複数プロセスの依存順序起動を実装する。
* **実装スコープ:**
  - `spawn_one()`: Command 構築 → spawn → PID 取得（0 ならエラー）→ stdout/stderr タスク → wait_ready → ChildGuard ラップ → PID probe タスク → SpawnResult
  - `start_all()`: resolve_start_order → 順次 spawn_one → start_watch_task
* **テストコードによる検証:**
  1. 単一プロセス start_all → Running → shutdown_all → Stopped
  2. 依存関係の起動順
  3. PID=0 のエラー処理
  4. 出力 broadcast 配信確認

### M9: shutdown_all と stop

> **依存:** M3-1（ChildGuard::shutdown）、M8-1

#### チケット M9-1: shutdown_all と stop の実装

* **参照設計書:** docs/RFC-001-process-registry.md (§12)
* **対象不変条件 / 規範:** §12 shutdown_all — 運命共同体のシャットダウン
* **実装の背景と目的:** 全プロセスを起動の逆順で停止する。Mutex ロック解放後に child_guard.shutdown().await でデッドロック回避。
* **実装スコープ:**
  - `shutdown_all()`: 逆順→Mutex 脱出→child_guard.shutdown().await
  - `stop(name)`: 単一版
* **テストコードによる検証:**
  1. 正常停止と状態確認
  2. 逆順停止の確認
  3. 存在しないプロセスの stop → NotFound

---

## Phase 3: プラットフォーム固有実装・統合

> **外部依存:** `libc`（Unix）、`windows`、`tauri`
> **特性:** 物理プロセス使用の実統合テスト

### M10: プラットフォーム別実装

> **依存:** M3-1（graceful_shutdown）、M4-1（is_process_alive）

#### チケット M10-1: Unix 実装（libc）+ SIGTERM ハンドラ

* **参照設計書:** docs/RFC-001-process-registry.md (§5.8, §10, §14)
* **対象不変条件 / 規範:** §5.8（graceful_shutdown Unix）、§10（is_process_alive Unix）、§14（install_sigterm_handler）
* **実装の背景と目的:** Unix（Linux/macOS）向けプラットフォーム依存コードの実装。SIGTERM → try_wait → SIGKILL、libc::kill PID probe、tokio::signal::unix による SIGTERM ハンドラ。
* **実装スコープ:**
  - graceful_shutdown Unix ブランチ（SIGTERM → try_wait ループ → SIGKILL）
  - `install_sigterm_handler`（tokio::signal::unix）
* **テストコードによる検証:** 実プロセス kill、SIGTERM 送信テスト

#### チケット M10-2: Windows 実装（win32）

* **参照設計書:** docs/RFC-001-process-registry.md (§5.8, §10)
* **対象不変条件 / 規範:** §5.8（graceful_shutdown Windows）、§10（is_process_alive Windows）
* **実装の背景と目的:** Windows 向けプラットフォーム依存コードの実装。
* **実装スコープ:**
  - graceful_shutdown Windows ブランチ（start_kill → wait）
  - is_process_alive Windows ブランチ（OpenProcess）
* **テストコードによる検証:** Windows 環境での動作確認

### M11: パニック安全網

> **依存:** ProcessRegistry（全API）

#### チケット M11-1: install_panic_hook

* **参照設計書:** docs/RFC-001-process-registry.md (§15)
* **対象不変条件 / 規範:** §15 パニック時の安全網
* **実装の背景と目的:** パニック時に全プロセスを確実に停止する。専用スレッド + current_thread ランタイムでデッドロック回避。
* **実装スコープ:** §15 パニックフック（専用スレッド + current_thread ランタイム）
* **テストコードによる検証:** catch_unwind 経由のフック呼び出し確認

### M12: Tauri 統合

> **依存:** ProcessRegistry（全API）、`tauri` v2

#### チケット M12-1: Tauri コマンド + RunEvent::Exit ハンドラ

* **参照設計書:** docs/RFC-001-process-registry.md (§13)
* **対象不変条件 / 規範:** §13 Tauri 統合
* **実装の背景と目的:** Tauri アプリから ProcessRegistry を操作・監視するコマンドとライフサイクルフック。
* **実装スコープ:** §13 Tauri 統合（cmd_list_processes、cmd_stream_process_output、RunEvent::Exit）
* **テストコードによる検証:** Tauri コマンド応答確認

### M13: 統合テスト

> **依存:** 全マイルストーン

#### チケット M13-1: 統合テストスイート

* **参照設計書:** docs/RFC-001-process-registry.md (§17)
* **対象不変条件 / 規範:** §17 テスト戦略
* **実装の背景と目的:** 実プロセス（sleep/timeout/echo）を使用した統合テスト。#[tokio::test(flavor = "multi_thread")] 必須。
* **実装スコープ:** §17 テスト戦略の全テスト
* **テストコードによる検証:** start_and_stop、restart_on_crash、output_capture、sigterm_handler 等

---

## チケット依存関係グラフ

```
M0-1 (純粋データ型)
 ├── M0-2 (RegistryError)
 ├── M0-3 (ProcessState, RegistryEntry, ProcessRegistry)
 │    ├── M1-1 (RestartPolicy backoff)
 │    ├── M2-1 (DAG resolve_start_order)
 │    ├── M3-1 (ChildGuard)
 │    │    └── M4-1 (is_process_alive)
 │    ├── M5-1 (wait_ready)
 │    ├── M6-1 (ProcessRegistry basic API)
 │    │    ├── M7-1 (watch_loop)
 │    │    └── M8-1 (spawn_one / start_all)
 │    │         └── M9-1 (shutdown_all / stop)
 │    │              ├── M10-1 (Unix platform)
 │    │              ├── M10-2 (Windows platform)
 │    │              ├── M11-1 (panic hook)
 │    │              ├── M12-1 (Tauri integration)
 │    │              └── M13-1 (Integration tests)
 │    └── (全チケットの型基盤)
```

### 推奨実装順序

| 順序 | チケット | 確認方法 |
|------|---------|---------|
| 1 | M0-1 → M0-2 → M0-3 | `cargo check` + ユニットテスト |
| 2 | M1-1 → M2-1 | `cargo test`（全Pass） |
| 3 | M3-1 → M4-1 → M5-1 | `cargo test --lib` |
| 4 | M6-1 → M7-1 | `cargo test --lib`（Mock/Fake） |
| 5 | M8-1 → M9-1 | `cargo test --test integration` |
| 6 | M10-1 → M10-2 | プラットフォーム別 `cargo test` |
| 7 | M11-1 → M12-1 → M13-1 | 全テスト + Tauri E2E |

各チケットは直前の完了を前提とせず、未実装依存は Mock / Fake で代替する。
`mod tests` では該当チケットの責務のみを検証する。
