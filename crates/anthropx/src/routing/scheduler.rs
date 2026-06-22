//! # API Key スケジューラ
//!
//! Provider ごとの API key を管理し、起動時乱択 + スレッドセーフな
//! round-robin で key を選択する。`std::sync::atomic` のみを使用し、
//! tokio 非依存。

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// API key のスレッドセーフな round-robin スケジューラ（RFC §4.2）。
///
/// 起動時に provider ごとに開始 index を乱択し、以後は `AtomicUsize` による
/// アトミックな round-robin で key を選択する。
///
/// ## スレッド安全性
///
/// `select_key()` は `&self`（不変参照）で呼び出せるため、`&KeyScheduler` を
/// 共有する全スレッドが安全に key を選択できる。
///
/// ## Ordering
///
/// `Relaxed` を使用する（RFC §4.2）。正確な選択順序の保証よりもパフォーマンスを
/// 優先する設計判断による。AtomicUsize の atomic 性により、値の重複や消失は
/// 発生しない。
#[derive(Debug)]
pub struct KeyScheduler {
    keys: Vec<String>,
    current: AtomicUsize,
    provider_name: String,
}

impl KeyScheduler {
    /// 起動時乱択で KeyScheduler を生成する。
    ///
    /// 開始位置は `SystemTime::now()` のナノ秒を keys の長さで割った余り。
    /// これにより全インスタンスが同一 key から開始するのを防ぐ。
    pub fn new(keys: Vec<String>, provider_name: String) -> Self {
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as usize)
            .unwrap_or(0);
        let start = seed % keys.len().max(1);
        Self {
            keys,
            current: AtomicUsize::new(start),
            provider_name,
        }
    }

    /// テスト用に固定シードで KeyScheduler を生成する。
    ///
    /// 同一シードからは常に同一の開始位置が得られるため、
    /// 決定論的なテストが可能になる。
    pub fn with_seed(keys: Vec<String>, provider_name: String, seed: usize) -> Self {
        let start = seed % keys.len().max(1);
        Self {
            keys,
            current: AtomicUsize::new(start),
            provider_name,
        }
    }

    /// 次の API key を round-robin で選択する。
    ///
    /// `current` をアトミックにインクリメントし、keys の長さで
    /// ラップアラウンドさせる。
    ///
    /// ## Relaxed ordering
    ///
    /// 正確な選択順序の保証ではなく、key が偏らずに分散されることと
    ///  atomic 性（値の重複・消失がないこと）が重要であるため `Relaxed` を使用する。
    pub fn select_key(&self) -> &str {
        let prev = self.current.fetch_add(1, Ordering::Relaxed);
        &self.keys[prev % self.keys.len()]
    }

    /// 管理している key の総数を返す。
    pub fn key_count(&self) -> usize {
        self.keys.len()
    }

    /// Provider 識別子を返す（debug / metrics 用）。
    pub fn provider_name(&self) -> &str {
        &self.provider_name
    }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 同一シードで2回初期化すると同一の開始位置になること。
    #[test]
    fn with_seed_deterministic() {
        let keys = vec!["a".into(), "b".into(), "c".into()];
        let s1 = KeyScheduler::with_seed(keys.clone(), "p".into(), 42);
        let s2 = KeyScheduler::with_seed(keys.clone(), "p".into(), 42);
        // 同一 seed → 同一開始位置 → 最初の select_key が同一結果
        assert_eq!(s1.select_key(), s2.select_key());
    }

    /// 3 keys + 3回の select_key で順序が key[0], key[1], key[2] になること。
    #[test]
    fn select_key_round_robin_order() {
        let keys = vec!["k0".into(), "k1".into(), "k2".into()];
        let scheduler = KeyScheduler::with_seed(keys, "p".into(), 0);
        assert_eq!(scheduler.select_key(), "k0");
        assert_eq!(scheduler.select_key(), "k1");
        assert_eq!(scheduler.select_key(), "k2");
    }

    /// seed=2, 2 keys + 3回呼出 → 3回目は key[0] に戻る（ラップアラウンド）。
    #[test]
    fn select_key_wraparound() {
        let keys = vec!["a".into(), "b".into()];
        let scheduler = KeyScheduler::with_seed(keys, "p".into(), 2);
        // seed=2 → 2 % 2 = 0 → 開始位置は 0
        assert_eq!(scheduler.select_key(), "a");
        assert_eq!(scheduler.select_key(), "b");
        assert_eq!(scheduler.select_key(), "a"); // wraparound
    }

    /// 複数スレッドからの並行アクセスが安全であること。
    #[test]
    fn select_key_multi_threaded() {
        let keys: Vec<String> = (0..10).map(|i| format!("k{i}")).collect();
        let scheduler = std::sync::Arc::new(KeyScheduler::with_seed(keys.clone(), "p".into(), 0));

        let mut handles = vec![];
        for _ in 0..4 {
            let s = std::sync::Arc::clone(&scheduler);
            handles.push(std::thread::spawn(move || {
                let mut results = vec![];
                for _ in 0..25 {
                    results.push(s.select_key().to_string());
                }
                results
            }));
        }

        let mut all_results: Vec<String> = vec![];
        for h in handles {
            all_results.extend(h.join().unwrap());
        }

        // 4スレッド × 25回 = 100回の選択結果
        assert_eq!(all_results.len(), 100);

        // 各 key がほぼ均等に選択されたことを確認（期待値10回 ± 5回）
        for i in 0..10 {
            let count = all_results
                .iter()
                .filter(|r| **r == format!("k{i}"))
                .count();
            assert!(
                (5..=15).contains(&count),
                "key k{i} appeared {count} times, expected ~10"
            );
        }
    }

    /// key_count が key 配列長と一致すること。
    #[test]
    fn key_count_matches() {
        let keys = vec!["a".into(), "b".into(), "c".into()];
        let scheduler = KeyScheduler::with_seed(keys, "p".into(), 0);
        assert_eq!(scheduler.key_count(), 3);
    }

    /// provider_name がコンストラクタで指定した値を返すこと。
    #[test]
    fn provider_name_returns_configured() {
        let keys = vec!["a".into()];
        let scheduler = KeyScheduler::with_seed(keys, "my-provider".into(), 0);
        assert_eq!(scheduler.provider_name(), "my-provider");
    }

    /// new() が SystemTime 経由で初期化され、空の keys でもパニックしないこと。
    #[test]
    fn new_does_not_panic_with_empty_keys() {
        let scheduler = KeyScheduler::new(vec![], "empty".into());
        assert_eq!(scheduler.key_count(), 0);
    }
}
