# 計画: Watchdogラッパーによる全OS統一の親死検知機構（チケット #29）

## 要件

現在の3系統に分かれた親死検知（Linux: pdeathsig / macOS: 監視スレッド / Windows: なし）を、
1つの Watchdog ラッパープロセスに統一する。

Watchdog は独立プロセスとして親PIDを監視し、親が死んだらサイドカーを kill する。
これにより全 OS で「子が親を監視して自殺する」が統一方式で実現する。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/watchdog/src/main.rs` | **新規** | Watchdog バイナリのソースコード |
| `crates/procreg/build.rs` | **新規** | Watchdog バイナリのビルド + 埋め込み設定 |
| `crates/procreg/Cargo.toml` | 修正 | `[[bin]]` ターゲット追加（watchdog ビルド用） |
| `crates/procreg/src/spawn.rs` | 修正 | Watchdog ラッパー起動に改写。pre_exec 削除、env 設定変更 |
| `crates/procreg/src/parent.rs` | 削除 | `install_parent_monitor()` を削除（Watchdog が代替） |
| `crates/procreg/src/lib.rs` | 修正 | `parent` モジュール削除、Watchdog 展開用モジュール追加 |

## 設計詳細

### Watchdog バイナリの構造

`crates/procreg/watchdog/src/main.rs` として配置。
外部依存なし（std のみ）。コンパイルタイムは build.rs が処理。

```
[Watchdog プロセス]
  ├── env: PROCREG_WATCHDOG_PARENT_PID = <親PID>
  ├── argv: ./procreg-watchdog -- /bifrost/bifrost-http --port 3912
  │
  ├── ループ (sleep 1秒):
  │   1. kill(parent_pid, 0) で親の生存確認 (Unix) / OpenProcess (Windows)
  │   2. 親が死んでいたら → child_pid を kill → exit(0)
  │   3. child.try_wait() で子の生存確認
  │   4. 子が死んでいたら → 子の終了コードを継承して exit
  │
  ├── シグナル:
  │   親からの SIGTERM → 子に伝播 → 子が終了したら自身も終了
  │   （Unix: signal ハンドラ or pgrp 経由）
  │
  └── [実際のサイドカー] ← 監視対象
```

Watchdog と子プロセスの間の stdio は透過的に継承する。
Watchdog が spawn した子プロセスの stdout/stderr は
そのまま Watchdog の stdout/stderr に流れる → 親がパイプで受信する。

### build.rs によるコンパイル方式

`rustc` を直接呼び出して watchdog バイナリをコンパイルする：

```rust
fn main() {
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let target = std::env::var("TARGET").unwrap();
    let exe_suffix = std::env::consts::EXE_SUFFIX; // "" or ".exe"
    let output = format!("{out_dir}/procreg-watchdog{exe_suffix}");

    let status = std::process::Command::new("rustc")
        .args([
            "watchdog/src/main.rs",
            "-o", &output,
            "--edition", "2021",
            "--crate-type", "bin",
            "--target", &target,
        ])
        .status().expect("rustc not found");
    assert!(status.success(), "Watchdog compilation failed");
}
```

ライブラリ側の include:

```rust
// watchdog モジュール
pub(crate) static WATCHDOG_BINARY: &[u8] =
    include_bytes!(concat!(env!("OUT_DIR"), "/procreg-watchdog"));
```

### spawn_one の改写

現在の `cmd.spawn()` を以下のように変更する：

```rust
Before:
  cmd = Command::new(bifrost-http)
  cmd.spawn() → [bifrost-http]

After:
  // 1. Watchdog バイナリを一時ファイルに展開
  let watchdog_path = extract_watchdog()?;
  
  // 2. Watchdog → 子コマンド の入れ子構造で起動
  cmd = Command::new(&watchdog_path)
  cmd.arg("--")
  cmd.arg(def.program)
  cmd.args(def.args)
  cmd.env("PROCREG_WATCHDOG_PARENT_PID", std::process::id().to_string())
  
  // 3. spawn（親は stdout/stderr パイプを Watchdog に接続）
  let child = cmd.spawn()?  → [watchdog] → [bifrost-http]
```

Watchdog の stdin は子に継承。stdout/stderr パイプは親が受信する。
Watchdog 内部では子の stdio を自身に継承するため、親は Watchdog のパイプから子の出力を読める。

### 後片付け

チケット #28 で追加したコードの削除：
- `parent.rs` ファイル全体を削除（`install_parent_monitor`）
- `spawn.rs` から `#[cfg(target_os = "linux")]` の pre_exec/prctl ブロックを削除
- `lib.rs` から `mod parent` と `pub use install_parent_monitor` を削除
- `spawn.rs` から `PROCREG_PARENT_PID` → `PROCREG_WATCHDOG_PARENT_PID` に変更

## Boy Scout 改善（スコープ外の翻訳可能性修正）

- `spawn.rs` から `#[cfg(target_os = "linux")]` の条件分岐が消え、全OS同一パスになる → 翻訳可能性が向上
- `parent.rs`（設計上の嘘を含む）が完全に削除される

## テスト計画

### ユニットテスト計画

