//! # Callback bridge — PJSIP C callback → NativeEvent enqueue
//!
//! PJSIP の C callback 群を Rust の reactor モデルに接続する橋渡し層。
//! 各 callback は最小限の処理（`NativeEvent` への変換と enqueue）のみを行い、
//! 状態変更やブロッキング操作は一切行わない。
//!
//! §46.1 パニック安全性: 全 callback を `catch_unwind` で保護し、
//! パニック発生時は 4 ステップクリーンアップを実行する。
//!
//! # グローバルランタイムアクセス
//!
//! PJSIP callback はコンテキストポインタを持たないため、`OnceLock` に
//! 保持した `RuntimeHandle` を介して reactor にアクセスする。
//! Reactor 起動時に `set_global_runtime()` を呼び出し、
//! callback 内では `global_runtime()` で取得する。
//!
//! # dead_code 許容
//!
//! このモジュールの全 callback 関数と型は M17-4 (PjsuaBackend) で
//! PJSIP に接続されるまで未使用。M17-4 完了時に `#[allow(dead_code)]` を除去する。
#![allow(dead_code)]

use std::panic::{self, UnwindSafe};
use std::sync::{Mutex, OnceLock};

use crate::runtime::handle::RuntimeHandle;

// ---------------------------------------------------------------------------
// グローバルランタイム
// ---------------------------------------------------------------------------

/// グローバルな RuntimeHandle を保持する OnceLock。
///
/// PJSIP callback から reactor にアクセスするための唯一の経路。
/// Reactor 起動時に `set_global_runtime` で設定され、
/// Shutdown 完了時にクリアされる。
///
/// 内部に Mutex を持つ理由: `OnceLock::take()` が stable Rust の static では
/// 使用できないため、テスト時のクリアを可能にするために二重構造としている。
/// 実運用時は `OnceLock` で一度だけ set され、テスト時に限り Mutex をクリアする。
static GLOBAL_RUNTIME: OnceLock<Mutex<Option<RuntimeHandle>>> = OnceLock::new();

/// グローバルな RuntimeHandle を設定する。
///
/// Reactor 起動時に `CoreReactor::spawn()` 内で呼び出す。
/// 二重呼び出しはエラーとして拒否する。
pub(crate) fn set_global_runtime(handle: RuntimeHandle) -> Result<(), RuntimeHandle> {
    let cell = GLOBAL_RUNTIME.get_or_init(|| Mutex::new(None));
    let mut guard = cell.lock().unwrap();
    if guard.is_some() {
        return Err(handle);
    }
    *guard = Some(handle);
    Ok(())
}

/// グローバルな RuntimeHandle を取得する。
///
/// reactor 未起動時は `None` を返す。
pub(crate) fn global_runtime() -> Option<RuntimeHandle> {
    let cell = GLOBAL_RUNTIME.get()?;
    let guard = cell.lock().unwrap();
    guard.clone()
}

/// グローバルな RuntimeHandle を破棄する（テスト用）。
#[cfg(test)]
pub(crate) fn clear_global_runtime() {
    if let Some(cell) = GLOBAL_RUNTIME.get() {
        let mut guard = cell.lock().unwrap();
        *guard = None;
    }
}

// ---------------------------------------------------------------------------
// NativeEvent — callback → reactor 間の内部イベント
// ---------------------------------------------------------------------------

/// PJSIP callback から reactor への内部イベント。
///
/// 各 variant は対応する PJSIP callback の引数から変換される最小情報のみを保持する。
/// この enum は `pub(crate)` であり、外部公開は `SipEventPayload` が担当する。
#[derive(Debug, Clone)]
pub(crate) enum NativeEvent {
    // --- Call events ---
    /// 着信。
    IncomingCall { acc_id: i32, call_id: i32 },
    /// 通話状態変更。
    CallStateChanged { call_id: i32, state: u32 },
    /// 通話メディア状態変更。
    CallMediaStateChanged { call_id: i32 },
    /// トランザクション状態変更。
    CallTsxStateChanged { call_id: i32 },
    /// 通話リダイレクト。
    CallRedirected { call_id: i32 },
    /// 転送ステータス通知。
    CallTransferStatus { call_id: i32, status_code: i32 },
    /// 通話置き換え。
    CallReplaced { old_call_id: i32, new_call_id: i32 },

