//! # process-registry
//!
//! クロスプラットフォームサイドカープロセスマネージャ。
//!
//! このクレートは MYCUTE アプリケーションにおける子プロセスの
//! 定義・起動・監視・停止を統一的に扱う。
//!
//! ## 構成
//!
//! - **Phase 0**（本モジュール）: 純粋データ型・エラー型・状態機械。一切の非同期・I/Oを含まない。
//! - Phase 1: 非同期ランタイム・Mock可能な実行基盤
//! - Phase 2: ライフサイクル管理・統合
//! - Phase 3: プラットフォーム固有実装・Tauri統合

pub mod child;
pub mod error;
pub use crate::error::RegistryError;

pub mod graph;
pub mod panic;
pub mod platform;
pub mod port;
pub mod ready;
pub mod registry;
pub mod signal;
pub mod spawn;
pub mod state;
pub mod watch;
pub(crate) mod watchdog;
pub use crate::registry::ProcessRegistry;
// ChildGuard, RegistryEntry の再公開は利用箇所が出た時点で追加する
pub use crate::state::ProcessState;

/// 1 つのサイドカープロセスの完全な定義。
///
/// すべてのフィールドは起動前に確定しなければならない。
/// この構造体は後続の `RegistryEntry` に格納され、spawn 時の唯一の入力となる。
#[derive(Debug, Clone)]
pub struct ProcessDef {
    /// レジストリ内でこのプロセスを一意に識別する名前。
    /// ログ・エラーメッセージ・依存関係の解決に使用される。
    pub name: String,

    /// 実行するバイナリのパス。
    /// 絶対パスでも相対パスでもよい。空文字の場合は OS の PATH 解決に委ねる。
    pub program: String,

    /// コマンドライン引数のリスト。
    /// program に渡される可変長の引数。空の場合は引数なしで起動する。
    pub args: Vec<String>,

    /// 環境変数の追加・上書きリスト。
    /// 各要素は `(キー, 値)` のタプル。空の場合は親プロセスの環境をそのまま継承する。
    pub env: Vec<(String, String)>,

    /// このプロセスの起動前に Running 状態になっていなければならないプロセス名のリスト。
    /// トポロジカルソート（`resolve_start_order`）の入力となる。
    pub depends_on: Vec<String>,

    /// クラッシュ・終了時の再起動ポリシー。
    pub restart: RestartPolicy,

    /// このプロセスが「起動完了」とみなされる条件。
    /// `depends_on` の解決で、この条件が満たされるのを待つ。
    pub ready: ReadyCondition,

    /// Graceful Shutdown のタイムアウト設定。
    /// `None` の場合は `ShutdownTimeoutConfig::default()` が使用される。
    pub shutdown_timeout: Option<ShutdownTimeoutConfig>,
}

/// プロセス終了・クラッシュ時の再起動ポリシー。
///
/// watch_loop はこのポリシーに基づいて再起動の要否とリトライ上限を判断する。
#[derive(Debug, Clone, PartialEq)]
pub enum RestartPolicy {
    /// 終了・クラッシュしても再起動しない。
    /// 一度プロセスが終了したら `Failed` 状態に遷移する。
    Never,

    /// ゼロ以外の終了コードで異常終了した場合のみ再起動する。
    /// 正常終了（exit code 0）では再起動しない。
    /// PID probe の制約により実際の挙動は Always と同等になる場合がある（§10 注釈）。
    OnCrash {
        /// 再起動の最大試行回数。この回数を超えた場合は `Failed` に遷移する。
        max_retries: u32,

        /// 初回再起動までの待機時間。
        initial_delay: std::time::Duration,

        /// 指数バックオフの係数（1.0 = バックオフなし）。
        backoff_factor: f64,

        /// バックオフの上限。この値を超えて遅延が伸びることはない。
        max_delay: std::time::Duration,
    },

    /// 終了コードに関わらず常に再起動する。
    /// `max_retries` に達するまで無限に再試行する。
    Always {
        /// 再起動の最大試行回数。
        max_retries: u32,

        /// 初回再起動までの待機時間。
        initial_delay: std::time::Duration,

        /// 指数バックオフの係数（1.0 = バックオフなし）。
        backoff_factor: f64,

        /// バックオフの上限。
        max_delay: std::time::Duration,
    },
}

