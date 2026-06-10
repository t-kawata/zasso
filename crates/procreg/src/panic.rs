//! # Panic Hook — パニック安全網
//!
//! パニック時に全子プロセスを強制停止するフックを提供する。
//! `std::panic::set_hook` を使用し、専用スレッド + `new_current_thread`
//! Tokio ランタイムでデッドロックを回避する。

use crate::registry::ProcessRegistry;

/// パニック時に全プロセスを強制停止するフックを設定する。
///
/// `main()` の早い段階で呼ぶこと。このフックはパニック発生時に
/// `ProcessRegistry::shutdown_all()` を呼び出し、全子プロセスを
/// GracefulShutdown する。
///
/// # デッドロック回避
///
/// Tokio ワーカースレッド上でパニックが発生した場合、同スレッドで
/// `Handle::block_on()` を呼ぶとデッドロックする。そのため、新規スレッドに
/// 専用の `current_thread` ランタイムを立ち上げて `shutdown_all()` を実行する。
///
/// # 注意
///
/// `panic = "abort"` のプロファイルではフックが実行されない。
/// リリースプロファイルの設定は利用者側の責任。
pub fn install_panic_hook(registry: ProcessRegistry) {
    let orig = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let r = registry.clone();
        std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap()
                .block_on(async move { r.shutdown_all().await });
        })
        .join()
        .ok();

        orig(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::ProcessRegistry;

    /// install_panic_hook がフックを設定し、パニック時にパニックしないことを確認する。
    #[test]
    fn panic_hook_does_not_panic() {
        let reg = ProcessRegistry::new();
        install_panic_hook(reg);

        // catch_unwind でパニックを捕捉してもフック自体は動作する
        let result = std::panic::catch_unwind(|| {
            panic!("test panic");
        });
        assert!(result.is_err());
        // フックがパニックせずに完了したこと自体がテスト
    }
}
