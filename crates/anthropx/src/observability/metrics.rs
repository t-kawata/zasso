//! # メトリクスカウンタ
//!
//! `metrics` crate によるラベル付きカウンタ・ヒストグラムでリクエスト統計を管理する。
//! Prometheus 形式の出力は `METRICS_HANDLE.render()` で行う。
//!
//! server feature 有効時は Prometheus レコーダーがインストールされ、
//! library モード（server feature なし）では metrics マクロは no-op として動作する。

use std::sync::OnceLock;

use metrics::{counter, describe_counter, describe_histogram, histogram};

// ---------------------------------------------------------------------------
// Prometheus レコーダー（server feature 時のみ）
// ---------------------------------------------------------------------------

#[cfg(feature = "server")]
mod exporter {
    use std::sync::LazyLock;

    use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

    /// Prometheus メトリクスハンドラ。
    ///
    /// `render()` メソッドで Prometheus text exposition format の文字列を返す。
    /// 初回アクセス時に `install_recorder()` が呼ばれ、以降 crate 内の
    /// `counter!()` / `histogram!()` がこのレコーダーに記録される。
    pub(crate) static METRICS_HANDLE: LazyLock<PrometheusHandle> = LazyLock::new(|| {
        PrometheusBuilder::new()
            .install_recorder()
            .expect("failed to install Prometheus recorder")
    });
}

#[cfg(feature = "server")]
pub(crate) use exporter::METRICS_HANDLE;

// ---------------------------------------------------------------------------
// 公開関数
// ---------------------------------------------------------------------------

/// register_metrics() が初回のみ実行されることを保証するガード。
static METRICS_REGISTERED: OnceLock<()> = OnceLock::new();

/// 全メトリクスの記述（`describe_*!`）を登録する。
///
/// `ProxyServer::start()` の先頭で呼ばれることを想定する。
/// 初回呼び出し時に Prometheus レコーダーがインストールされる（server feature 時）。
/// `OnceLock<()>` により、2回目以降の呼び出しでは何も実行されない。
pub fn register_metrics() {
    // 初回呼び出し時のみ describe_*! を実行する
    // OnceLock::set() は初回のみ Ok(()) を返し、2回目以降は Err(()) を返す
    if METRICS_REGISTERED.set(()).is_ok() {
        // server feature 時は METRICS_HANDLE の初期化（レコーダーインストール）をトリガーする
        #[cfg(feature = "server")]
        {
            let _ = &*exporter::METRICS_HANDLE;
        }

        describe_counter!(
            "anthropx_requests_total",
            "Total number of proxy requests by provider, mode, stream, status"
        );
        describe_counter!(
            "anthropx_failover_total",
            "Total number of key failover events by provider"
        );
        describe_counter!(
            "anthropx_lossy_total",
            "Total number of lossy translation events by level"
        );
        describe_histogram!(
            "anthropx_request_latency_ms",
            "Request latency in milliseconds by provider and mode"
        );
    }
}

/// リクエスト完了時に呼び出し、カウンタ + ヒストグラムを記録する。
///
/// # 引数
///
/// * `provider` — プロバイダ名（例: "deepseek", "openai"）
/// * `mode` — 動作モード（"transparent" または "translate"）
/// * `stream` — ストリーミングリクエストかどうか
/// * `status` — HTTP ステータスコード
/// * `latency_ms` — リクエスト処理時間（ミリ秒）
///
/// metrics crate の制約により、ラベル値は `'static` である必要があるため、
/// 動的文字列は `to_owned()` で所有権を確保する。
pub fn record_request(provider: &str, mode: &str, stream: bool, status: u16, latency_ms: u64) {
    let stream_label = if stream { "true" } else { "false" };

    counter!("anthropx_requests_total",
        "provider" => provider.to_owned(),
        "mode" => mode.to_owned(),
        "stream" => stream_label,
        "status" => status.to_string(),
    )
    .increment(1);

    histogram!("anthropx_request_latency_ms",
        "provider" => provider.to_owned(),
        "mode" => mode.to_owned(),
        "stream" => stream_label,
        "status" => status.to_string(),
    )
    .record(latency_ms as f64);
}