    // --- Registration events ---
    /// 登録状態変更。
    RegistrationStateChanged { acc_id: i32 },
    /// 登録開始。
    RegistrationStarted { acc_id: i32, renew: bool },

    // --- DTMF events ---
    /// DTMF 数字受信。
    DtmfDigit { call_id: i32, digit: i32 },
    /// DTMF 数字受信（method 付き）。
    DtmfDigit2 {
        call_id: i32,
        digit: i32,
        method: u32,
    },

    // --- Transport events ---
    /// トランスポート状態変更。
    TransportStateChanged { tp_id: i32, state: u32 },

    // --- ICE events ---
    /// ICE トランスポートエラー。
    IceTransportError { call_id: i32, status: i32 },

    // --- NAT events ---
    /// NAT 検出結果。
    NatDetected { info: String },
}

// ---------------------------------------------------------------------------
// PjsuaCallback — 手動定義（PJSIP 2.17 pjsua_callback 互換）
// ---------------------------------------------------------------------------

/// PJSIP 2.17 `pjsua_callback` の手動定義。
///
/// bindgen 生成が可能になった時点で `static_assertions` により
/// 手動定義と bindgen 生成の型のレイアウト一致を検証する。
///
/// # 未対応フィールド
///
/// 以下の callback は MVP 範囲外として `None` 固定。
/// M17-4 または M18 で必要に応じて追加する:
/// - `on_mwi_info`
/// - `on_pager`
/// - `on_pager2`
/// - `on_typing`
/// - `on_buddy_state`
#[repr(C)]
pub(crate) struct PjsuaCallback {
    /// 通話状態変更。
    pub on_call_state: Option<extern "C" fn(call_id: i32, e: *mut std::ffi::c_void)>,
    /// 着信。
    pub on_incoming_call:
        Option<extern "C" fn(acc_id: i32, call_id: i32, rdata: *mut std::ffi::c_void)>,
    /// 通話メディア状態変更。
    pub on_call_media_state: Option<extern "C" fn(call_id: i32)>,
    /// 登録状態変更。
    pub on_reg_state: Option<extern "C" fn(acc_id: i32)>,
    /// 登録開始。
    pub on_reg_started: Option<extern "C" fn(acc_id: i32, renew: i32)>,
    /// DTMF 数字受信。
    pub on_dtmf_digit: Option<extern "C" fn(call_id: i32, digit: i32)>,
    /// トランザクション状態変更。
    pub on_call_tsx_state:
        Option<extern "C" fn(call_id: i32, tsx: *mut std::ffi::c_void, e: *mut std::ffi::c_void)>,
    /// 通話リダイレクト。
    pub on_call_redirected: Option<extern "C" fn(call_id: i32, target: *mut std::ffi::c_void)>,
    /// 転送ステータス通知。
    pub on_call_transfer_status:
        Option<extern "C" fn(call_id: i32, st_code: i32, st_text: *mut std::ffi::c_void)>,
    /// 通話置き換え。
    pub on_call_replaced: Option<extern "C" fn(old_call_id: i32, new_call_id: i32)>,
    /// DTMF 数字受信（method 付き）。
    pub on_dtmf_digit2: Option<extern "C" fn(call_id: i32, digit: i32, method: u32)>,
    /// トランスポート状態変更。
    pub on_transport_state:
        Option<extern "C" fn(tp_id: i32, state: u32, info: *mut std::ffi::c_void)>,
    /// ICE トランスポートエラー。
    pub on_ice_transport_error: Option<
        extern "C" fn(
            call_id: i32,
            op: *mut std::ffi::c_void,
            status: i32,
            reason: *mut std::ffi::c_void,
        ),
    >,
    /// NAT 検出結果。
    pub on_nat_detect: Option<extern "C" fn(info: *mut std::ffi::c_void)>,
}

// ---------------------------------------------------------------------------
// catch_callback_panic — パニック安全性
// ---------------------------------------------------------------------------

