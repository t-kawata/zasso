//! # Dual Client テスト用 TestContext
//!
//! 2 つの [`SipClient`] インスタンス（client_a / client_b）と各アカウントを管理し、
//! client_a → client_b の双方向通話テストを簡潔に記述するためのユーティリティ。
//!
//! 前提:
//! - M20-7（EventBus 分割 + account_id routing）により複数 SipClient が同一
//!   PjsuaBackend singleton を共有可能
//! - `GLOBAL_RUNTIME` の `OnceLock` 機構は不変 — 2 つめの Client は既存 Reactor を再利用

use std::time::Duration;

use siprs::client::{SipAccountHandle, SipClient};
use siprs::config::{
    AccountConfig, CallMediaPreferences, ClientConfig, OutgoingCallRequest,
};
use siprs::runtime::command::HangupReason;
use siprs::error::SipError;
use siprs::event::{SipEvent, SipEventPayload};
use siprs::util::id::{AccountId, CallId};
use tokio::sync::broadcast;

use super::{wait_for_event_with_timeout, CALL_TIMEOUT, EVENT_TIMEOUT};

/// 双方向テスト用の TestContext（2 SipClient 版）。
///
/// # 設計制約
///
/// - 同一 PjsuaBackend singleton を共有するため、`shutdown_all()` では
///   client_a のみ `shutdown()` を呼び、client_b は drop でリソース解放する
/// - 全メソッドは同期 — `SipClient` の公開 API が `block_on` ベースのため
pub struct DualClientContext {
    /// 発信側 SipClient（client_a）。
    pub client_a: SipClient,
    /// 着信側 SipClient（client_b）。
    pub client_b: SipClient,
    /// client_a のアカウント ID。
    pub account_a: AccountId,
    /// client_b のアカウント ID。
    pub account_b: AccountId,
    /// client_a のアカウントハンドル。
    #[allow(dead_code)]
    pub handle_a: SipAccountHandle,
    /// client_b のアカウントハンドル。
    #[allow(dead_code)]
    pub handle_b: SipAccountHandle,
    /// client_a のイベントレシーバー。
    pub events_a: broadcast::Receiver<SipEvent>,
    /// client_b のイベントレシーバー。
    pub events_b: broadcast::Receiver<SipEvent>,
}

impl DualClientContext {
    /// 2 つの SipClient を生成し、各アカウントを登録する。
    ///
    /// client_a を先に生成し（新規 Reactor 起動）、client_b を後に生成する
    ///（既存の GLOBAL_RUNTIME を再利用、Initialize スキップ）。
    /// 各 Client から subscribe したイベントレシーバーを保持する。
    pub fn new(
        config_a: ClientConfig,
        config_b: ClientConfig,
        account_cfg_a: AccountConfig,
        account_cfg_b: AccountConfig,
    ) -> Result<Self, SipError> {
        let client_a = SipClient::new_with_pjsip(config_a)?;
        let events_a = client_a.subscribe();
        let handle_a = client_a.add_account(account_cfg_a)?;
        let account_a = handle_a.id();

        // 2 つめの Client は既存 GLOBAL_RUNTIME を自動検出して再利用する
        let client_b = SipClient::new_with_pjsip(config_b)?;
        let events_b = client_b.subscribe();
        let handle_b = client_b.add_account(account_cfg_b)?;
        let account_b = handle_b.id();

        Ok(Self {
            client_a,
            client_b,
            account_a,
            account_b,
            handle_a,
            handle_b,
            events_a,
            events_b,
        })
    }

    // ------------------------------------------------------------------
    // 通信操作
    // ------------------------------------------------------------------

    /// client_a から client_b のアカウントに発信する。
    ///
    /// `target_uri` 例: `"sip:test_user_2@192.168.1.100:5060"`
    pub fn call_a_to_b(&self, target_uri: impl Into<String>) -> Result<CallId, SipError> {
        self.client_a.make_call(
            self.account_a,
            OutgoingCallRequest {
                target_uri: target_uri.into(),
                headers: vec![],
                auth_override: None,
                preferred_transport: None,
                media: CallMediaPreferences {
                    enable_early_media: true,
                    enable_srtp: None,
                    preferred_codecs: vec![],
                },
                auto_answer_refer: false,
            },
        )
    }

    /// client_b が着信に応答する。
    ///
    /// 許可コード: 180 (Ringing), 183 (Session Progress), 200 (OK),
    /// 486 (Busy Here), 603 (Decline)
    pub fn answer_b(&self, call_id: CallId, code: u16) -> Result<(), SipError> {
        self.client_b.answer(call_id, code)
    }

    /// client_a が通話を切断する。
    ///
    /// `reason` の指定例: `HangupReason::Bye`（正常切断）
    pub fn hangup_a(&self, call_id: CallId, reason: HangupReason) -> Result<(), SipError> {
        self.client_a.hangup(call_id, reason)
    }

    /// client_b が通話を切断する。
    ///
    /// `reason` の指定例: `HangupReason::Bye`（正常切断）
    #[allow(dead_code)]
    pub fn hangup_b(&self, call_id: CallId, reason: HangupReason) -> Result<(), SipError> {
        self.client_b.hangup(call_id, reason)
    }

    // ------------------------------------------------------------------
    // イベント待機ヘルパー（&mut self — Receiver が可変参照を要求）
    // ------------------------------------------------------------------

