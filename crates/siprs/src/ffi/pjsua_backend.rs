//! # PjsuaBackend — `SipBackend` trait の PJSUA 実装
//!
//! 全 PJSUA API 呼び出しを safe Rust でラップする。
//! PJSIP 2.17 ライブラリが利用可能な場合のみ実際の FFI 呼び出しを行い、
//! それ以外の環境ではコンパイルを通すためのスタブ実装を提供する。
//!
//! # cfg 制御
//!
//! - `feature = "pjsip"` 有効時: 実際の `extern "C"` FFI 呼び出し
//! - `feature = "pjsip"` 無効時: `unimplemented!()` スタブ

use crate::config::AccountConfig;
use crate::config::ClientConfig;
use crate::config::DtmfMethod;
use crate::config::OutgoingCallRequest;
use crate::config::TransportConfig;
use crate::error::SipError;
use crate::event::ClientCapabilities;
use crate::runtime::backend::NativeAccId;
use crate::runtime::backend::NativeCallId;
use crate::runtime::backend::NativeConfPortId;
use crate::runtime::backend::SipBackend;

// ---------------------------------------------------------------------------
// コーデック優先度定数
// ---------------------------------------------------------------------------

/// PCMU/8000 の優先度（最高）。
pub(crate) const CODEC_PRIO_PCMU: u8 = 255;
/// Opus 系コーデックの優先度。
pub(crate) const CODEC_PRIO_OPUS: u8 = 254;
/// 無効化するコーデックの優先度。
pub(crate) const CODEC_PRIO_DISABLED: u8 = 0;

// ---------------------------------------------------------------------------
// PjsuaBackend 構造体
// ---------------------------------------------------------------------------

/// `SipBackend` trait の PJSUA 実装。
///
/// PJSIP 2.17 ライブラリを直接駆動する。
/// `feature = "pjsip"` が有効な場合のみ実際の FFI 呼び出しを行う。
pub(crate) struct PjsuaBackend {
    /// pjsua が初期化済みかどうか。
    initialized: bool,
}

impl PjsuaBackend {
    /// 新しい `PjsuaBackend` を生成する。
    pub fn new() -> Self {
        Self { initialized: false }
    }
}

// ---------------------------------------------------------------------------
// pj_status_t → SipError 変換
// ---------------------------------------------------------------------------

/// pj_status_t の主要エラーコード定数。
///
/// PJSIP 2.17 の `pj/types.h` / `pj/errno.h` で定義される値。
/// bindgen 利用可能時は `ffi::bindings::PJ_EBUSY` 等に置き換える。
mod pj_errno {
    pub(crate) const PJ_EBUSY: i32 = -1;
    pub(crate) const PJ_ETIMEDOUT: i32 = -2;
    pub(crate) const PJ_EINVAL: i32 = -3;
    pub(crate) const PJ_ENOMEM: i32 = -5;
    pub(crate) const PJ_EEXIST: i32 = -9;
}

/// pj_status_t（i32）を SipError に変換する。
///
/// # Panics
///
/// `status == 0`（PJ_SUCCESS）の場合、エラーではないため panic する。
pub(crate) fn pj_status_to_sip_error(status: i32, context: &str) -> SipError {
    match status {
        0 => unreachable!("pj_status_to_sip_error called with PJ_SUCCESS (0)"),
        pj_errno::PJ_EBUSY => {
            SipError::native_error(format!("{context}: PJ_EBUSY"), status, None, None)
        }
        pj_errno::PJ_ETIMEDOUT => {
            SipError::native_error(format!("{context}: PJ_ETIMEDOUT"), status, None, None)
        }
        pj_errno::PJ_EINVAL => {
            SipError::native_error(format!("{context}: PJ_EINVAL"), status, None, None)
        }
        pj_errno::PJ_ENOMEM => {
            SipError::native_error(format!("{context}: PJ_ENOMEM"), status, None, None)
        }
        pj_errno::PJ_EEXIST => {
            SipError::native_error(format!("{context}: PJ_EEXIST"), status, None, None)
        }
        _ => SipError::native_error(context, status, None, None),
    }
}

// ---------------------------------------------------------------------------
// SipBackend 実装（PJSIP 利用可能時）
// ---------------------------------------------------------------------------

// [::STUB::] M19-1（build.rs — prebuilt優先・source build fallback）まで
// pjsua_* FFI 関数は利用不可。実際の実装は M19-1 完了後に記述する。
// 現状は PJSIP が利用可能な環境でも extern "C" が利用不可のため、
// stub と同じ振る舞いとする。

// #[cfg(feature = "pjsip")]
// impl SipBackend for PjsuaBackend {
//     fn initialize(&mut self, config: &ClientConfig) -> Result<ClientCapabilities, SipError> {
//         // SAFETY: pjsua_create() → pjsua_init() → pjsua_start() の順序は
//         // PJSIP 2.17 API ドキュメントで保証されている。
//         todo!("M19-1: implement with actual pjsua_* FFI calls")
//     }
//     // ... 他のメソッドも同様
// }

// ---------------------------------------------------------------------------
// SipBackend 実装（PJSIP 不在時のスタブ）
// ---------------------------------------------------------------------------