impl RestartPolicy {
    /// `OnCrash` のデフォルト設定を返す。
    ///
    /// - max_retries: 3（最大3回再起動）
    /// - initial_delay: 1秒
    /// - backoff_factor: 2.0（指数バックオフ）
    /// - max_delay: 30秒（バックオフの上限）
    pub fn on_crash_default() -> Self {
        Self::OnCrash {
            max_retries: 3,
            initial_delay: std::time::Duration::from_secs(1),
            backoff_factor: 2.0,
            max_delay: std::time::Duration::from_secs(30),
        }
    }

    /// 指定された試行回数に基づく再起動待機時間を計算する。
    ///
    /// 計算式: `initial_delay * backoff_factor^attempt`（max_delay で上限クランプ）
    /// `Never` の場合は常に `None` を返す。
    /// attempt >= max_retries の場合は `None`（リトライ上限到達）を返す。
    ///
    /// # 未使用警告について
    ///
    /// このメソッドは M7-1（watch_loop）で使用される。現時点では定義のみ。
    #[allow(dead_code)]
    pub(crate) fn next_delay(&self, attempt: u32) -> Option<std::time::Duration> {
        let (max_retries, initial, factor, max_d) = match self {
            Self::Never => return None,
            Self::OnCrash {
                max_retries,
                initial_delay,
                backoff_factor,
                max_delay,
            } => (*max_retries, *initial_delay, *backoff_factor, *max_delay),
            Self::Always {
                max_retries,
                initial_delay,
                backoff_factor,
                max_delay,
            } => (*max_retries, *initial_delay, *backoff_factor, *max_delay),
        };
        if attempt >= max_retries {
            return None;
        }
        let secs = initial.as_secs_f64() * factor.powi(attempt as i32);
        Some(std::time::Duration::from_secs_f64(
            secs.min(max_d.as_secs_f64()),
        ))
    }
}

/// プロセスが「起動完了」とみなされる条件。
///
/// `start_one` はこの条件が満たされるのを `tokio::time::timeout` 付きで待機する。
#[derive(Debug, Clone)]
pub enum ReadyCondition {
    /// stdout または stderr に特定の文字列が含まれる行が出力されるまで待つ。
    LogContains {
        /// 待機対象の部分文字列。このパターンが行に含まれると完了とみなす。
        pattern: String,

        /// パターン一致の最大待機時間。これを超えるとタイムアウトエラー。
        timeout: std::time::Duration,
    },

    /// 指定した TCP ポートが accept を受け付けるまで待つ。
    /// ポーリング間隔 `poll_interval` で接続試行を繰り返す。
    TcpPort {
        /// 接続先ホスト。ローカルサイドカーなら `127.0.0.1`、
        /// リモートなら任意の IP アドレスを指定できる。
        host: std::net::IpAddr,

        /// 接続先ポート番号。
        port: u16,

        /// 接続成功の最大待機時間。これを超えるとタイムアウトエラー。
        timeout: std::time::Duration,

        /// 接続試行の間隔。短すぎるとポートスキャンと誤認されるリスクがある。
        poll_interval: std::time::Duration,
    },

    /// 固定時間だけ待機した後に起動完了とみなす。
    /// 最も単純だが最も不確実な方法（プロセスが実際に準備できている保証はない）。
    Delay(std::time::Duration),

    /// 条件なし。`spawn()` 直後に即座に「起動完了」とみなす。
    /// プロセスが即座に応答を開始する場合に使用する。
    Immediate,
}

/// Graceful Shutdown のタイムアウト設定。
///
/// OS ごとに異なるシグナル機構に対応するため、Unix と Windows で独立した
/// タイムアウト値を持つ。
#[derive(Debug, Clone)]
pub struct ShutdownTimeoutConfig {
    /// Unix: SIGTERM 送信後に子プロセスが自発的に終了するまでの最大待機時間。
    /// この時間を超えると SIGKILL が送られる。
    pub unix_sigterm_timeout: std::time::Duration,

    /// Windows: CTRL_BREAK_EVENT 送信後に `TerminateProcess` を呼ぶまでの
    /// 最大待機時間。
    pub windows_ctrl_break_timeout: std::time::Duration,
}

