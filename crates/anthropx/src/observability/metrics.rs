//! # メトリクスカウンタ
//!
//! リクエスト処理の簡易メトリクスを AtomicU64 のグローバル変数で管理する。
//! Prometheus 互換のテキスト形式で出力する。
//!
//! server feature 有効時のみコンパイルされる。

use std::sync::atomic::{AtomicU64, Ordering};

// ---------------------------------------------------------------------------
// グローバルカウンタ
// ---------------------------------------------------------------------------

/// 全リクエスト数
static TOTAL_REQUESTS: AtomicU64 = AtomicU64::new(0);
/// 成功レスポンス数（2xx）
static SUCCESS_REQUESTS: AtomicU64 = AtomicU64::new(0);
/// クライアントエラー数（4xx）
static ERROR_4XX: AtomicU64 = AtomicU64::new(0);
/// サーバーエラー数（5xx）
static ERROR_5XX: AtomicU64 = AtomicU64::new(0);
/// failover（key 再試行）発生回数
static FAILOVER_COUNT: AtomicU64 = AtomicU64::new(0);

// ---------------------------------------------------------------------------
// 公開関数
// ---------------------------------------------------------------------------

/// メトリクスカウンタを初期化する。
///
/// AtomicU64 のゼロ初期化はコンパイル時に保証されるため、実質的には noop。
/// 将来、カウンタの動的追加やラベル付きメトリクスに対応するための
/// 拡張ポイントとして残す。
pub fn register_metrics() {
    // 静的初期化済みのため何もしない
}

/// リクエスト完了時に呼び出し、ステータスコードに応じてカウンタを増加する。
///
/// * `200-299` → `total` + `success`
/// * `400-499` → `total` + `error_4xx`
/// * `500-599` → `total` + `error_5xx`
/// * その他 → `total` のみ増加
pub fn record_request(status: u16) {
    TOTAL_REQUESTS.fetch_add(1, Ordering::Relaxed);
    match status / 100 {
        2 => {
            SUCCESS_REQUESTS.fetch_add(1, Ordering::Relaxed);
        }
        4 => {
            ERROR_4XX.fetch_add(1, Ordering::Relaxed);
        }
        5 => {
            ERROR_5XX.fetch_add(1, Ordering::Relaxed);
        }
        _ => {
            // total のみ増加済み
        }
    }
}

/// failover 発生時に呼び出し、カウンタを増加する。
pub fn record_failover() {
    FAILOVER_COUNT.fetch_add(1, Ordering::Relaxed);
}

/// failover カウンタの現在値を取得する（テスト用）。
pub fn record_failover_count() -> u64 {
    FAILOVER_COUNT.load(Ordering::Relaxed)
}