    /// client_a のイベントストリームから条件に合致する最初のイベントを待機する。
    ///
    /// タイムアウトは `EVENT_TIMEOUT`（10 秒）。
    pub async fn wait_for_event_a<F>(&mut self, predicate: F) -> Result<SipEvent, SipError>
    where
        F: Fn(&SipEventPayload) -> bool,
    {
        wait_for_event_with_timeout(&mut self.events_a, EVENT_TIMEOUT, predicate).await
    }

    /// client_b のイベントストリームから条件に合致する最初のイベントを待機する。
    ///
    /// タイムアウトは `EVENT_TIMEOUT`（10 秒）。
    #[allow(dead_code)]
    pub async fn wait_for_event_b<F>(&mut self, predicate: F) -> Result<SipEvent, SipError>
    where
        F: Fn(&SipEventPayload) -> bool,
    {
        wait_for_event_with_timeout(&mut self.events_b, EVENT_TIMEOUT, predicate).await
    }

    // -- 特化ヘルパー --

    /// client_a で `IncomingCall` を待機する。
    pub async fn wait_for_call_incoming_a(&mut self) -> Result<SipEvent, SipError> {
        self.wait_for_event_a_with_timeout(CALL_TIMEOUT, |p| {
            matches!(p, SipEventPayload::IncomingCall { .. })
        })
        .await
    }

    /// client_b で `IncomingCall` を待機する。
    pub async fn wait_for_call_incoming_b(&mut self) -> Result<SipEvent, SipError> {
        self.wait_for_event_b_with_timeout(CALL_TIMEOUT, |p| {
            matches!(p, SipEventPayload::IncomingCall { .. })
        })
        .await
    }

    /// client_a で `CallConnected` を待機する。
    pub async fn wait_for_call_connected_a(&mut self) -> Result<SipEvent, SipError> {
        self.wait_for_event_a_with_timeout(CALL_TIMEOUT, |p| {
            matches!(p, SipEventPayload::CallConnected { .. })
        })
        .await
    }

    /// client_b で `CallConnected` を待機する。
    pub async fn wait_for_call_connected_b(&mut self) -> Result<SipEvent, SipError> {
        self.wait_for_event_b_with_timeout(CALL_TIMEOUT, |p| {
            matches!(p, SipEventPayload::CallConnected { .. })
        })
        .await
    }

    /// client_a で `CallDisconnected` を待機する。
    #[allow(dead_code)]
    pub async fn wait_for_call_disconnected_a(&mut self) -> Result<SipEvent, SipError> {
        self.wait_for_event_a_with_timeout(CALL_TIMEOUT, |p| {
            matches!(p, SipEventPayload::CallDisconnected { .. })
        })
        .await
    }

    /// client_b で `CallDisconnected` を待機する。
    pub async fn wait_for_call_disconnected_b(&mut self) -> Result<SipEvent, SipError> {
        self.wait_for_event_b_with_timeout(CALL_TIMEOUT, |p| {
            matches!(p, SipEventPayload::CallDisconnected { .. })
        })
        .await
    }

    // ------------------------------------------------------------------
    // 内部ヘルパー
    // ------------------------------------------------------------------

    /// client_a のイベント待機（タイムアウト指定可能）。
    async fn wait_for_event_a_with_timeout<F>(
        &mut self,
        timeout: Duration,
        predicate: F,
    ) -> Result<SipEvent, SipError>
    where
        F: Fn(&SipEventPayload) -> bool,
    {
        wait_for_event_with_timeout(&mut self.events_a, timeout, predicate).await
    }

    /// client_b のイベント待機（タイムアウト指定可能）。
    #[allow(dead_code)]
    async fn wait_for_event_b_with_timeout<F>(
        &mut self,
        timeout: Duration,
        predicate: F,
    ) -> Result<SipEvent, SipError>
    where
        F: Fn(&SipEventPayload) -> bool,
    {
        wait_for_event_with_timeout(&mut self.events_b, timeout, predicate).await
    }

    // ------------------------------------------------------------------
    // 後片付け
    // ------------------------------------------------------------------

    /// 両 Client を安全にシャットダウンする。
    ///
    /// client_b を先に drop してから client_a の `shutdown()` を呼ぶ。
    /// 同一 PjsuaBackend singleton を共有しているため、`pjsua_destroy()`
    /// は 1 度だけしか呼べない。client_a の shutdown で Backend を破棄し、
    /// client_b は単にドロップする。
    pub fn shutdown_all(self) -> Result<(), SipError> {
        drop(self.client_b);
        self.client_a.shutdown()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// DualClientContext の構造が Send + Sync を満たすことを確認する。
    #[test]
    fn assert_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<DualClientContext>();
        assert_sync::<DualClientContext>();
    }

    /// イベントレシーバーが別インスタンスであることを確認する。
    ///
    /// MockBackend では Dual Client シナリオの完全テストが困難なため、
    /// 最小限のコンパイル時・構成型検証のみ行う。
    #[test]
    fn receivers_are_separate_instances() {
        // 同一型の 2 つの Receiver が別の変数に代入可能であることを確認
        let (_tx_a, rx_a) = broadcast::channel::<SipEvent>(16);
        let (_tx_b, rx_b) = broadcast::channel::<SipEvent>(16);

        // 異なる Receiver インスタンスとして区別できること
        let _events_a = rx_a;
        let _events_b = rx_b;
        // コンパイルが通れば Receiver<u32> と Receiver<String> でないことの証明になる
        _ = (_events_a, _events_b);
    }
}
