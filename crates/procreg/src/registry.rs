//! # Registry — プロセスレジストリの内部構造
//!
//! プロセスの実行時状態を保持する `RegistryEntry`、レジストリ全体の
//! 内部状態 `RegistryInner`、および公開 API `ProcessRegistry` を定義する。

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::state::ProcessState;
use crate::ProcessDef;

/// プロセスレジストリ全体を表す公開構造体。
///
/// 内部状態は `Arc<Mutex<RegistryInner>>` でラップされ、
/// スレッド安全に共有される。Clone は `Arc::clone` により
/// 内部状態を共有する（ディープコピーではない）。
///
/// # Tauri 統合
///
/// `Clone + Send + Sync` を満たすため、`tauri::State` として
/// 管理可能。
#[derive(Debug)]
pub struct ProcessRegistry {
    inner: Arc<Mutex<RegistryInner>>,
}

impl Clone for ProcessRegistry {
    /// `Arc::clone` により内部状態を共有する。
    /// 元の `ProcessRegistry` とクローンは同一の `RegistryInner` を指す。
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

/// レジストリの内部状態（非公開）。
///
/// - `entries`: プロセス名 → `RegistryEntry` のマップ
/// - `start_order`: トポロジカルソートされた起動順序のリスト。
///   `shutdown_all()` で逆順シャットダウンするために保持する。
///
/// # 未使用警告について
///
/// フィールドは後続チケット（M6-1, M8-1, M9-1）で使用される。
/// 現時点では型定義のみ確定させる段階のため、`#[allow(dead_code)]` で
/// 警告を抑制する。
#[derive(Debug)]
#[allow(dead_code)]
struct RegistryInner {
    /// 全プロセスエントリのマップ。キーはプロセス名。
    entries: HashMap<String, RegistryEntry>,
    /// 起動順序のリスト。`shutdown_all()` で逆順に停止するために使用する。
    start_order: Vec<String>,
}

/// 1 つのプロセスの実行時状態を保持する内部構造体。
///
/// プロセス定義 `ProcessDef` と実行時状態 `ProcessState` を紐付け、
/// 子プロセスハンドル・出力購読チャンネル・キャンセルトークンを保持する。
///
/// # 未使用警告について
///
/// フィールドは後続チケットで使用される。現時点では型定義のみ確定させる段階。
#[derive(Debug)]
#[allow(dead_code)]
pub(crate) struct RegistryEntry {
    /// 起動時に使用したプロセス定義（不変）。
    pub def: ProcessDef,
    /// 現在のプロセス状態。
    pub state: ProcessState,
    /// 子プロセスのハンドル。
    ///
    /// `Some` の間、プロセスは稼働中。
    /// `take()` して `ChildGuard::shutdown().await` を呼ぶことで
    /// GracefulShutdown を実行する。
    ///
    /// TODO: M3-1 で本実装に置き換え。現在はスタブ。
    pub child: Option<ChildGuard>,
    /// 全出力行（stdout + stderr マージ）をブロードキャストするチャンネル。
    /// capacity = 2048（溢れたら古いものを drop）。
    pub output_tx: broadcast::Sender<String>,
    /// `watch_loop` に紐付いた CancellationToken。
    /// `stop()` / `shutdown_all()` 時に `cancel()` することで
    /// ポーリング待機中の `watch_loop` を即座に終了させる。
    pub cancel_token: CancellationToken,
    /// 現在の再起動試行回数。
    pub restart_count: u32,
}

pub(crate) use crate::child::ChildGuard;

#[cfg(test)]
mod tests {
    use super::*;

    /// RegistryInner が正しく構築でき、フィールドにアクセスできることを確認する。
    #[test]
    fn registry_inner_new() {
        let inner = RegistryInner {
            entries: HashMap::new(),
            start_order: vec![],
        };
        assert!(inner.entries.is_empty());
        assert!(inner.start_order.is_empty());
    }

    /// ProcessRegistry::clone() が `Arc::clone` であり、
    /// クローン後も内部状態が共有されることを確認する。
    #[test]
    fn process_registry_clone_is_arc_clone() {
        let reg = ProcessRegistry {
            inner: Arc::new(Mutex::new(RegistryInner {
                entries: HashMap::new(),
                start_order: vec![],
            })),
        };

        let cloned = reg.clone();

        // 両方の inner が同一の Arc を指していることを確認する
        assert!(Arc::ptr_eq(&reg.inner, &cloned.inner));
    }
}
