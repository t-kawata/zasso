//! process-registry Watchdog — 親プロセス生死監視ラッパー
//!
//! このバイナリは process-registry が spawn する全サイドカープロセスを
//! ラップし、親プロセス（アプリケーション）の生死を監視する。
//! 親が死んだ場合、監視対象の子プロセスを強制終了する。
//!
//! # 起動方法
//!
//! ```text
//! PROCREG_WATCHDOG_PARENT_PID=<pid> procreg-watchdog -- <child_program> [args...]
//! ```
//!
//! # 動作
//!
//! 1. 子プロセスを起動する
//! 2. 1秒間隔で親PIDの生存を確認する
//! 3. 親が死んでいる → 子を kill → 自身も終了
//! 4. 子が先に終了 → 子の終了コードを継承して終了
//! 5. stdio は子に透過的に継承する

use std::process::{Command, ExitStatus};
use std::time::Duration;

fn main() {
    // ---- 親PIDを環境変数から取得 ----
    let parent_pid: u32 = std::env::var("PROCREG_WATCHDOG_PARENT_PID")
        .expect("PROCREG_WATCHDOG_PARENT_PID not set")
        .parse()
        .expect("PROCREG_WATCHDOG_PARENT_PID must be a valid PID");

    // ---- "--" 以降の引数を子コマンドとして取得 ----
    let args: Vec<String> = std::env::args().collect();
    let dash_pos = args
        .iter()
        .position(|a| a == "--")
        .expect("Usage: procreg-watchdog -- <child_command> [args...]");
    let child_args = &args[dash_pos + 1..];
    if child_args.is_empty() {
        eprintln!("[watchdog] No child command specified");
        std::process::exit(1);
    }

    // ---- 子プロセスを起動（stdio は継承） ----
    let mut child = Command::new(&child_args[0])
        .args(&child_args[1..])
        .spawn()
        .unwrap_or_else(|e| {
            eprintln!("[watchdog] Failed to spawn child: {e}");
            std::process::exit(1);
        });

    // ---- 監視ループ ----
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
                // 子が先に終了 → 子の終了コードを継承
                std::process::exit(status.code().unwrap_or(0));
            }
            Err(e) => {
                eprintln!("[watchdog] Error waiting for child: {e}");
                std::process::exit(1);
            }
            Ok(None) => {
                // 子はまだ生きている → 次のループへ
                continue;
            }
        }
    }
}

// ---- プラットフォーム固有のプロセス生存確認 ----

/// 指定された PID のプロセスが生存しているか確認する
#[cfg(unix)]
fn process_is_alive(pid: u32) -> bool {
    // kill -0 はシグナルを送信せず、プロセスの存在確認のみを行う
    // POSIX 準拠の全ての Unix 系 OS（Linux, macOS 等）で動作する
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// 指定された PID のプロセスが生存しているか確認する
#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
    // tasklist /FI で PID フィルタリング → 結果に行が含まれていれば生存
    // /NH でヘッダー行を抑制
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.contains(&pid.to_string())
        })
        .unwrap_or(false)
}

// ---- プラットフォーム固有のプロセス強制終了 ----

/// 指定された PID のプロセスを強制終了する
#[cfg(unix)]
fn kill_process(pid: u32) {
    let _ = Command::new("kill").arg(pid.to_string()).status();
}

/// 指定された PID のプロセスを強制終了する
#[cfg(windows)]
fn kill_process(pid: u32) {
    // /F は強制終了フラグ
    let _ = Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .status();
}