/// PJSIP callback を `catch_unwind` で保護して実行する。
///
/// 正常時は `Some(result)`、パニック捕捉時は `None` を返す。
/// パニック時は `tracing::error` でログ出力する。
///
/// §46.1 の完全な 4 ステップクリーンアップ（Stopping 遷移 → 非同期クリーンアップ →
/// リーク許容 → 事後通知）は M17-4 で実装する。本チケットでは捕捉とログ出力まで。
pub(crate) fn catch_callback_panic<F, R>(callback_name: &str, f: F) -> Option<R>
where
    F: FnOnce() -> R + UnwindSafe,
{
    match panic::catch_unwind(f) {
        Ok(result) => Some(result),
        Err(panic_payload) => {
            let msg = if let Some(s) = panic_payload.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_payload.downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown panic".to_string()
            };
            tracing::error!(
                callback = %callback_name,
                panic = %msg,
                "PJSIP callback panicked — see M17-4 for cleanup"
            );
            None
        }
    }
}

// ---------------------------------------------------------------------------
// enqueue_native_event — NativeEvent を reactor に送信
// ---------------------------------------------------------------------------

/// NativeEvent を reactor に enqueue する。
///
/// 現状は `tracing::trace` による計装のみ。
/// M17-4 で `RuntimeHandle` 経由の実際の送信を実装する。
fn enqueue_native_event(event: NativeEvent) {
    if let Some(_handle) = global_runtime() {
        tracing::trace!(?event, "NativeEvent enqueued to reactor");
        // M17-4: RuntimeHandle 経由で reactor に送信
        // _handle.send(RuntimeCommand::NativeEvent { event, reply });
    }
}

// ---------------------------------------------------------------------------
// extern "C" callback 関数群
// ---------------------------------------------------------------------------

/// PJSIP callback の extern "C" 実装。
///
/// 各関数は `catch_callback_panic` で保護され、callback 引数を
/// `NativeEvent` に変換して reactor に enqueue する。
pub(crate) mod pjsip_callbacks {
    use super::*;

    /// 着信 callback。
    pub extern "C" fn on_incoming_call(acc_id: i32, call_id: i32, _rdata: *mut std::ffi::c_void) {
        catch_callback_panic("on_incoming_call", || {
            tracing::debug!(acc_id, call_id, "on_incoming_call");
            enqueue_native_event(NativeEvent::IncomingCall { acc_id, call_id });
        });
    }

    /// 通話状態変更 callback。
    pub extern "C" fn on_call_state(call_id: i32, _e: *mut std::ffi::c_void) {
        catch_callback_panic("on_call_state", || {
            tracing::debug!(call_id, "on_call_state");
            // M17-4: _e から pjsip_event を展開して state を抽出
            enqueue_native_event(NativeEvent::CallStateChanged {
                call_id,
                state: 0, // [::STUB::] M17-4: pjsip_event から state を抽出
            });
        });
    }

    /// 通話メディア状態変更 callback。
    pub extern "C" fn on_call_media_state(call_id: i32) {
        catch_callback_panic("on_call_media_state", || {
            tracing::debug!(call_id, "on_call_media_state");
            enqueue_native_event(NativeEvent::CallMediaStateChanged { call_id });
        });
    }

    /// 登録状態変更 callback。
    pub extern "C" fn on_reg_state(acc_id: i32) {
        catch_callback_panic("on_reg_state", || {
            tracing::debug!(acc_id, "on_reg_state");
            enqueue_native_event(NativeEvent::RegistrationStateChanged { acc_id });
        });
    }

    /// 登録開始 callback。
    pub extern "C" fn on_reg_started(acc_id: i32, renew: i32) {
        catch_callback_panic("on_reg_started", || {
            tracing::debug!(acc_id, renew, "on_reg_started");
            enqueue_native_event(NativeEvent::RegistrationStarted {
                acc_id,
                renew: renew != 0,
            });
        });
    }

    /// DTMF 数字受信 callback。
    pub extern "C" fn on_dtmf_digit(call_id: i32, digit: i32) {
        catch_callback_panic("on_dtmf_digit", || {
            tracing::debug!(call_id, digit, "on_dtmf_digit");
            enqueue_native_event(NativeEvent::DtmfDigit { call_id, digit });
        });
    }