/// 全カウンタを Prometheus 互換のテキスト形式で出力する。
pub fn format_metrics() -> String {
    format!(
        "# HELP anthropx_requests_total Total request count\n\
         # TYPE anthropx_requests_total counter\n\
         anthropx_requests_total {}\n\
         # HELP anthropx_requests_success Successful request count (2xx)\n\
         # TYPE anthropx_requests_success counter\n\
         anthropx_requests_success {}\n\
         # HELP anthropx_requests_errors_4xx Client error count (4xx)\n\
         # TYPE anthropx_requests_errors_4xx counter\n\
         anthropx_requests_errors_4xx {}\n\
         # HELP anthropx_requests_errors_5xx Server error count (5xx)\n\
         # TYPE anthropx_requests_errors_5xx counter\n\
         anthropx_requests_errors_5xx {}\n\
         # HELP anthropx_requests_failover_total Failover retry count\n\
         # TYPE anthropx_requests_failover_total counter\n\
         anthropx_requests_failover_total {}\n",
        TOTAL_REQUESTS.load(Ordering::Relaxed),
        SUCCESS_REQUESTS.load(Ordering::Relaxed),
        ERROR_4XX.load(Ordering::Relaxed),
        ERROR_5XX.load(Ordering::Relaxed),
        FAILOVER_COUNT.load(Ordering::Relaxed),
    )
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 各テスト実行前にカウンタをリセットする。
    fn reset_counters() {
        TOTAL_REQUESTS.store(0, Ordering::Relaxed);
        SUCCESS_REQUESTS.store(0, Ordering::Relaxed);
        ERROR_4XX.store(0, Ordering::Relaxed);
        ERROR_5XX.store(0, Ordering::Relaxed);
        FAILOVER_COUNT.store(0, Ordering::Relaxed);
    }

    /// 初期状態で全カウンタが 0 であること。
    #[test]
    fn initial_counters_are_zero() {
        reset_counters();
        let output = format_metrics();
        assert!(output.contains("anthropx_requests_total 0"), "total should be 0");
        assert!(output.contains("anthropx_requests_success 0"), "success should be 0");
        assert!(output.contains("anthropx_requests_errors_4xx 0"), "4xx should be 0");
        assert!(output.contains("anthropx_requests_errors_5xx 0"), "5xx should be 0");
    }

    /// record_request(200) で total と success が増加すること。
    #[test]
    fn record_200_increments_success() {
        reset_counters();
        record_request(200);
        assert_eq!(TOTAL_REQUESTS.load(Ordering::Relaxed), 1);
        assert_eq!(SUCCESS_REQUESTS.load(Ordering::Relaxed), 1);
        assert_eq!(ERROR_4XX.load(Ordering::Relaxed), 0);
        assert_eq!(ERROR_5XX.load(Ordering::Relaxed), 0);
    }

    /// record_request(400) で total と 4xx が増加すること。
    #[test]
    fn record_400_increments_4xx() {
        reset_counters();
        record_request(400);
        assert_eq!(TOTAL_REQUESTS.load(Ordering::Relaxed), 1);
        assert_eq!(SUCCESS_REQUESTS.load(Ordering::Relaxed), 0);
        assert_eq!(ERROR_4XX.load(Ordering::Relaxed), 1);
        assert_eq!(ERROR_5XX.load(Ordering::Relaxed), 0);
    }

    /// record_request(500) で total と 5xx が増加すること。
    #[test]
    fn record_500_increments_5xx() {
        reset_counters();
        record_request(500);
        assert_eq!(TOTAL_REQUESTS.load(Ordering::Relaxed), 1);
        assert_eq!(SUCCESS_REQUESTS.load(Ordering::Relaxed), 0);
        assert_eq!(ERROR_4XX.load(Ordering::Relaxed), 0);
        assert_eq!(ERROR_5XX.load(Ordering::Relaxed), 1);
    }

    /// record_request(301) で total のみ増加すること（リダイレクト等）。
    #[test]
    fn record_3xx_increments_total_only() {
        reset_counters();
        record_request(301);
        assert_eq!(TOTAL_REQUESTS.load(Ordering::Relaxed), 1);
        assert_eq!(SUCCESS_REQUESTS.load(Ordering::Relaxed), 0);
        assert_eq!(ERROR_4XX.load(Ordering::Relaxed), 0);
        assert_eq!(ERROR_5XX.load(Ordering::Relaxed), 0);
    }

    /// record_failover() で failover カウンタが増加すること。
    #[test]
    fn record_failover_increments_counter() {
        reset_counters();
        assert_eq!(record_failover_count(), 0);
        record_failover();
        assert_eq!(record_failover_count(), 1);
        record_failover();
        assert_eq!(record_failover_count(), 2);
    }

    /// format_metrics() に failover カウンタ行が含まれること。
    #[test]
    fn format_metrics_includes_failover() {
        reset_counters();
        let output = format_metrics();
        assert!(output.contains("anthropx_requests_failover_total 0"));
        record_failover();
        let output = format_metrics();
        assert!(output.contains("anthropx_requests_failover_total 1"));
    }

    /// failover カウンタが format_metrics の他のカウンタと独立していること。
    #[test]
    fn failover_independent_from_request_counters() {
        reset_counters();
        record_failover();
        record_request(200);
        assert_eq!(record_failover_count(), 1);
        assert_eq!(TOTAL_REQUESTS.load(Ordering::Relaxed), 1);
        assert_eq!(SUCCESS_REQUESTS.load(Ordering::Relaxed), 1);
    }
}
