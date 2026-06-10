//! サイドカープロセスの宣言的定義
//!
//! このモジュールはアプリケーションが管理する全サイドカープロセスの
//! `ProcessDef` を集約する。新しいサイドカーを追加する場合は、
//! `sidecar_defs()` 関数内の `vec![...]` に1エントリ追加するだけでよい。
//!
//! # 設計意図
//!
//! - 宣言性: 起動ロジックを1箇所に集約し、新しいサイドカー追加時の
//!   メンテナンスコストを極小化する
//! - 運命共同体: 全サイドカーは process-registry の管理下で起動・監視・
//!   停止され、アプリケーションと生も死も共にする
//! - 安全性: 起動完了条件・再起動ポリシー・Graceful Shutdown が
//!   全て process-registry の枠組みで統一的に保証される

use std::path::Path;

use process_registry::{ProcessDef, ReadyCondition, RestartPolicy};

use crate::consts::BIFROST_PORT;

/// アプリケーションが管理する全サイドカーの `ProcessDef` を返す。
///
/// # 引数
///
/// - `edition_home`: エディションホームディレクトリの絶対パス。
///   バイナリの配置先を解決するために使用する。
///
/// # 戻り値
///
/// 起動すべきサイドカーの定義リスト。
/// `ProcessRegistry::start_all()` にそのまま渡すことができる。
///
/// # 新しいサイドカーの追加方法
///
/// この関数の戻り値の `vec!` に `ProcessDef` エントリを追加するだけでよい。
/// 例：
/// ```ignore
/// ProcessDef {
///     name: "tensorzero".to_string(),
///     program: edition_home.join("tensorzero/tensorzero").display().to_string(),
///     depends_on: vec!["bifrost".to_string()], // ← Bifrost の後に起動
///     ready: ReadyCondition::TcpPort { host: [127,0,0,1].into(), port: 3913, .. },
///     restart: RestartPolicy::on_crash_default(),
///     ..Default::default()
/// }
/// ```
///
/// `depends_on` による起動順序の解決は process-registry が自動的に行う。
pub(crate) fn sidecar_defs(edition_home: &Path) -> Vec<ProcessDef> {
    vec![
        // ---- Bifrost LLM Proxy ----
        // アプリケーションのLLM通信を中継する軽量プロキシ。
        // 起動後に BIFROST_PORT で受付を開始することを確認してから完了する。
        ProcessDef {
            name: "bifrost".to_string(),
            program: edition_home
                .join("bifrost")
                .join(binary_filename())
                .display()
                .to_string(),
            args: vec!["--port".to_string(), BIFROST_PORT.to_string()],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::on_crash_default(),
            ready: ReadyCondition::TcpPort {
                host: [127, 0, 0, 1].into(),
                port: BIFROST_PORT,
                timeout: std::time::Duration::from_secs(10),
                poll_interval: std::time::Duration::from_millis(200),
            },
            shutdown_timeout: None,
        },
    ]
}

/// 実行ファイル名をプラットフォームに応じて返す
///
/// deploy.rs からも参照されるため pub(crate) で公開する。
pub(crate) fn binary_filename() -> &'static str {
    if cfg!(target_os = "windows") {
        "bifrost-http.exe"
    } else {
        "bifrost-http"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// テスト用の一時ディレクトリをエディションホームとして使用する
    fn test_home() -> std::path::PathBuf {
        std::env::temp_dir().join("zasso-test-sidecar")
    }

    /// sidecar_defs() が1件の ProcessDef を返すことを確認する
    #[test]
    fn sidecar_defs_returns_bifrost_entry() {
        let home = test_home();
        let defs = sidecar_defs(&home);
        assert_eq!(defs.len(), 1, "expected exactly 1 sidecar definition");
    }

    /// Bifrost の ProcessDef の name が "bifrost" であることを確認する
    #[test]
    fn bifrost_def_has_correct_name() {
        let home = test_home();
        let defs = sidecar_defs(&home);
        assert_eq!(defs[0].name, "bifrost");
    }

    /// Bifrost の program パスが edition_home/bifrost/<binary_filename()> の
    /// 形式になっていることを確認する（プラットフォームに応じて拡張子 .exe が付く）
    #[test]
    fn bifrost_def_program_path_ends_with_bifrost_http() {
        let home = test_home();
        let defs = sidecar_defs(&home);
        let program = &defs[0].program;

        // パスに edition_home が含まれる
        let home_str = home.to_string_lossy();
        assert!(
            program.starts_with(home_str.as_ref()),
            "program path should start with edition_home: {program}"
        );

        // パスが bifrost/binary_filename() で終わる（プラットフォーム依存の拡張子を含む）
        let expected_suffix = format!("bifrost{}{}", std::path::MAIN_SEPARATOR, binary_filename());
        assert!(
            program.ends_with(&expected_suffix),
            "program path should end with 'bifrost/{}': {program}",
            binary_filename(),
        );
    }

    /// Bifrost の ready 条件が `TcpPort { port: BIFROST_PORT }` であることを確認する
    #[test]
    fn bifrost_def_ready_uses_bifrost_port() {
        let home = test_home();
        let defs = sidecar_defs(&home);
        match &defs[0].ready {
            ReadyCondition::TcpPort {
                host,
                port,
                timeout,
                poll_interval,
            } => {
                assert!(host.is_loopback(), "host should be loopback address");
                assert_eq!(
                    *port, BIFROST_PORT,
                    "port should be BIFROST_PORT ({BIFROST_PORT})"
                );
                assert!(timeout.as_secs() > 0, "timeout should be positive");
                assert!(
                    poll_interval.as_millis() > 0,
                    "poll_interval should be positive"
                );
            }
            other => panic!("expected ReadyCondition::TcpPort, got {other:?}"),
        }
    }

    /// Bifrost の restart ポリシーが on_crash_default であることを確認する
    #[test]
    fn bifrost_def_restart_is_on_crash_default() {
        let home = test_home();
        let defs = sidecar_defs(&home);
        assert_eq!(defs[0].restart, RestartPolicy::on_crash_default());
    }

    /// Bifrost の depends_on が空であることを確認する
    /// （最初のサイドカーなので依存先はない）
    #[test]
    fn bifrost_def_depends_on_is_empty() {
        let home = test_home();
        let defs = sidecar_defs(&home);
        assert!(defs[0].depends_on.is_empty());
    }

    /// sidecar_defs() が異なる edition_home パスに対して
    /// 正しくパス解決できることを確認する
    #[test]
    fn sidecar_defs_respects_edition_home_path() {
        let home_a = std::path::PathBuf::from("/tmp/edition_a");
        let home_b = std::path::PathBuf::from("/tmp/edition_b");

        let defs_a = sidecar_defs(&home_a);
        let defs_b = sidecar_defs(&home_b);

        assert!(
            defs_a[0].program.contains("edition_a"),
            "program should contain 'edition_a': {}",
            defs_a[0].program
        );
        assert!(
            defs_b[0].program.contains("edition_b"),
            "program should contain 'edition_b': {}",
            defs_b[0].program
        );
    }
}