impl Default for ShutdownTimeoutConfig {
    /// デフォルトのタイムアウト値を返す。
    ///
    /// Unix: 5 秒（SIGTERM → 待機 → SIGKILL）
    /// Windows: 8 秒（CTRL_BREAK_EVENT → TerminateProcess）
    fn default() -> Self {
        Self {
            unix_sigterm_timeout: std::time::Duration::from_secs(5),
            windows_ctrl_break_timeout: std::time::Duration::from_secs(8),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::IpAddr;
    use std::str::FromStr;
    use std::time::Duration;

    /// ProcessDef の全フィールドに値を代入し、読み出し値を確認する。
    #[test]
    fn process_def_fields() {
        let restart = RestartPolicy::Never;
        let ready = ReadyCondition::Immediate;
        let def = ProcessDef {
            name: "test-process".to_string(),
            program: "/usr/bin/echo".to_string(),
            args: vec!["hello".to_string()],
            env: vec![("MY_VAR".to_string(), "value".to_string())],
            depends_on: vec!["db".to_string()],
            restart,
            ready,
            shutdown_timeout: None,
        };

        assert_eq!(def.name, "test-process");
        assert_eq!(def.program, "/usr/bin/echo");
        assert_eq!(def.args, vec!["hello"]);
        assert_eq!(def.env, vec![("MY_VAR".to_string(), "value".to_string())]);
        assert_eq!(def.depends_on, vec!["db"]);
        assert_eq!(def.restart, RestartPolicy::Never);
        assert!(matches!(def.ready, ReadyCondition::Immediate));
        assert!(def.shutdown_timeout.is_none());
    }

    /// RestartPolicy::Never が構築でき、バリアントが正しいことを確認する。
    #[test]
    fn restart_policy_never() {
        let policy = RestartPolicy::Never;
        assert!(matches!(policy, RestartPolicy::Never));
    }

    /// RestartPolicy::OnCrash の全フィールドが代入・読み出しできることを確認する。
    #[test]
    fn restart_policy_on_crash() {
        let policy = RestartPolicy::OnCrash {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            backoff_factor: 2.0,
            max_delay: Duration::from_secs(30),
        };

        assert!(matches!(policy, RestartPolicy::OnCrash { .. }));
        if let RestartPolicy::OnCrash {
            max_retries,
            initial_delay,
            backoff_factor,
            max_delay,
        } = policy
        {
            assert_eq!(max_retries, 3);
            assert_eq!(initial_delay, Duration::from_secs(1));
            assert!((backoff_factor - 2.0).abs() < f64::EPSILON);
            assert_eq!(max_delay, Duration::from_secs(30));
        }
    }

    /// RestartPolicy::Always の全フィールドが代入・読み出しできることを確認する。
    #[test]
    fn restart_policy_always() {
        let policy = RestartPolicy::Always {
            max_retries: 5,
            initial_delay: Duration::from_millis(500),
            backoff_factor: 1.5,
            max_delay: Duration::from_secs(60),
        };

        assert!(matches!(policy, RestartPolicy::Always { .. }));
        if let RestartPolicy::Always {
            max_retries,
            initial_delay,
            backoff_factor,
            max_delay,
        } = policy
        {
            assert_eq!(max_retries, 5);
            assert_eq!(initial_delay, Duration::from_millis(500));
            assert!((backoff_factor - 1.5).abs() < f64::EPSILON);
            assert_eq!(max_delay, Duration::from_secs(60));
        }
    }

    /// RestartPolicy の PartialEq が正しく動作することを確認する。
    #[test]
    fn restart_policy_equality() {
        let never_policy = RestartPolicy::Never;
        let same_never_policy = RestartPolicy::Never;
        let on_crash_policy = RestartPolicy::OnCrash {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            backoff_factor: 2.0,
            max_delay: Duration::from_secs(30),
        };

        // 同値の Never どうしは等しい
        assert_eq!(never_policy, same_never_policy);
        // 異なるバリアントは等しくない
        assert_ne!(never_policy, on_crash_policy);
    }

    /// ReadyCondition::Immediate が構築できることを確認する。
    #[test]
    fn ready_condition_immediate() {
        let condition = ReadyCondition::Immediate;
        assert!(matches!(condition, ReadyCondition::Immediate));
    }

    /// ReadyCondition::Delay の Duration 値が正しく保持されることを確認する。
    #[test]
    fn ready_condition_delay() {
        let condition = ReadyCondition::Delay(Duration::from_secs(5));
        assert!(matches!(condition, ReadyCondition::Delay(d) if d == Duration::from_secs(5)));
    }

    /// ReadyCondition::LogContains の全フィールドが代入・読み出しできることを確認する。
    #[test]
    fn ready_condition_log_contains() {
        let condition = ReadyCondition::LogContains {
            pattern: "ready".to_string(),
            timeout: Duration::from_secs(30),
        };

        assert!(matches!(condition, ReadyCondition::LogContains { .. }));
        if let ReadyCondition::LogContains { pattern, timeout } = condition {
            assert_eq!(pattern, "ready");
            assert_eq!(timeout, Duration::from_secs(30));
        }
    }

    /// ReadyCondition::TcpPort の全フィールドが代入・読み出しできることを確認する。
    #[test]
    fn ready_condition_tcp_port() {
        let host = IpAddr::from_str("127.0.0.1").unwrap();
        let condition = ReadyCondition::TcpPort {
            host,
            port: 8080,
            timeout: Duration::from_secs(60),
            poll_interval: Duration::from_millis(100),
        };

        assert!(matches!(condition, ReadyCondition::TcpPort { .. }));
        if let ReadyCondition::TcpPort {
            host: h,
            port,
            timeout,
            poll_interval,
        } = condition
        {
            assert_eq!(h, IpAddr::from_str("127.0.0.1").unwrap());
            assert_eq!(port, 8080);
            assert_eq!(timeout, Duration::from_secs(60));
            assert_eq!(poll_interval, Duration::from_millis(100));
        }
    }

    /// ShutdownTimeoutConfig::default() の値が設計値（Unix 5s, Windows 8s）と
    /// 一致することを確認する。
    #[test]
    fn shutdown_timeout_config_default() {
        let config = ShutdownTimeoutConfig::default();
        assert_eq!(config.unix_sigterm_timeout, Duration::from_secs(5));
        assert_eq!(config.windows_ctrl_break_timeout, Duration::from_secs(8));
    }

    /// ShutdownTimeoutConfig がカスタム値で構築できることを確認する。
    #[test]
    fn shutdown_timeout_config_custom() {
        let config = ShutdownTimeoutConfig {
            unix_sigterm_timeout: Duration::from_secs(10),
            windows_ctrl_break_timeout: Duration::from_secs(15),
        };
        assert_eq!(config.unix_sigterm_timeout, Duration::from_secs(10));
        assert_eq!(config.windows_ctrl_break_timeout, Duration::from_secs(15));
    }

    /// 全4型が Clone トレイトを実装し、クローンが元の値と一致することを確認する。
    #[test]
    fn all_types_impl_clone() {
        // ProcessDef の Clone
        let def = ProcessDef {
            name: "p1".to_string(),
            program: "/bin/true".to_string(),
            args: vec![],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: Some(ShutdownTimeoutConfig::default()),
        };
        let def_cloned = def.clone();
        assert_eq!(def.name, def_cloned.name);
        assert_eq!(def.program, def_cloned.program);

        // RestartPolicy の Clone
        let policy = RestartPolicy::OnCrash {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            backoff_factor: 2.0,
            max_delay: Duration::from_secs(30),
        };
        let policy_cloned = policy.clone();
        assert_eq!(policy, policy_cloned);

        // ReadyCondition の Clone
        let condition = ReadyCondition::Delay(Duration::from_secs(3));
        let condition_cloned = condition.clone();
        assert!(
            matches!(condition_cloned, ReadyCondition::Delay(d) if d == Duration::from_secs(3))
        );

        // ShutdownTimeoutConfig の Clone
        let config = ShutdownTimeoutConfig::default();
        let config_cloned = config.clone();
        assert_eq!(
            config.unix_sigterm_timeout,
            config_cloned.unix_sigterm_timeout
        );
    }

    /// ProcessDef のクローンがディープコピーであり、元の値を変更しても
    /// クローンに影響しないことを確認する。
    #[test]
    fn process_def_clone_independence() {
        let mut def = ProcessDef {
            name: "original".to_string(),
            program: "/bin/true".to_string(),
            args: vec!["arg1".to_string()],
            env: vec![],
            depends_on: vec![],
            restart: RestartPolicy::Never,
            ready: ReadyCondition::Immediate,
            shutdown_timeout: None,
        };

        let cloned = def.clone();

        // 元の値を変更する
        def.name = "modified".to_string();
        def.args.push("arg2".to_string());

        // クローンに影響がないことを確認
        assert_eq!(cloned.name, "original");
        assert_eq!(cloned.args, vec!["arg1"]);
    }

    // ============================================================
    // M1-1: RestartPolicy::on_crash_default / next_delay
    // ============================================================

    /// on_crash_default() の全フィールドが期待値と一致することを確認する。
    #[test]
    fn on_crash_default_values() {
        let policy = RestartPolicy::on_crash_default();
        assert!(matches!(policy, RestartPolicy::OnCrash { .. }));
        if let RestartPolicy::OnCrash {
            max_retries,
            initial_delay,
            backoff_factor,
            max_delay,
        } = policy
        {
            assert_eq!(max_retries, 3);
            assert_eq!(initial_delay, std::time::Duration::from_secs(1));
            assert!((backoff_factor - 2.0).abs() < f64::EPSILON);
            assert_eq!(max_delay, std::time::Duration::from_secs(30));
        } else {
            panic!("Expected OnCrash variant");
        }
    }

    /// next_delay() が attempt=0 で initial_delay を返すことを確認する。
    #[test]
    fn next_delay_attempt_zero() {
        let policy = RestartPolicy::on_crash_default();
        let delay = policy.next_delay(0);
        assert_eq!(delay, Some(std::time::Duration::from_secs(1)));
    }

    /// next_delay() が attempt=1 で initial_delay * factor を返すことを確認する。
    #[test]
    fn next_delay_attempt_one() {
        let policy = RestartPolicy::on_crash_default();
        let delay = policy.next_delay(1);
        assert_eq!(delay, Some(std::time::Duration::from_secs(2)));
    }

    /// next_delay() が attempt=2 で initial_delay * factor^2 を返すことを確認する。
    #[test]
    fn next_delay_attempt_two() {
        let policy = RestartPolicy::on_crash_default();
        let delay = policy.next_delay(2);
        assert_eq!(delay, Some(std::time::Duration::from_secs(4)));
    }

    /// next_delay() が attempt >= max_retries で None を返すことを確認する。
    #[test]
    fn next_delay_retries_exhausted() {
        let policy = RestartPolicy::on_crash_default();
        assert_eq!(policy.next_delay(3), None);
        assert_eq!(policy.next_delay(100), None);
    }

    /// next_delay() の計算結果が max_delay を超える場合にクランプされることを確認する。
    #[test]
    fn next_delay_max_delay_clamp() {
        let policy = RestartPolicy::OnCrash {
            max_retries: 10,
            initial_delay: std::time::Duration::from_secs(1),
            backoff_factor: 10.0,
            max_delay: std::time::Duration::from_secs(5),
        };
        // attempt=1: 1 * 10^1 = 10s → max_delay=5s でクランプ
        let delay = policy.next_delay(1);
        assert_eq!(delay, Some(std::time::Duration::from_secs(5)));
    }

    /// RestartPolicy::Never では next_delay() が常に None を返すことを確認する。
    #[test]
    fn next_delay_never_returns_none() {
        let policy = RestartPolicy::Never;
        assert_eq!(policy.next_delay(0), None);
        assert_eq!(policy.next_delay(100), None);
    }

    /// next_delay() が同一入力に対して常に同一出力を返すことを確認する。
    #[test]
    fn next_delay_deterministic() {
        let policy = RestartPolicy::on_crash_default();
        let expected = policy.next_delay(2);
        for _ in 0..100 {
            assert_eq!(policy.next_delay(2), expected);
        }
    }

    /// OnCrash と Always で同一パラメータの場合、同一の遅延値が返ることを確認する。
    #[test]
    fn next_delay_always_same_as_on_crash() {
        let policy = RestartPolicy::Always {
            max_retries: 3,
            initial_delay: std::time::Duration::from_secs(1),
            backoff_factor: 2.0,
            max_delay: std::time::Duration::from_secs(30),
        };
        assert_eq!(
            policy.next_delay(0),
            Some(std::time::Duration::from_secs(1))
        );
        assert_eq!(
            policy.next_delay(1),
            Some(std::time::Duration::from_secs(2))
        );
        assert_eq!(policy.next_delay(3), None);
    }
}