    /// 通話リダイレクト callback。
    pub extern "C" fn on_call_redirected(call_id: i32, _target: *mut std::ffi::c_void) {
        catch_callback_panic("on_call_redirected", || {
            tracing::debug!(call_id, "on_call_redirected");
            enqueue_native_event(NativeEvent::CallRedirected { call_id });
        });
    }

    /// 転送ステータス通知 callback。
    pub extern "C" fn on_call_transfer_status(
        call_id: i32,
        st_code: i32,
        _st_text: *mut std::ffi::c_void,
    ) {
        catch_callback_panic("on_call_transfer_status", || {
            tracing::debug!(call_id, st_code, "on_call_transfer_status");
            enqueue_native_event(NativeEvent::CallTransferStatus {
                call_id,
                status_code: st_code,
            });
        });
    }

    /// 通話置き換え callback。
    pub extern "C" fn on_call_replaced(old_call_id: i32, new_call_id: i32) {
        catch_callback_panic("on_call_replaced", || {
            tracing::debug!(old_call_id, new_call_id, "on_call_replaced");
            enqueue_native_event(NativeEvent::CallReplaced {
                old_call_id,
                new_call_id,
            });
        });
    }

    /// DTMF 数字受信（method 付き）callback。
    pub extern "C" fn on_dtmf_digit2(call_id: i32, digit: i32, method: u32) {
        catch_callback_panic("on_dtmf_digit2", || {
            tracing::debug!(call_id, digit, method, "on_dtmf_digit2");
            enqueue_native_event(NativeEvent::DtmfDigit2 {
                call_id,
                digit,
                method,
            });
        });
    }

    /// トランスポート状態変更 callback。
    pub extern "C" fn on_transport_state(tp_id: i32, state: u32, _info: *mut std::ffi::c_void) {
        catch_callback_panic("on_transport_state", || {
            tracing::debug!(tp_id, state, "on_transport_state");
            enqueue_native_event(NativeEvent::TransportStateChanged { tp_id, state });
        });
    }

    /// ICE トランスポートエラー callback。
    pub extern "C" fn on_ice_transport_error(
        call_id: i32,
        _op: *mut std::ffi::c_void,
        status: i32,
        _reason: *mut std::ffi::c_void,
    ) {
        catch_callback_panic("on_ice_transport_error", || {
            tracing::debug!(call_id, status, "on_ice_transport_error");
            enqueue_native_event(NativeEvent::IceTransportError { call_id, status });
        });
    }

    /// NAT 検出結果 callback。
    pub extern "C" fn on_nat_detect(_info: *mut std::ffi::c_void) {
        catch_callback_panic("on_nat_detect", || {
            tracing::debug!("on_nat_detect");
            // M17-4: _info から pj_stun_nat_detect_result を展開
            enqueue_native_event(NativeEvent::NatDetected {
                info: String::new(), // [::STUB::] M17-4: 検出結果から展開
            });
        });
    }

    // --- トランザクション状態変更（引数が多いため分離） ---
    /// トランザクション状態変更 callback。
    pub extern "C" fn on_call_tsx_state(
        call_id: i32,
        _tsx: *mut std::ffi::c_void,
        _e: *mut std::ffi::c_void,
    ) {
        catch_callback_panic("on_call_tsx_state", || {
            tracing::debug!(call_id, "on_call_tsx_state");
            enqueue_native_event(NativeEvent::CallTsxStateChanged { call_id });
        });
    }
}

// ---------------------------------------------------------------------------
// register_callbacks — pjsua_callback への関数ポインタ設定
// ---------------------------------------------------------------------------

