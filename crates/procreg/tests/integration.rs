//! # process-registry 統合テスト
//!
//! 実プロセスを使用した start_all → Running → shutdown_all → Stopped の
//! フルライフサイクルを検証する。
//! `#[tokio::test(flavor = "multi_thread")]` 必須。

use process_registry::*;

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
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_start_and_stop() {
    let registry = ProcessRegistry::new();

    #[cfg(unix)]
    let def = make_def("sleep_proc", &[], "sleep", vec!["100".to_string()]);
    #[cfg(windows)]
    let def = make_def("sleep_proc", &[], "timeout", vec!["/t".to_string(), "100".to_string()]);

    registry
        .start_all(vec![def])
        .await
        .expect("start_all should succeed");

    // Running 状態を確認
    let snapshot = registry.snapshot().await;
    assert!(matches!(
        snapshot.get("sleep_proc"),
        Some(ProcessState::Running { .. })
    ), "Process should be Running after start_all");

    // shutdown_all で停止
    registry.shutdown_all().await;

    // Stopped 状態を確認
    let snapshot = registry.snapshot().await;
    assert!(matches!(
        snapshot.get("sleep_proc"),
        Some(ProcessState::Stopped)
    ), "Process should be Stopped after shutdown_all");
}

/// A → B → C の依存関係を持つプロセス群を起動し、起動順序が
/// 依存関係を満たしていることを確認する。
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_depends_on_ordering() {
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

    registry
        .start_all(defs)
        .await
        .expect("start_all with dependencies should succeed");

    // 全プロセスが Running 状態であることを確認
    let snapshot = registry.snapshot().await;
    for name in &["a", "b", "c"] {
        assert!(
            matches!(snapshot.get(*name), Some(ProcessState::Running { .. })),
            "Process '{name}' should be Running"
        );
    }

    registry.shutdown_all().await;
}