| # | テスト | 場所 | 内容 |
|---|-------|------|------|
| 1 | `watchdog_binary_extracted` | spawn.rs | include_bytes! 埋め込みバイナリがディスクに書き出せる |
| 2 | `spawn_one_with_watchdog` | spawn.rs | Watchdog 経由で echo 等のプロセスが起動する |
| 3 | `watchdog_parent_env_var` | spawn.rs | `PROCREG_WATCHDOG_PARENT_PID` が設定されている |
| 4 | `watchdog_child_stdio_passthrough` | spawn.rs | 子の stdout が Watchdog を経由して親に届く |
| 5 | `install_parent_monitor_removed` | コンパイル | `parent.rs` が存在しないことの確認 |
| 6 | `pre_exec_pdeathsig_removed` | spawn.rs | `prctl` / `PR_SET_PDEATHSIG` が含まれない |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実際の親 kill → watchdog が子を kill | 実際のプロセス kill が必要。E2E/統合テストで確認 |
| SIGKILL 後の watchdog 生存 | 実 OS のプロセス機構に依存。テスト不能 |

## 実装手順

### Step 1: watchdog/src/main.rs を作成

```rust
use std::process::{Command, ExitStatus};
use std::time::Duration;

fn main() {
    // 環境変数から親PIDと子コマンドを取得
    let parent_pid: u32 = std::env::var("PROCREG_WATCHDOG_PARENT_PID")
        .expect("PROCREG_WATCHDOG_PARENT_PID not set")
        .parse()
        .expect("PROCREG_WATCHDOG_PARENT_PID must be a valid PID");

    // "--" 以降の引数が子コマンド
    let args: Vec<String> = std::env::args().collect();
    let dash_pos = args.iter().position(|a| a == "--")
        .expect("Usage: watchdog -- <child command>");
    let child_args = &args[dash_pos + 1..];
    if child_args.is_empty() {
        eprintln!("No child command specified");
        std::process::exit(1);
    }

    // 子プロセスを起動（stdio は継承）
    let mut child = Command::new(&child_args[0])
        .args(&child_args[1..])
        .spawn()
        .expect("Failed to spawn child process");

    loop {
        std::thread::sleep(Duration::from_secs(1));

        // 親プロセスの生存確認
        if !process_is_alive(parent_pid) {
            // 親が死んでいる → 子も殺して終了
            kill_process(child.id());
            std::process::exit(0);
        }

        // 子プロセスの終了確認
        match child.try_wait() {
            Ok(Some(status)) => {
                std::process::exit(status.code().unwrap_or(0));
            }
            Err(e) => {
                eprintln!("Watchdog error waiting for child: {e}");
                std::process::exit(1);
            }
            Ok(None) => continue,
        }
    }
}

#[cfg(unix)]
fn process_is_alive(pid: u32) -> bool {
    use std::os::unix::process::ExitStatusExt;
    // kill -0 はシグナルを送らず生存確認のみ
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
    // tasklist /FI "PID eq <pid>" で存在確認
    // TASKLIST は CSV 形式で結果を返す
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid), "/NH"])
        .output()
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.contains(&pid.to_string())
        })
        .unwrap_or(false)
}

#[cfg(unix)]
fn kill_process(pid: u32) {
    let _ = Command::new("kill")
        .arg(&pid.to_string())
        .status();
}

#[cfg(windows)]
fn kill_process(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .status();
}
```

### Step 2: build.rs を作成

```rust
fn main() {
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let target = std::env::var("TARGET").unwrap();
    let exe_suffix = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let output = format!("{out_dir}/procreg-watchdog{exe_suffix}");

    let status = std::process::Command::new("rustc")
        .args([
            "watchdog/src/main.rs",
            "-o", &output,
            "--edition", "2021",
            "--target", &target,
        ])
        .status()
        .expect("rustc not found — is Rust installed?");
    assert!(status.success(), "Watchdog compilation failed");
    println!("cargo:rerun-if-changed=watchdog/src/main.rs");
}
```

### Step 3: Cargo.toml に [[bin]] 追加

```toml
[[bin]]
name = "procreg-watchdog"
path = "watchdog/src/main.rs"
```

### Step 4: spawn.rs を改写

- `spawn_one()` 内で Watchdog バイナリを展開
- コマンド構築を `watchdog -- child_program child_args` に変更
- `PROCREG_WATCHDOG_PARENT_PID` を設定
- 古い `PROCREG_PARENT_PID` と pre_exec ブロックを削除

### Step 5: parent.rs を削除

- ファイルごと削除
- `lib.rs` から `mod parent` と `pub use install_parent_monitor` を削除

### Step 6: テスト

```bash
cd crates/procreg && cargo test --lib
```

## 物理的レビュー方法

1. `cargo test --lib` で全テストパス確認（回帰含む）
2. `run-quality-checks.js` で静的品質チェック
3. 翻訳可能性 grep: 関数名が動詞句か、マジックナンバーがないか
4. `parent.rs` が存在しないことの確認
5. `spawn.rs` から `prctl` / `PR_SET_PDEATHSIG` が削除されたことの確認

## リスク

| リスク | 確率 | 対策 |
|-------|------|------|
| `rustc` が build.rs から見つからない | 低 | `rustc` は cargo 環境で常に利用可能 |
| クロスコンパイル時 `--target` フラグの不一致 | 低 | build.rs で `TARGET` 環境変数を使用 |
| Windows の `tasklist` 出力フォーマット変化 | 極低 | テストで実機確認が必要 |
| Watchdog 展開の一時ファイル競合 | 低 | 一意なファイル名（PID 含む）を使用 |