/// pjsua_callback 構造体に全 callback 関数ポインタを設定する。
///
/// 設定後、この構造体を `pjsua_set_callback()` に渡すことで
/// PJSIP が各イベント発生時に Rust 側の callback を呼び出すようになる。
pub(crate) fn register_callbacks(cb: &mut PjsuaCallback) {
    cb.on_call_state = Some(pjsip_callbacks::on_call_state);
    cb.on_incoming_call = Some(pjsip_callbacks::on_incoming_call);
    cb.on_call_media_state = Some(pjsip_callbacks::on_call_media_state);
    cb.on_reg_state = Some(pjsip_callbacks::on_reg_state);
    cb.on_reg_started = Some(pjsip_callbacks::on_reg_started);
    cb.on_dtmf_digit = Some(pjsip_callbacks::on_dtmf_digit);
    cb.on_call_tsx_state = Some(pjsip_callbacks::on_call_tsx_state);
    cb.on_call_redirected = Some(pjsip_callbacks::on_call_redirected);
    cb.on_call_transfer_status = Some(pjsip_callbacks::on_call_transfer_status);
    cb.on_call_replaced = Some(pjsip_callbacks::on_call_replaced);
    cb.on_dtmf_digit2 = Some(pjsip_callbacks::on_dtmf_digit2);
    cb.on_transport_state = Some(pjsip_callbacks::on_transport_state);
    cb.on_ice_transport_error = Some(pjsip_callbacks::on_ice_transport_error);
    cb.on_nat_detect = Some(pjsip_callbacks::on_nat_detect);
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- NativeEvent の基本特性 ---

    /// NativeEvent の全 variant が Debug + Clone を実装していることを確認する。
    #[test]
    fn test_native_event_debug_clone() {
        // Call events
        let e1 = NativeEvent::IncomingCall {
            acc_id: 1,
            call_id: 10,
        };
        let e2 = NativeEvent::CallStateChanged {
            call_id: 10,
            state: 2,
        };
        let e3 = NativeEvent::CallMediaStateChanged { call_id: 10 };
        let e4 = NativeEvent::CallTsxStateChanged { call_id: 10 };
        let e5 = NativeEvent::CallRedirected { call_id: 10 };
        let e6 = NativeEvent::CallTransferStatus {
            call_id: 10,
            status_code: 200,
        };
        let e7 = NativeEvent::CallReplaced {
            old_call_id: 10,
            new_call_id: 20,
        };

        // Registration events
        let e8 = NativeEvent::RegistrationStateChanged { acc_id: 1 };
        let e9 = NativeEvent::RegistrationStarted {
            acc_id: 1,
            renew: true,
        };

        // DTMF events
        let e10 = NativeEvent::DtmfDigit {
            call_id: 10,
            digit: 1,
        };
        let e11 = NativeEvent::DtmfDigit2 {
            call_id: 10,
            digit: 1,
            method: 0,
        };

        // Transport events
        let e12 = NativeEvent::TransportStateChanged { tp_id: 0, state: 1 };

        // ICE events
        let e13 = NativeEvent::IceTransportError {
            call_id: 10,
            status: -1,
        };

        // NAT events
        let e14 = NativeEvent::NatDetected {
            info: "test".into(),
        };

        for (i, e) in [e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11, e12, e13, e14]
            .iter()
            .enumerate()
        {
            let _cloned = e.clone();
            let _debug = format!("{e:?}");
            assert!(!_debug.is_empty(), "variant {i}: Debug should not be empty");
        }
    }

    // --- catch_callback_panic ---

    /// 正常終了時に catch_callback_panic が Some(result) を返すことを確認する。
    #[test]
    fn test_catch_callback_panic_normal() {
        let result = catch_callback_panic("test_normal", || 42);
        assert_eq!(result, Some(42));
    }

    /// パニック発生時に catch_callback_panic が None を返すことを確認する。
    #[test]
    fn test_catch_callback_panic_caught() {
        let result = catch_callback_panic("test_panic", || {
            panic!("intentional panic for test");
        });
        assert!(result.is_none());
    }

    // --- register_callbacks ---

    /// register_callbacks 後に PjsuaCallback の全フィールドが Some であることを確認する。
    #[test]
    fn test_register_callbacks_full() {
        // PjsuaCallback は #[repr(C)] で全てのフィールドが None 初期化
        let mut cb = PjsuaCallback {
            on_call_state: None,
            on_incoming_call: None,
            on_call_media_state: None,
            on_reg_state: None,
            on_reg_started: None,
            on_dtmf_digit: None,
            on_call_tsx_state: None,
            on_call_redirected: None,
            on_call_transfer_status: None,
            on_call_replaced: None,
            on_dtmf_digit2: None,
            on_transport_state: None,
            on_ice_transport_error: None,
            on_nat_detect: None,
        };

        register_callbacks(&mut cb);

        assert!(cb.on_call_state.is_some(), "on_call_state");
        assert!(cb.on_incoming_call.is_some(), "on_incoming_call");
        assert!(cb.on_call_media_state.is_some(), "on_call_media_state");
        assert!(cb.on_reg_state.is_some(), "on_reg_state");
        assert!(cb.on_reg_started.is_some(), "on_reg_started");
        assert!(cb.on_dtmf_digit.is_some(), "on_dtmf_digit");
        assert!(cb.on_call_tsx_state.is_some(), "on_call_tsx_state");
        assert!(cb.on_call_redirected.is_some(), "on_call_redirected");
        assert!(
            cb.on_call_transfer_status.is_some(),
            "on_call_transfer_status"
        );
        assert!(cb.on_call_replaced.is_some(), "on_call_replaced");
        assert!(cb.on_dtmf_digit2.is_some(), "on_dtmf_digit2");
        assert!(cb.on_transport_state.is_some(), "on_transport_state");
        assert!(
            cb.on_ice_transport_error.is_some(),
            "on_ice_transport_error"
        );
        assert!(cb.on_nat_detect.is_some(), "on_nat_detect");
    }

    /// 特定 callback が正しい extern "C" シグネチャを持っていることを確認する。
    #[test]
    fn test_register_callbacks_on_incoming_call() {
        let mut cb = PjsuaCallback {
            on_call_state: None,
            on_incoming_call: None,
            on_call_media_state: None,
            on_reg_state: None,
            on_reg_started: None,
            on_dtmf_digit: None,
            on_call_tsx_state: None,
            on_call_redirected: None,
            on_call_transfer_status: None,
            on_call_replaced: None,
            on_dtmf_digit2: None,
            on_transport_state: None,
            on_ice_transport_error: None,
            on_nat_detect: None,
        };

        register_callbacks(&mut cb);

        // 関数ポインタが pjsip_callbacks::on_incoming_call を指していること
        let expected_ptr = pjsip_callbacks::on_incoming_call as *const () as usize;
        let actual_ptr = cb.on_incoming_call.unwrap() as *const () as usize;
        assert_eq!(
            actual_ptr, expected_ptr,
            "on_incoming_call pointer mismatch"
        );
    }

    // --- global_runtime ---

    /// set_global_runtime → global_runtime で RuntimeHandle が取得できることを確認する。
    #[test]
    fn test_global_runtime_set_and_get() {
        clear_global_runtime();

        let (handle, _rx) = RuntimeHandle::new();
        assert!(set_global_runtime(handle.clone()).is_ok());

        let retrieved = global_runtime();
        assert!(
            retrieved.is_some(),
            "global_runtime should return Some after set"
        );
    }

    /// set_global_runtime の二重呼び出しが Err を返すことを確認する。
    #[test]
    fn test_global_runtime_double_set() {
        clear_global_runtime();

        let (handle1, _rx1) = RuntimeHandle::new();
        let (handle2, _rx2) = RuntimeHandle::new();

        assert!(set_global_runtime(handle1).is_ok());
        assert!(
            set_global_runtime(handle2).is_err(),
            "double set should fail"
        );
    }

    // --- enqueue_native_event ---

    /// global_runtime 未設定時に enqueue_native_event が panic しないことを確認する。
    #[test]
    fn test_enqueue_native_event_no_runtime() {
        clear_global_runtime();

        // panic しないこと
        enqueue_native_event(NativeEvent::CallStateChanged {
            call_id: 1,
            state: 2,
        });
    }

    // --- PjsuaCallback レイアウト ---

    /// PjsuaCallback のサイズとアライメントが期待値と一致することを確認する。
    #[test]
    fn test_pjsua_callback_layout() {
        // 14 個の Option<extern "C" fn> フィールド。
        // 各フィールドは 1 ワード（64bit 環境では 8 バイト）。
        // 合計: 14 * 8 = 112 バイト。
        let expected_size = 14 * std::mem::size_of::<usize>();
        assert_eq!(
            std::mem::size_of::<PjsuaCallback>(),
            expected_size,
            "PjsuaCallback size mismatch"
        );
        assert_eq!(
            std::mem::align_of::<PjsuaCallback>(),
            std::mem::align_of::<usize>(),
            "PjsuaCallback alignment mismatch"
        );
    }
}
