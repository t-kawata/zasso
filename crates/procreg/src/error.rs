//! # RegistryError — process-registry のエラー型
//!
//! このモジュールはクレート全体で使用するエラー型 `RegistryError` を定義する。
//! `thiserror` により `std::error::Error` が自動導出される。

use std::net::IpAddr;
use std::time::Duration;

/// プロセスレジストリ操作で発生しうるすべてのエラーを表現する。
///
/// 後続の全チケット（M2-1 以降）はこの列挙型のバリアントを返す。
/// `SpawnFailed` は `anyhow::Error` を内包し、OS エラーやコマンド不存在など
/// 任意のエラー原因をラップできるようにしている。
#[derive(Debug, thiserror::Error)]
pub enum RegistryError {
    /// プロセス定義 `src` が依存先 `dep` を宣言したが、
    /// `dep` という名前のプロセスがレジストリに存在しない。
    #[error("Unknown dependency '{dep}' referenced by '{src}'")]
    UnknownDependency {
        /// 依存元のプロセス名。
        src: String,
        /// 参照されたが存在しない依存先のプロセス名。
        dep: String,
    },

    /// プロセス定義群に循環依存が存在する。
    /// トポロジカルソートが不可能なため起動順序を決定できない。
    #[error("Circular dependency detected in process definitions")]
    CircularDependency,

    /// 指定されたプロセス名がレジストリ内に見つからない。
    /// `stop()` や `subscribe_output()` で存在しない名前を指定した場合に発生する。
    #[error("Process '{0}' not found in registry")]
    NotFound(String),

    /// プロセスの生成（`Command::spawn`）に失敗した。
    /// 内包する `anyhow::Error` に OS エラーやコマンド不存在の詳細が格納される。
    #[error("Spawn failed for '{name}': {source}")]
    SpawnFailed {
        /// 生成に失敗したプロセス名。
        name: String,
        /// spawn 失敗の根本原因（OS エラー、パス不存在等）。
        source: anyhow::Error,
    },

    /// `ReadyCondition` の待機がタイムアウトした。
    /// プロセスは起動したが、指定された完了条件が `timeout` 内に満たされなかった。
    #[error("ReadyCondition timed out for '{name}' after {timeout:?}")]
    ReadyTimeout {
        /// タイムアウトが発生したプロセス名。
        name: String,
        /// 設定されていたタイムアウト値。
        timeout: Duration,
    },

    /// 起動前に確認したポートが既に他のプロセスに占有されていた。
    /// ゾンビプロセスの残留や二重起動が原因として考えられる。
    #[error("Port {port} is already in use on {host}")]
    PortInUse {
        /// 競合が発生したホストアドレス。
        host: IpAddr,
        /// 競合が発生したポート番号。
        port: u16,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;
    use std::time::Duration;

    /// UnknownDependency の Display 出力が RFC §6 のフォーマットと一致することを確認する。
    #[test]
    fn unknown_dependency_display() {
        let err = RegistryError::UnknownDependency {
            src: "A".to_string(),
            dep: "B".to_string(),
        };
        assert_eq!(err.to_string(), "Unknown dependency 'B' referenced by 'A'");
    }

    /// CircularDependency の Display 出力が期待値と一致することを確認する。
    #[test]
    fn circular_dependency_display() {
        let err = RegistryError::CircularDependency;
        assert_eq!(
            err.to_string(),
            "Circular dependency detected in process definitions"
        );
    }

    /// NotFound の Display 出力が期待値と一致することを確認する。
    #[test]
    fn not_found_display() {
        let err = RegistryError::NotFound("myapp".to_string());
        assert_eq!(err.to_string(), "Process 'myapp' not found in registry");
    }

    /// SpawnFailed の Display 出力に内包エラーの内容が含まれることを確認する。
    #[test]
    fn spawn_failed_display() {
        let inner = anyhow::Error::msg("command not found");
        let err = RegistryError::SpawnFailed {
            name: "foo".to_string(),
            source: inner,
        };
        let display = err.to_string();
        assert!(display.contains("Spawn failed for 'foo'"));
        assert!(display.contains("command not found"));
    }

    /// SpawnFailed の `.source()` が `Some(...)` を返し、
    /// 内包した `anyhow::Error` と型消去後に内容が一致することを確認する。
    #[test]
    fn spawn_failed_source() {
        let inner = anyhow::Error::msg("command not found");
        let err = RegistryError::SpawnFailed {
            name: "foo".to_string(),
            source: inner,
        };

        let source =
            std::error::Error::source(&err).expect("SpawnFailed should wrap an inner error");

        let source_msg = source.to_string();
        assert_eq!(source_msg, "command not found");
    }

    /// ReadyTimeout の Display 出力が期待値と一致することを確認する。
    #[test]
    fn ready_timeout_display() {
        let err = RegistryError::ReadyTimeout {
            name: "bar".to_string(),
            timeout: Duration::from_secs(5),
        };
        let display = err.to_string();
        assert!(display.contains("ReadyCondition timed out for 'bar'"));
        // Duration の Debug フォーマットは "5s"
        assert!(display.contains("5s"));
    }

    /// RegistryError が `std::error::Error` トレイトを実装していることを確認する。
    /// コンパイルが通れば自動的に証明されるが、明示的に `.source()` を
    /// 全バリアントで呼べることも確認する。
    #[test]
    fn error_trait_impl() {
        let err = RegistryError::NotFound("x".to_string());
        // std::error::Error::source() がコンパイルエラーなく呼べること
        let _ = (&err as &dyn std::error::Error).source();
    }

    /// NotFound の `.source()` は内包エラーがないため `None` を返すことを確認する。
    #[test]
    fn not_found_source_is_none() {
        let err = RegistryError::NotFound("x".to_string());
        assert!(err.source().is_none());
    }

    /// RegistryError が Debug トレイトを実装していることを確認する。
    #[test]
    fn debug_format() {
        let err = RegistryError::CircularDependency;
        let debug_str = format!("{:?}", err);
        assert!(!debug_str.is_empty());
        assert!(debug_str.contains("CircularDependency"));
    }

    /// PortInUse の Display 出力にポート番号とホストアドレスが含まれることを確認する。
    #[test]
    fn port_inuse_display() {
        let host = IpAddr::from([127, 0, 0, 1]);
        let err = RegistryError::PortInUse { host, port: 3912 };
        let display = err.to_string();
        assert!(
            display.contains("3912"),
            "port number should appear in message"
        );
        assert!(
            display.contains("127.0.0.1"),
            "host should appear in message"
        );
    }

    /// PortInUse の `.source()` が `None` を返すことを確認する。
    /// このバリアントは内包エラーを持たないため。
    #[test]
    fn port_inuse_source_is_none() {
        let host = IpAddr::from([127, 0, 0, 1]);
        let err = RegistryError::PortInUse { host, port: 3912 };
        assert!(err.source().is_none());
    }
}
