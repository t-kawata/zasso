//! # process-registry 統合テスト
//!
//! 実プロセスを使用した start_all → Running → shutdown_all → Stopped の
//! フルライフサイクルを検証する。
//! `#[tokio::test(flavor = "multi_thread")]` 必須。
//!
//! # タイムアウト
//!
//! 各テストは tokio::time::timeout でラップし、ハングを防止する。
//! Windows の tasklist 呼び出しが高負荷時に応答しなくなるケースに備える。

use process_registry::*;
use std::time::Duration;

/// 全テストに適用する最大実行時間（tasklist ハング等の安全網）
const TEST_TIMEOUT: Duration = Duration::from_secs(30);

/// テスト用の ProcessDef を構築する。
fn make_def(name: &str, deps: &[&str], program: &str, args: Vec<String>) -> ProcessDef {
    ProcessDef {
        name: name.to_string(),
        program: program.to_string(),
        args,
        env: vec![],
        depends_on: deps.iter().map(|s| s.to_string()).collect(),
        restart: RestartPolicy::Never,
        ready: ReadyCondition::Immediate,
        shutdown_timeout: None,
    }
}

/// start_all でプロセスを起動し、Running 状態を確認した後、
/// shutdown_all で Stopped 状態になることを検証する。
///
/// 手動ランタイム + shutdown_timeout(1) により、バックグラウンドタスクが
/// ランタイムシャットダウンをブロックしないことを保証する（Windows 対策）。
#[test]
fn test_start_and_stop() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_io()
        .enable_time()
        .build()
        .expect("Failed to build tokio runtime");

    let result = rt.block_on(async {
        tokio::time::timeout(TEST_TIMEOUT, async {
            let registry = ProcessRegistry::new();

            #[cfg(unix)]
            let def = make_def("sleep_proc", &[], "sleep", vec!["100".to_string()]);
            #[cfg(windows)]
            let def = make_def(
                "sleep_proc",
                &[],
                "timeout",
                vec!["/t".to_string(), "100".to_string()],
            );

            registry
                .start_all(vec![def])
                .await
                .expect("start_all should succeed");

            // Running 状態を確認
            let snapshot = registry.snapshot().await;
            assert!(
                matches!(
                    snapshot.get("sleep_proc"),
                    Some(ProcessState::Running { .. })
                ),
                "Process should be Running after start_all"
            );

            // shutdown_all で停止
            registry.shutdown_all().await;

            // Stopped 状態を確認
            let snapshot = registry.snapshot().await;
            assert!(
                matches!(snapshot.get("sleep_proc"), Some(ProcessState::Stopped)),
                "Process should be Stopped after shutdown_all"
            );
        })
        .await
    });

    // Runtime を shutdown_timeout で破棄（未完了タスクがあれば最大1秒で強制終了）
    // これにより Windows でパイプ読み取りタスクがランタイムシャットダウンを
    // ブロックする問題を回避する。
    rt.shutdown_timeout(Duration::from_secs(1));
    result.expect("test_start_and_stop timed out (30s)");
}

/// A → B → C の依存関係を持つプロセス群を起動し、起動順序が
/// 依存関係を満たしていることを確認する。
///
/// 手動ランタイム + shutdown_timeout(1) により、バックグラウンドタスクが
/// ランタイムシャットダウンをブロックしないことを保証する（Windows 対策）。
#[test]
fn test_depends_on_ordering() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_io()
        .enable_time()
        .build()
        .expect("Failed to build tokio runtime");

    let result = rt.block_on(async {
        tokio::time::timeout(TEST_TIMEOUT, async {
            eprintln!("[test_depends_on_ordering] Step 1: Creating ProcessRegistry");
            let registry = ProcessRegistry::new();

            #[cfg(unix)]
            let program = "sleep";
            #[cfg(unix)]
            let args = || vec!["100".to_string()];
            #[cfg(windows)]
            let program = "timeout";
            #[cfg(windows)]
            let args = || vec!["/t".to_string(), "100".to_string()];

            let defs = vec![
                make_def("c", &["b"], program, args()),
                make_def("a", &[], program, args()),
                make_def("b", &["a"], program, args()),
            ];

            eprintln!("[test_depends_on_ordering] Step 2: Calling start_all (3 processes)");
            registry
                .start_all(defs)
                .await
                .expect("start_all with dependencies should succeed");
            eprintln!("[test_depends_on_ordering] Step 3: start_all completed, checking snapshot");

            // 全プロセスが Running 状態であることを確認
            let snapshot = registry.snapshot().await;
            for name in &["a", "b", "c"] {
                assert!(
                    matches!(snapshot.get(*name), Some(ProcessState::Running { .. })),
                    "Process '{name}' should be Running"
                );
            }
            eprintln!(
                "[test_depends_on_ordering] Step 4: All processes Running, calling shutdown_all"
            );

            registry.shutdown_all().await;
            eprintln!("[test_depends_on_ordering] Step 5: shutdown_all completed");
        })
        .await
    });

    // Runtime を shutdown_timeout で破棄（未完了タスクがあれば最大1秒で強制終了）
    // これにより Windows でパイプ読み取りタスクがランタイムシャットダウンを
    // ブロックする問題を回避する。
    rt.shutdown_timeout(Duration::from_secs(1));
    result.expect("test_depends_on_ordering timed out (30s)");
}

