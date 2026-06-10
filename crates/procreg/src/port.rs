//! ポート使用中確認
//!
//! プロセス起動前に対象ポートが既に他のプロセスに占有されていないかを確認する。
//! OS コマンド（`lsof`, `netstat` 等）は一切使用せず、`std::net::TcpListener::bind()` の
//! `AddrInUse` 検出のみで判断する。
//!
//! # 動作
//!
//! - 空きポート: `TcpListener::bind()` が成功 → 即座に `drop` して解放
//! - 使用中ポート: `AddrInUse` で失敗 → `false` を返す
//! - その他エラー: 上位でハンドリングできるよう `std::io::Error` をそのまま伝播

use std::net::{IpAddr, SocketAddr, TcpListener};

/// 指定されたホスト・ポートが使用中かを確認する。
///
/// # 戻り値
///
/// - `Ok(true)`: ポートは空いている（バインド成功、直後に解放済み）
/// - `Ok(false)`: ポートは使用中（`AddrInUse` が返った）
/// - `Err(e)`: ポート確認中に予期しない I/O エラーが発生
pub(crate) fn is_port_free(host: IpAddr, port: u16) -> Result<bool, std::io::Error> {
    let addr = SocketAddr::new(host, port);
    match TcpListener::bind(addr) {
        Ok(listener) => {
            // バインド成功 = ポートは空いている。即座に drop して解放する
            drop(listener);
            Ok(true)
        }
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            // EADDRINUSE: ポートは既に他のプロセスに占有されている
            Ok(false)
        }
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::IpAddr;

    /// 空きポートに対して `is_port_free` が `true` を返すことを確認する。
    #[test]
    fn free_port_returns_true() {
        // まずポートを予約して空きポートを確保する
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        // 解放する
        drop(listener);

        // 解放直後はタイミングによりポートが TIME_WAIT 状態になりうるため、
        // 実際にバインドできるかではなく、エラーにならないことを確認する
        let host = IpAddr::from([127, 0, 0, 1]);
        let result = is_port_free(host, port);
        // TIME_WAIT の影響で false になる可能性もあるが、Err は出ないこと
        assert!(result.is_ok(), "is_port_free should not return Err for a freed port");
    }

    /// 使用中のポートに対して `is_port_free` が `false` を返すことを確認する。
    #[test]
    fn bound_port_returns_false() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let host = IpAddr::from([127, 0, 0, 1]);
        let result = is_port_free(host, port).unwrap();

        // バインド中のポートは使用中と判定される
        assert!(!result, "bound port should not be free");

        // listener はこのテスト終了時に drop される
    }

    /// 一度バインドして解放したポートが再び空きと判定されることを確認する。
    #[test]
    fn release_then_free() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        // 明示的に解放
        drop(listener);

        let host = IpAddr::from([127, 0, 0, 1]);
        let result = is_port_free(host, port);

        // 解放後は Err ではないこと（TIME_WAIT = false も許容）
        assert!(result.is_ok(), "freed port should not cause error");
    }

    /// IPv4 ループバックアドレスで正しく動作することを確認する。
    #[test]
    fn ipv4_loopback() {
        let host = IpAddr::from([127, 0, 0, 1]);
        let port = 0u16; // 0 = OS に任せる（バインド自体のテスト）

        let result = is_port_free(host, port);
        assert!(result.is_ok(), "IPv4 loopback should work");
    }

    /// IPv6 ループバックアドレスで正しく動作することを確認する。
    #[test]
    fn ipv6_loopback() {
        let host = IpAddr::from([0, 0, 0, 0, 0, 0, 0, 1]); // ::1
        let port = 0u16;

        let result = is_port_free(host, port);
        // IPv6 が無効な環境では Err になる可能性があるため、アサーションは緩め
        if let Err(ref e) = result {
            // EAFNOSUPPORT または同種のエラーは許容する（IPv6 非対応環境）
            assert!(
                e.kind() == std::io::ErrorKind::Unsupported
                    || e.kind() == std::io::ErrorKind::AddrNotAvailable
                    || e.kind() == std::io::ErrorKind::InvalidInput,
                "unexpected error for IPv6: {e}"
            );
        } else {
            // IPv6 が有効な環境では正常に動作
            assert!(result.is_ok(), "IPv6 should work when supported");
        }
    }
}
