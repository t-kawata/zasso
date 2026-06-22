# 計画: process-registry 親プロセス生死監視（チケット #28）

## 要件

`crates/procreg` に、親プロセスが死んだときに子プロセス（サイドカー）が自動終了する機構を追加する。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/src/spawn.rs` | 修正 | `PROCREG_PARENT_PID` 環境変数設定 + Linux pre_exec `prctl(PR_SET_PDEATHSIG)` |
| `crates/procreg/src/parent.rs` | **新規** | `install_parent_monitor()` — 監視スレッド起動関数 |
| `crates/procreg/src/lib.rs` | 修正 | `pub mod parent;` 宣言 + `pub use parent::install_parent_monitor;` 再公開 |

## Boy Scout 改善（スコープ外の翻訳可能性修正）

- `spawn.rs:61` の `cmd.spawn()` 箇所 — ポートチェック追加時にコメント番号を更新したが、`spawn_one()` 全体の責務が増えている。コメントの処理フロー番号を再度確認し、新しいステップを正確に反映する

## テスト計画

### ユニットテスト計画

| # | テスト | 場所 | 内容 | 種別 |
|---|-------|------|------|------|
| 1 | `parent_env_var_is_set` | spawn.rs tests | `.cmd.env()` で `PROCREG_PARENT_PID` が設定されることを確認（`printenv` の出力検証） | 統合 |
| 2 | `pre_exec_pdeathsig_compiles` | spawn.rs tests | `cfg(target_os = "linux")` の `pre_exec` ブロックがコンパイル可能であること | コンパイル |
| 3 | `install_parent_monitor_type_check` | parent.rs tests | `install_parent_monitor(ProcessRegistry)` が型エラーなく呼べること | コンパイル |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| pdeathsig の実動作（親kill→子SIGTERM） | 実際の `kill()` 呼び出しと子プロセスのシグナル受信が必要。統合テストカテゴリ |
| macOS 監視スレッドによる孤児防止 | スレッドのタイミング依存。統合テストでのみ確認可能 |
| 監視スレッドが実際に子をkillする | 実際のプロセス生死確認が必要 |

## 実装手順

### Step 1: spawn.rs — `PROCREG_PARENT_PID` 環境変数を追加

`cmd.env("PROCREG_PARENT_PID", parent_pid_string)` を `spawn_one()` 内の環境変数設定ループ後に追加する。

```rust
// spawn.rs: cmd.env() ループの後
cmd.env("PROCREG_PARENT_PID", std::process::id().to_string());
```

### Step 2: spawn.rs — Linux pre_exec で pdeathsig を設定

`cfg(target_os = "linux")` でガードし、`libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM, 0, 0, 0)` を設定する：

```rust
// tokio::process::Command の pre_exec フックは cfg(target_os = "linux") でのみ有効
// 親プロセス死亡時、kernel が子に SIGTERM を送信する
#[cfg(target_os = "linux")]
{
    cmd.pre_exec(|| {
        // SAFETY: prctl(PR_SET_PDEATHSIG, SIGTERM) は親プロセスが死んだときに
        // カーネルが現在のプロセスに SIGTERM を送信するよう設定する。
        // この操作はメモリ安全性に影響を与えず、シグナル配送ポリシーの変更のみを行う。
        // 引数 arg3〜arg5 は PR_SET_PDEATHSIG では使用されないため 0 でよい。
        unsafe {
            libc::prctl(
                libc::PR_SET_PDEATHSIG,
                libc::SIGTERM as libc::c_ulong,
                0, 0, 0,
            );
        }
        Ok(())
    });
}
```

### Step 3: parent.rs — `install_parent_monitor()` を作成

`install_panic_hook()` と同一パターン。独立した `std::thread` で定期的に親PIDの生存を確認する。

```rust
/// 親プロセス監視スレッドを起動する。
///
/// 別スレッドで定期的に親PIDの生存確認を行い、
/// 親が死んでいる場合は全子プロセスを強制停止する。
///
/// # 制限
///
/// - macOS/Linux: `exit()` や SIGKILL ではスレッドも即死するため検知できない
/// - 主に graceful な shutdown（Ctrl+C, SIGTERM, パニック）での孤児化防止を目的とする
/// - 絶対的な保証が必要な場合は、OS 機構（Linux pdeathsig 等）との併用を推奨
pub fn install_parent_monitor(registry: ProcessRegistry) {
    let parent_pid = std::process::id();
    std::thread::spawn(move || {
        // 監視間隔は1秒。親プロセス終了後、最大1秒以内に検知する
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            if !crate::platform::is_process_alive(parent_pid) {
                // 親プロセスが死んでいる → tokio runtime を取得して shutdown_all
                // 専用ランタイムを current_thread で作成する
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build();
                match rt {
                    Ok(runtime) => {
                        runtime.block_on(async {
                            registry.shutdown_all().await;
                        });
                    }
                    Err(_) => {
                        // ランタイム構築に失敗 → これ以上できることはない
                        break;
                    }
                }
                std::process::exit(0);
            }
        }
    });
}
```

注意点：
- `shutdown_all()` は async。`std::thread` から呼ぶために `current_thread` ランタイムを作成して `block_on` する
- `std::process::exit(0)` で監視スレッド自身も終了する
- `is_process_alive(parent_pid)` は既存の `platform.rs` の関数を使用

### Step 4: lib.rs に宣言追加

```rust
pub mod parent;
pub use crate::parent::install_parent_monitor;
```

### Step 5: テスト

```bash
cd crates/procreg && cargo test --lib
```

## 物理的レビュー方法

1. `run-quality-checks.js` で品質チェック
2. 翻訳可能性 grep
3. 全テストパス確認（既存83 + 新規3 = 86件）

## リスク

| リスク | 確率 | 対策 |
|-------|------|------|
| macOS で `#[cfg(target_os = "linux")]` が誤って適用される | なし | cfg で完全にガードされるため混入不可 |
| `libc::prctl` の引数間違い | 低 | コンパイルエラーで検出可能 |
| 監視スレッドとメインスレッドの親PIDズレ | 低 | `std::process::id()` は不変。一度取得した値で問題ない |
| 監視スレッドが `block_on` でデッドロック | 低 | 親プロセス死後に監視スレッドのみが動いている状態なので競合なし |