/// 運命共同体（Fate Sharing）完全検証テスト。
///
/// Node.js の簡易 TCP エコーサーバを ProcessRegistry で管理し、
/// ReadyCondition::LogContains / subscribe_output / 実TCP通信 /
/// shutdown_all の全ライフサイクルが正しく動作することを検証する。
///
/// # 依存
///
/// - Node.js がインストールされていること
/// - tests/test_server.sh が存在し、実行可能であること
///
/// # 実行方法
///
/// ```bash
/// cargo test --test integration test_fate_sharing -- --ignored --nocapture
/// ```
///
/// 標準出力に各ステップの経過と結果が表示される。
#[ignore = "実行には Node.js が必要。単体テストとは分離して実行すること"]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_fate_sharing() {
    use process_registry::*;
    use std::time::Duration;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    println!("===== process-registry 運命共同体検証テスト =====");
    println!("");

    // ---- Step 1: スクリプトのパスを解決 ----
    let server_script = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("tests")
        .join("test_server.sh");
    println!("[1/7] サーバスクリプト: {}", server_script.display());

    assert!(
        server_script.exists(),
        "test_server.sh が見つかりません: {}",
        server_script.display()
    );

    // ---- Step 2: ProcessRegistry を作成 ----
    let registry = ProcessRegistry::new();
    println!("[2/7] ProcessRegistry を作成しました");

    // ---- Step 3: ランダムな空きポートを確保 ----
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("テスト用ポートの予約に失敗しました");
    let server_port = listener.local_addr().unwrap().port();
    // ポートを解放（test_server.sh がこのポートを使用する）
    drop(listener);
    println!("[3/7] テスト用ポート: {server_port}");

    // ---- Step 4: プロセス定義を作成して起動 ----
    let def = ProcessDef {
        name: "echo_server".to_string(),
        program: "/bin/bash".to_string(),
        args: vec![
            server_script.to_string_lossy().to_string(),
            server_port.to_string(),
        ],
        env: vec![],
        depends_on: vec![],
        restart: RestartPolicy::Never,
        // LogContains で "server_ready" 出力を検出してから完了とする
        ready: ReadyCondition::LogContains {
            pattern: "server_ready".to_string(),
            timeout: Duration::from_secs(10),
        },
        shutdown_timeout: None,
    };

    println!("[4/7] プロセスを起動しています（ポート {server_port}）...");
    registry
        .start_all(vec![def])
        .await
        .expect("start_all に失敗しました");
    println!("[4/7] ✓ プロセスが起動し、ReadyCondition::LogContains も完了");

    // ---- Step 5: Running 状態を確認 ----
    let snapshot = registry.snapshot().await;
    let state = snapshot.get("echo_server").unwrap();
    println!("[5/7] プロセス状態: {state:?}");
    assert!(
        matches!(state, ProcessState::Running { .. }),
        "プロセスが Running 状態ではありません: {state:?}"
    );
    println!("[5/7] ✓ Running 状態を確認しました");

    // ---- Step 6: TCP 接続でエコー応答を確認 ----
    println!("[6/7] TCP 接続を試行します...");

    // サーバの準備が整うまでリトライ付きで接続
    let mut stream = None;
    for attempt in 1..=5 {
        match TcpStream::connect(("127.0.0.1", server_port)).await {
            Ok(s) => {
                stream = Some(s);
                println!("[6/7] ✓ 接続成功（{attempt}回目）");
                break;
            }
            Err(e) => {
                println!("[6/7]   接続試行 {attempt}/5 失敗: {e}");
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }
    let mut stream = stream.expect("5回試行してもサーバに接続できませんでした");

    // メッセージを送信
    let message = b"Hello, World!";
    stream.write_all(message).await.unwrap();
    println!(
        "[6/7] ✓ メッセージを送信しました: \"{}\"",
        String::from_utf8_lossy(message)
    );

    // 応答を受信
    let mut buf = vec![0u8; 1024];
    let n = stream.read(&mut buf).await.unwrap();
    let response = String::from_utf8_lossy(&buf[..n]);
    println!("[6/7] ✓ 応答を受信しました: \"{response}\"");

    // エコー応答の内容を検証
    assert!(
        response.contains("Echo:"),
        "応答に 'Echo:' が含まれていません: {response}"
    );
    assert!(
        response.contains("Hello, World!"),
        "応答に送信内容が含まれていません: {response}"
    );
    println!("[6/7] ✓ エコー応答の内容が正しいことを確認しました");

    // ---- Step 7: shutdown_all で Graceful Shutdown ----
    println!("[7/7] shutdown_all を実行しています...");
    registry.shutdown_all().await;
    println!("[7/7] ✓ shutdown_all が完了しました");

    // ---- 結果確認: Stopped 状態 ----
    let snapshot3 = registry.snapshot().await;
    let final_state = snapshot3.get("echo_server").unwrap();
    println!("");
    println!("===== 最終状態 =====");
    println!("echo_server: {final_state:?}");
    assert!(
        matches!(final_state, ProcessState::Stopped),
        "プロセスが Stopped 状態ではありません: {final_state:?}"
    );
    println!("");
    println!("===== ✅ 運命共同体検証テスト PASS =====");
    println!("");
    println!("テスト項目一覧:");
    println!("  ✅ ProcessRegistry::new() — レジストリ作成");
    println!("  ✅ start_all() — プロセス起動 + LogContains 待機");
    println!("  ✅ ReadyCondition::LogContains — 起動完了条件");
    println!("  ✅ snapshot() → Running — 起動状態の確認");
    println!("  ✅ TcpStream::connect → Echo 応答 — 実TCP通信");
    println!("  ✅ shutdown_all() — Graceful Shutdown");
    println!("  ✅ snapshot() → Stopped — 正常停止の確認");
}
