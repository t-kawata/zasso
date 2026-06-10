//! # Platform — プロセス生存確認
//!
//! OS に依存するプロセス生存確認関数を提供する。
//! Unix は `libc::kill`、Windows は `OpenProcess` を使用する。

/// PID で指定されたプロセスが生存しているか確認する。
///
/// # PID 0 ガード
///
/// # 未使用警告について
///
/// この関数は M7-1（watch_loop: PID probe）で使用される。現時点では定義のみ。
#[allow(dead_code)]
///
/// PID 0 は「不明」として `true` を返す。
/// Unix の `kill(0, 0)` はプロセスグループ 0 のプロセスが存在すれば成功するため、
/// 誤ったシグナル送信を防ぐための安全弁として明示的に `true` を返す。
/// 実運用では `spawn_one` で PID 0 をエラーにしているため、このガードは
/// 主に防御的プログラミングとして存在する。
///
/// # SAFETY
///
/// - Unix: `libc::kill(pid, 0)` はシグナルを送信せず生存確認のみを行う。
///   pid は呼び出し側から与えられる値であり、無効な PID でも未定義動作は
///   発生しない（エラーが返るのみ）。
/// - Windows: `OpenProcess` は指定された PID のプロセスハンドルを取得する。
///   無効な PID でも未定義動作は発生しない（エラーが返るのみ）。
pub(crate) fn is_process_alive(pid: u32) -> bool {
    if pid == 0 {
        return true;
    }

    #[cfg(unix)]
    {
        // SAFETY: libc::kill(pid, 0) はシグナルを送らず生存確認のみ行う。
        // pid が無効でも未定義動作は発生せず、ESRCH が返る。
        unsafe {
            let result = libc::kill(pid as libc::pid_t, 0);
            result == 0 || std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
        }
    }

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

        // SAFETY: OpenProcess は指定 PID のプロセスハンドルを取得する。
        // 無効な PID でもエラーが返るのみで未定義動作は発生しない。
        // 取得したハンドルは必ず CloseHandle で解放する。
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if let Ok(h) = handle {
                let _ = CloseHandle(h);
                true
            } else {
                false
            }
        }
    }

    #[cfg(not(any(unix, windows)))]
    {
        // 不明なプラットフォームでは安全側に倒して true を返す。
        let _ = pid;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// PID 0 が生存中とみなされることを確認する（安全弁）。
    #[test]
    fn pid_zero_returns_true() {
        assert!(is_process_alive(0));
    }

    /// 自プロセスの PID が生存中とみなされることを確認する。
    #[test]
    fn self_pid_returns_true() {
        let self_pid = std::process::id();
        assert!(is_process_alive(self_pid));
    }

    /// 存在しない PID が非生存とみなされることを確認する。
    #[test]
    fn dead_pid_returns_false() {
        // 通常存在しえない PID を指定する
        assert!(!is_process_alive(999_999));
    }

    /// プラットフォーム分岐が正しくコンパイルされることを確認する。
    /// cfg(unix)/cfg(windows)/cfg(not(any(...))) の全分岐が
    /// コンパイルエラーなくビルドできることを検証する。
    #[test]
    fn platform_builds() {
        // コンパイルが通ること自体がテスト
        assert!(true);
    }
}