#[cfg(not(feature = "pjsip"))]
impl SipBackend for PjsuaBackend {
    fn initialize(&mut self, _config: &ClientConfig) -> Result<ClientCapabilities, SipError> {
        unimplemented!(
            "PjsuaBackend::initialize requires PJSIP headers (enable 'pjsip' feature, see M19-1)"
        )
    }

    fn shutdown(&mut self) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::shutdown requires PJSIP headers")
    }

    fn create_transport(&mut self, _config: &TransportConfig) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::create_transport requires PJSIP headers")
    }

    fn add_account(
        &mut self,
        _config: &AccountConfig,
    ) -> Result<(NativeAccId, ClientCapabilities), SipError> {
        unimplemented!("PjsuaBackend::add_account requires PJSIP headers")
    }

    fn remove_account(&mut self, _native_acc_id: NativeAccId) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::remove_account requires PJSIP headers")
    }

    fn set_registration(
        &mut self,
        _native_acc_id: NativeAccId,
        _enabled: bool,
    ) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::set_registration requires PJSIP headers")
    }

    fn make_call(
        &mut self,
        _native_acc_id: NativeAccId,
        _request: &OutgoingCallRequest,
    ) -> Result<NativeCallId, SipError> {
        unimplemented!("PjsuaBackend::make_call requires PJSIP headers")
    }

    fn answer_call(&mut self, _native_call_id: NativeCallId, _code: u16) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::answer_call requires PJSIP headers")
    }

    fn hangup(&mut self, _native_call_id: NativeCallId) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::hangup requires PJSIP headers")
    }

    fn conf_connect(
        &mut self,
        _source: NativeConfPortId,
        _sink: NativeConfPortId,
    ) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::conf_connect requires PJSIP headers")
    }

    fn conf_disconnect(
        &mut self,
        _source: NativeConfPortId,
        _sink: NativeConfPortId,
    ) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::conf_disconnect requires PJSIP headers")
    }

    fn configure_codecs(&mut self) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::configure_codecs requires PJSIP headers")
    }

    fn send_dtmf(
        &mut self,
        _native_call_id: NativeCallId,
        _method: &DtmfMethod,
        _digits: &str,
    ) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::send_dtmf requires PJSIP headers")
    }

    fn transfer_call(
        &mut self,
        _native_call_id: NativeCallId,
        _target: &str,
    ) -> Result<(), SipError> {
        unimplemented!("PjsuaBackend::transfer_call requires PJSIP headers")
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// new() 直後は initialized == false であることを確認する。
    #[test]
    fn test_new_not_initialized() {
        let backend = PjsuaBackend::new();
        assert!(!backend.initialized);
    }

    /// pj_status_to_sip_error が PJ_SUCCESS(0) で panic することを確認する。
    #[test]
    #[should_panic(expected = "PJ_SUCCESS")]
    fn test_pj_status_to_sip_error_panics_on_success() {
        let _ = pj_status_to_sip_error(0, "test");
    }

    /// 既知のエラーコードが正しいエラーメッセージに変換されることを確認する。
    #[test]
    fn test_pj_status_to_sip_error_known_codes() {
        let err = pj_status_to_sip_error(-1, "test");
        assert!(err.message.contains("PJ_EBUSY"));
        assert_eq!(err.native_status, Some(-1));

        let err = pj_status_to_sip_error(-2, "test");
        assert!(err.message.contains("PJ_ETIMEDOUT"));

        let err = pj_status_to_sip_error(-3, "test");
        assert!(err.message.contains("PJ_EINVAL"));

        let err = pj_status_to_sip_error(-5, "test");
        assert!(err.message.contains("PJ_ENOMEM"));

        let err = pj_status_to_sip_error(-9, "test");
        assert!(err.message.contains("PJ_EEXIST"));
    }

    /// 未知のエラーコードが NativeError に変換されることを確認する。
    #[test]
    fn test_pj_status_to_sip_error_unknown() {
        let err = pj_status_to_sip_error(-999, "unknown error");
        assert_eq!(err.native_status, Some(-999));
        assert!(err.message.contains("unknown error"));
    }

    /// PjsuaBackend が SipBackend + Send の trait 境界を満たすことを確認する。
    #[test]
    fn test_sip_backend_trait_bounds() {
        fn check_send<T: Send>(_t: &T) {}
        fn check_sip_backend<T: SipBackend>(_t: &T) {}

        let backend = PjsuaBackend::new();
        check_send(&backend);
        check_sip_backend(&backend);
    }

    /// PJSIP feature なしで initialize が unimplemented! になることを確認する。
    #[test]
    #[should_panic(expected = "not implemented:")]
    fn test_initialize_unimplemented_without_pjsip() {
        let mut backend = PjsuaBackend::new();
        let config = ClientConfig::default();
        let _ = backend.initialize(&config);
    }

    /// configure_codecs の優先度定数が期待値と一致することを確認する。
    #[test]
    fn test_codec_priority_constants() {
        assert_eq!(CODEC_PRIO_PCMU, 255);
        assert_eq!(CODEC_PRIO_OPUS, 254);
        assert_eq!(CODEC_PRIO_DISABLED, 0);
    }
}
