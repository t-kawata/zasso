//! # メトリクス — 運用監視カウンター/ゲージ
//!
//! `metrics` feature 有効時に 8 つの運用監視指標を提供する。
//! feature 無効時はゼロオーバーヘッド（`#[cfg(feature = "metrics")]` でガード）。
//!
//! エクスポーター（Prometheus 等）の統合は利用者側の責務とする。
//!
//! # 命名規則
//!
//! 全メトリクス名は `siprs.{metric_name}` の形式に統一する。

use metrics::{counter, gauge};

/// アクティブ通話数を設定する（ゲージ）。
///
/// `add_call` / `remove_call` のタイミングで更新する。
pub fn set_active_calls(count: u64) {
    gauge!("siprs.active_calls").set(count as f64);
}

/// 登録済みアカウント数を設定する（ゲージ）。
///
/// アカウント追加/削除のタイミングで更新する。
pub fn set_registered_accounts(count: u64) {
    gauge!("siprs.registered_accounts").set(count as f64);
}

/// AudioTap oldest-drop 発生回数をインクリメントする（カウンター）。
pub fn increment_audio_tap_overflows() {
    counter!("siprs.audio_tap_overflows_total").increment(1);
}

/// DTMF 送信成功回数をインクリメントする（カウンター）。
pub fn increment_dtmf_sent() {
    counter!("siprs.dtmf_sent_total").increment(1);
}

/// DTMF 受信回数をインクリメントする（カウンター）。
pub fn increment_dtmf_received() {
    counter!("siprs.dtmf_received_total").increment(1);
}

/// ICE negotiation 失敗回数をインクリメントする（カウンター）。
pub fn increment_ice_failures() {
    counter!("siprs.ice_failures_total").increment(1);
}

/// トランスポート再接続回数をインクリメントする（カウンター）。
pub fn increment_transport_reconnects() {
    counter!("siprs.transport_reconnects_total").increment(1);
}

/// RawSIP メッセージ送受信件数をインクリメントする（カウンター）。
pub fn increment_raw_sip_messages() {
    counter!("siprs.raw_sip_messages_total").increment(1);
}