/// failover（キー再試行）発生時に呼び出し、プロバイダ別のカウンタを増加する。
pub fn record_failover(provider: &str) {
    counter!("anthropx_failover_total", "provider" => provider.to_owned()).increment(1);
}

/// Lossy 変換発生時に呼び出し、レベル別のカウンタを増加する。
pub fn record_lossy(level: &str) {
    counter!("anthropx_lossy_total", "level" => level.to_owned()).increment(1);
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// テスト用に Prometheus レコーダーを初期化する。
    /// 複数テスト間で共有されるため、1度だけインストールされる。
    fn init_recorder() {
        let _ = &*exporter::METRICS_HANDLE;
    }

    /// register_metrics() が panic せず、METRICS_HANDLE が利用可能になること。
    ///
    /// `describe_*!` の HELP/TYPE 行はグローバルレコーダーの状態に依存するため、
    /// テスト間の実行順序によっては既存カウンタにより記述が上書きされる。
    /// ここでは `register_metrics()` がエラーなく完了し、レンダリングが
    /// 空文字列でないことのみを検証する。
    #[test]
    fn register_metrics_creates_descriptions() {
        init_recorder();
        register_metrics();
        let output = exporter::METRICS_HANDLE.render();
        assert!(!output.is_empty(), "render output should not be empty");
    }

    /// record_request() でカウンタ行が出力され、ラベルが正しく付与されること。
    #[test]
    fn record_request_increments_counter() {
        init_recorder();
        let provider = "test_record_request";

        record_request(provider, "transparent", false, 200, 150);

        let output = exporter::METRICS_HANDLE.render();
        let expected_label = format!(
            r#"anthropx_requests_total{{provider="{provider}",mode="transparent",stream="false",status="200"}}"#
        );
        assert!(output.contains(&expected_label));
    }

    /// stream=true で別ラベルとしてカウントされること。
    #[test]
    fn record_request_with_stream_flag() {
        init_recorder();
        let provider = "test_record_request_stream";

        record_request(provider, "translate", true, 200, 100);

        let output = exporter::METRICS_HANDLE.render();
        let expected_label = format!(
            r#"anthropx_requests_total{{provider="{provider}",mode="translate",stream="true",status="200"}}"#
        );
        assert!(output.contains(&expected_label));
    }

    /// 異なる provider が独立したカウンタ行として出力されること。
    #[test]
    fn record_request_different_providers() {
        init_recorder();

        record_request("test_provider_a", "transparent", false, 200, 50);
        record_request("test_provider_b", "transparent", false, 200, 75);

        let output = exporter::METRICS_HANDLE.render();
        assert!(
            output.contains(r#"anthropx_requests_total{provider="test_provider_a"#),
            "provider A should appear"
        );
        assert!(
            output.contains(r#"anthropx_requests_total{provider="test_provider_b"#),
            "provider B should appear"
        );
    }

    /// latency_ms=0 でもヒストグラムに記録されること。
    ///
    /// metrics-exporter-prometheus は histogram を Prometheus の summary 形式
    /// （quantile + _sum + _count）で出力する。`_bucket` 形式ではないため
    /// `_count` 行の存在で検証する。
    #[test]
    fn record_request_zero_latency() {
        init_recorder();
        let provider = "test_zero_latency";

        record_request(provider, "transparent", false, 200, 0);

        let output = exporter::METRICS_HANDLE.render();
        let expected_counter = format!(r#"anthropx_requests_total{{provider="{provider}""#);
        assert!(output.contains(&expected_counter));

        // ヒストグラムの _count 行も出力されていること
        let expected_histo_count =
            format!(r#"anthropx_request_latency_ms_count{{provider="{provider}""#);
        assert!(
            output.contains(&expected_histo_count),
            "histogram count should appear in output"
        );
    }

    /// latency_ms に大きな値を指定してもオーバーフローしないこと。
    #[test]
    fn record_request_high_latency() {
        init_recorder();
        let provider = "test_high_latency";

        record_request(provider, "transparent", false, 200, 999_999_999);

        let output = exporter::METRICS_HANDLE.render();
        let expected = format!(r#"anthropx_requests_total{{provider="{provider}""#);
        assert!(output.contains(&expected));
    }

    /// record_failover() で failover カウンタが出力されること。
    #[test]
    fn record_failover_increments_counter() {
        init_recorder();
        let provider = "test_failover";

        record_failover(provider);

        let output = exporter::METRICS_HANDLE.render();
        let expected_label = format!(r#"anthropx_failover_total{{provider="{provider}"}}"#);
        assert!(
            output.contains(&expected_label),
            "failover counter should contain provider label"
        );
    }

    /// 複数 provider の failover が独立してカウントされること。
    #[test]
    fn record_failover_multiple_providers() {
        init_recorder();

        record_failover("test_failover_a");
        record_failover("test_failover_b");

        let output = exporter::METRICS_HANDLE.render();
        assert!(
            output.contains(r#"anthropx_failover_total{provider="test_failover_a"}"#),
            "provider A failover should appear"
        );
        assert!(
            output.contains(r#"anthropx_failover_total{provider="test_failover_b"}"#),
            "provider B failover should appear"
        );
    }

    /// record_lossy() で lossy カウンタが出力されること。
    #[test]
    fn record_lossy_increments_counter() {
        init_recorder();

        record_lossy("Error");

        let output = exporter::METRICS_HANDLE.render();
        let expected_label = r#"anthropx_lossy_total{level="Error"}"#;
        assert!(
            output.contains(expected_label),
            "lossy counter should contain level label"
        );
    }

    /// Error/Warn/Info の各区別で lossy カウンタが独立して出力されること。
    #[test]
    fn record_lossy_all_levels() {
        init_recorder();

        record_lossy("Error");
        record_lossy("Warn");
        record_lossy("Info");

        let output = exporter::METRICS_HANDLE.render();
        assert!(
            output.contains(r#"anthropx_lossy_total{level="Error"}"#),
            "Error level should appear"
        );
        assert!(
            output.contains(r#"anthropx_lossy_total{level="Warn"}"#),
            "Warn level should appear"
        );
        assert!(
            output.contains(r#"anthropx_lossy_total{level="Info"}"#),
            "Info level should appear"
        );
    }

    /// register_metrics() を2回呼び出してもパニックも警告も発生しないこと。
    ///
    /// OnceLock ガードにより、2回目の describe_*! 登録はスキップされる。
    #[test]
    fn register_metrics_idempotent_on_second_call() {
        init_recorder();

        // 1回目: 通常どおり実行
        register_metrics();
        // 2回目: OnceLock ガードにより何も実行されない（パニック・警告なし）
        register_metrics();

        // 2回呼び出してもレンダリングが空にならないこと
        let output = exporter::METRICS_HANDLE.render();
        assert!(
            !output.is_empty(),
            "render output should not be empty after two calls"
        );
    }

    /// register_metrics() を2回呼び出した後でも record_request() が正常動作すること。
    #[test]
    fn register_metrics_twice_still_records_requests() {
        init_recorder();
        let provider = "test_twice_still_records";

        register_metrics();
        register_metrics();

        record_request(provider, "transparent", false, 200, 150);

        let output = exporter::METRICS_HANDLE.render();
        let expected_label = format!(
            r#"anthropx_requests_total{{provider="{provider}",mode="transparent",stream="false",status="200"}}"#
        );
        assert!(output.contains(&expected_label));
    }
}
