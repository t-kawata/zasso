//! # ReadyCondition 待機
//!
//! プロセス起動完了条件 `ReadyCondition` の4バリアントを非同期待機する。

use tokio::sync::broadcast;

use crate::error::RegistryError;
use crate::ReadyCondition;

/// `ReadyCondition` で指定された条件が満たされるのを待機する。
///
/// 全バリアントに `tokio::time::timeout` を適用し、タイムアウト時は
/// `RegistryError::ReadyTimeout` を返す。
///
/// # バリアント別動作
///
/// - `Immediate`: 待機せず即座に成功する。
/// - `Delay`: 指定された時間だけ待機する。
/// - `LogContains`: `output_tx` を購読し、パターンに一致する行を待機する。
/// - `TcpPort`: 指定された TCP ポートへの接続が成功するまでポーリングする。
///
/// # エラー
///
/// - `ReadyTimeout`: タイムアウト時間内に条件が満たされなかった。
/// - `SpawnFailed`: LogContains で出力チャンネルが切断された。
/// # 未使用警告について
///
/// この関数は M8-1（spawn_one）で使用される。現時点では定義のみ。
#[allow(dead_code)]
pub(crate) async fn wait_ready(
    condition: &ReadyCondition,
    name: &str,
    output_tx: broadcast::Sender<String>,
) -> Result<(), RegistryError> {
    match condition {
        ReadyCondition::Immediate => Ok(()),

        ReadyCondition::Delay(delay) => {
            tokio::time::sleep(*delay).await;
            Ok(())
        }

        ReadyCondition::LogContains { pattern, timeout } => {
            let mut rx = output_tx.subscribe();
            let pat = pattern.clone();

            let result = tokio::time::timeout(*timeout, async move {
                loop {
                    match rx.recv().await {
                        Ok(line) if line.contains(&pat) => {
                            return Ok::<(), anyhow::Error>(());
                        }
                        Ok(_) => continue,
                        Err(broadcast::error::RecvError::Closed) => {
                            return Err(anyhow::anyhow!(
                                "output channel closed while waiting for pattern '{}'",
                                pat,
                            ));
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    }
                }
            })
            .await;

            match result {
                Ok(Ok(())) => Ok(()),
                Ok(Err(e)) => Err(RegistryError::SpawnFailed {
                    name: name.to_string(),
                    source: e,
                }),
                Err(_) => Err(RegistryError::ReadyTimeout {
                    name: name.to_string(),
                    timeout: *timeout,
                }),
            }
        }

        ReadyCondition::TcpPort {
            host,
            port,
            timeout,
            poll_interval,
        } => {
            let addr = format!("{host}:{port}");
            let poll = *poll_interval;

            let result = tokio::time::timeout(*timeout, async move {
                loop {
                    if tokio::net::TcpStream::connect(&addr).await.is_ok() {
                        return Ok::<(), ()>(());
                    }
                    tokio::time::sleep(poll).await;
                }
            })
            .await;

            match result {
                Ok(Ok(())) => Ok(()),
                _ => Err(RegistryError::ReadyTimeout {
                    name: name.to_string(),
                    timeout: *timeout,
                }),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ReadyCondition;
    use std::net::IpAddr;
    use std::str::FromStr;
    use std::time::Duration;
    use tokio::sync::broadcast;

    /// Immediate が即座に Ok を返すことを確認する。
    #[tokio::test]
    async fn immediate_returns_ok() {
        let (tx, _rx) = broadcast::channel(16);
        let result = wait_ready(&ReadyCondition::Immediate, "test", tx).await;
        assert!(result.is_ok());
    }

    /// Delay が指定時間待機後に Ok を返すことを確認する。
    #[tokio::test]
    async fn delay_waits_for_duration() {
        let (tx, _rx) = broadcast::channel(16);
        let start = tokio::time::Instant::now();
        let result = wait_ready(
            &ReadyCondition::Delay(Duration::from_millis(10)),
            "test",
            tx,
        )
        .await;
        let elapsed = start.elapsed();
        assert!(result.is_ok());
        // 最低でも指定時間の半分以上は経過しているはず
        assert!(elapsed >= Duration::from_millis(5));
    }

    /// LogContains がパターン一致行を検出して Ok を返すことを確認する。
    #[tokio::test]
    async fn log_contains_matches() {
        let (tx, _rx) = broadcast::channel(16);
        let condition = ReadyCondition::LogContains {
            pattern: "ready".to_string(),
            timeout: Duration::from_secs(5),
        };
        let tx_clone = tx.clone();

        // 別タスクで "server ready" を送信する
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(10)).await;
            let _ = tx_clone.send("server ready".to_string());
        });

        let result = wait_ready(&condition, "test", tx).await;
        assert!(result.is_ok());
    }

    /// LogContains がタイムアウト時に ReadyTimeout を返すことを確認する。
    #[tokio::test]
    async fn log_contains_timeout() {
        let (tx, _rx) = broadcast::channel(16);
        let condition = ReadyCondition::LogContains {
            pattern: "never_match".to_string(),
            timeout: Duration::from_millis(10),
        };

        let result = wait_ready(&condition, "test", tx).await;
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            RegistryError::ReadyTimeout { .. }
        ));
    }

    /// LogContains がチャンネルの Lagged をスキップして継続することを確認する。
    ///
    /// チャンネル Closed（全 Sender のドロップ）は wait_ready が自身で
    /// Sender を保持しているため通常発生しない。防御的にハンドリング
    /// されているが、本テストでは Lagged スキップ後の正常動作を確認する。
    #[tokio::test]
    async fn log_contains_skips_lagged() {
        let (tx, rx) = broadcast::channel::<String>(4);
        let condition = ReadyCondition::LogContains {
            pattern: "ready".to_string(),
            timeout: Duration::from_secs(5),
        };
        let tx_clone = tx.clone();

        // 別タスクで大量送信 → Lagged → "server ready" を送信
        tokio::spawn(async move {
            // capacity 4 を超えて送信して rx を lag させる
            for i in 0..10 {
                let _ = tx_clone.send(format!("line {i}"));
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
            let _ = tx_clone.send("server ready".to_string());
        });

        // rx を一度も読まずに subscribe する（wait_ready が新しく subscribe する）
        drop(rx);
        let result = wait_ready(&condition, "test", tx).await;
        assert!(result.is_ok());
    }

    /// TcpPort が実際の TCP 接続を受け付けるポートに対して Ok を返すことを確認する。
    #[tokio::test]
    async fn tcp_port_bind_and_connect() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("Failed to bind test listener");
        let port = listener.local_addr().unwrap().port();

        let (tx, _rx) = broadcast::channel(16);
        let host = IpAddr::from_str("127.0.0.1").unwrap();
        let condition = ReadyCondition::TcpPort {
            host,
            port,
            timeout: Duration::from_secs(5),
            poll_interval: Duration::from_millis(5),
        };

        // リスナーを別タスクで受け付ける
        tokio::spawn(async move {
            let _ = listener.accept().await;
        });

        let result = wait_ready(&condition, "test", tx).await;
        assert!(result.is_ok());
    }
}
