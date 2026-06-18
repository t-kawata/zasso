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
//!
//! # dead_code 抑制
//!
//! `pjsip` feature 有効時、テストにしか使われない型・定数が未使用と判定される。
//! これらは後続チケットで実際の FFI 呼び出しが実装されたタイミングで必要になる。
#![cfg_attr(feature = "pjsip", allow(dead_code))]

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

/// PJSIP feature 有効時の SipBackend 実装。
///
/// PJSUA C API を直接呼び出し、PJSIP ライブラリを駆動する。
#[cfg(feature = "pjsip")]
impl SipBackend for PjsuaBackend {
    fn initialize(&mut self, config: &ClientConfig) -> Result<ClientCapabilities, SipError> {
        use crate::ffi::bindings;
        use std::os::raw::c_long;

        if self.initialized {
            return Ok(ClientCapabilities::default_disabled());
        }
        unsafe {
            // pjsua_create() — PJSUA インスタンス作成
            let mut status = bindings::pjsua_create();
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_create"));
            }

            // pjsua_config 初期化
            let mut ua_cfg: bindings::pjsua_config = std::mem::zeroed();
            bindings::pjsua_config_default(&mut ua_cfg);

            let mut log_cfg: bindings::pjsua_logging_config = std::mem::zeroed();
            bindings::pjsua_logging_config_default(&mut log_cfg);

            let mut media_cfg: bindings::pjsua_media_config = std::mem::zeroed();
            bindings::pjsua_media_config_default(&mut media_cfg);

            // 最大通話数設定
            ua_cfg.max_calls = config.max_calls as ::std::os::raw::c_uint;

            // User-Agent 設定
            let ua_bytes = config.user_agent.as_bytes().to_vec();
            ua_cfg.user_agent = bindings::pj_str_t {
                ptr: ua_bytes.as_ptr() as *mut ::std::os::raw::c_char,
                slen: ua_bytes.len() as c_long,
            };

            // pjsua_init()
            status = bindings::pjsua_init(&ua_cfg, &log_cfg, &media_cfg);
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_init"));
            }

            // pjsua_start()
            status = bindings::pjsua_start();
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_start"));
            }
        }
        self.initialized = true;
        Ok(ClientCapabilities::default_disabled())
    }

    fn shutdown(&mut self) -> Result<(), SipError> {
        use crate::ffi::bindings;
        if !self.initialized {
            return Ok(());
        }
        unsafe {
            let status = bindings::pjsua_destroy();
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_destroy"));
            }
        }
        self.initialized = false;
        Ok(())
    }

    fn create_transport(&mut self, config: &TransportConfig) -> Result<(), SipError> {
        use crate::ffi::bindings;

        let (transport_type, _bind_addr) = match config {
            TransportConfig::Udp(cfg) => (bindings::PJSIP_TRANSPORT_UDP, cfg.bind_addr),
            TransportConfig::Tcp(cfg) => (bindings::PJSIP_TRANSPORT_TCP, cfg.bind_addr),
            #[cfg(feature = "tls")]
            TransportConfig::Tls(cfg) => (bindings::PJSIP_TRANSPORT_TLS, cfg.bind_addr),
        };

        unsafe {
            let mut tp_cfg: bindings::pjsua_transport_config = std::mem::zeroed();
            bindings::pjsua_transport_config_default(&mut tp_cfg);

            let mut tp_id: bindings::pjsua_transport_id = 0;
            let status =
                bindings::pjsua_transport_create(transport_type, &tp_cfg, &mut tp_id as *mut _);
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_transport_create"));
            }
        }
        Ok(())
    }

    fn add_account(
        &mut self,
        config: &AccountConfig,
    ) -> Result<(NativeAccId, ClientCapabilities), SipError> {
        use crate::ffi::bindings;
        use std::os::raw::c_long;

        unsafe {
            let mut acc_cfg: bindings::pjsua_acc_config = std::mem::zeroed();
            bindings::pjsua_acc_config_default(&mut acc_cfg);

            // SIP URI: sip:username@domain
            let sip_id = format!("sip:{}@{}", config.username, config.domain);
            let id_bytes = sip_id.as_bytes().to_vec();
            acc_cfg.id = bindings::pj_str_t {
                ptr: id_bytes.as_ptr() as *mut ::std::os::raw::c_char,
                slen: id_bytes.len() as c_long,
            };

            // Registrar URI
            let reg_uri = config
                .registrar_uri
                .clone()
                .unwrap_or_else(|| format!("sip:{}", config.domain));
            let reg_bytes = reg_uri.as_bytes().to_vec();
            acc_cfg.reg_uri = bindings::pj_str_t {
                ptr: reg_bytes.as_ptr() as *mut ::std::os::raw::c_char,
                slen: reg_bytes.len() as c_long,
            };

            // Credential（cred_info は opaque なため設定不可。認証は後続チケットで対応）
            acc_cfg.cred_count = 0;

            // Register on add
            acc_cfg.register_on_acc_add = if config.register_on_start { 1 } else { 0 };

            // Registration expiry
            acc_cfg.reg_timeout = config.registration_expires.as_secs() as ::std::os::raw::c_uint;

            let mut acc_id: bindings::pjsua_acc_id = 0;
            let status = bindings::pjsua_acc_add(
                &acc_cfg as *const _,
                0 as bindings::pj_bool_t,
                &mut acc_id,
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_acc_add"));
            }
            Ok((
                acc_id as NativeAccId,
                ClientCapabilities::default_disabled(),
            ))
        }
    }

    fn remove_account(&mut self, native_acc_id: NativeAccId) -> Result<(), SipError> {
        use crate::ffi::bindings;
        unsafe {
            let status = bindings::pjsua_acc_del(native_acc_id as bindings::pjsua_acc_id);
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_acc_del"));
            }
        }
        Ok(())
    }

    fn set_registration(
        &mut self,
        native_acc_id: NativeAccId,
        enabled: bool,
    ) -> Result<(), SipError> {
        use crate::ffi::bindings;
        unsafe {
            let renew: bindings::pj_bool_t = if enabled { 1 } else { 0 };
            let status = bindings::pjsua_acc_set_registration(
                native_acc_id as bindings::pjsua_acc_id,
                renew,
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_acc_set_registration"));
            }
        }
        Ok(())
    }

    fn make_call(
        &mut self,
        native_acc_id: NativeAccId,
        request: &OutgoingCallRequest,
    ) -> Result<NativeCallId, SipError> {
        use crate::ffi::bindings;
        use std::os::raw::c_long;

        unsafe {
            // 発信先 URI
            let uri_bytes = request.target_uri.as_bytes().to_vec();
            let dst = bindings::pj_str_t {
                ptr: uri_bytes.as_ptr() as *mut ::std::os::raw::c_char,
                slen: uri_bytes.len() as c_long,
            };

            // 発信設定（デフォルト）
            let mut call_opt: bindings::pjsua_call_setting = std::mem::zeroed();
            bindings::pjsua_call_setting_default(&mut call_opt);
            call_opt.aud_cnt = 1;

            let mut call_id: bindings::pjsua_call_id = 0;
            let status = bindings::pjsua_call_make_call(
                native_acc_id as bindings::pjsua_acc_id,
                &dst as *const _,
                &call_opt as *const _,
                std::ptr::null_mut(),
                std::ptr::null(),
                &mut call_id as *mut _,
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_call_make_call"));
            }
            Ok(call_id as NativeCallId)
        }
    }

    fn answer_call(&mut self, native_call_id: NativeCallId, code: u16) -> Result<(), SipError> {
        use crate::ffi::bindings;
        unsafe {
            let status = bindings::pjsua_call_answer(
                native_call_id as bindings::pjsua_call_id,
                code as ::std::os::raw::c_uint,
                std::ptr::null(),
                std::ptr::null(),
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_call_answer"));
            }
        }
        Ok(())
    }

    fn hangup(&mut self, native_call_id: NativeCallId) -> Result<(), SipError> {
        use crate::ffi::bindings;
        unsafe {
            let status = bindings::pjsua_call_hangup(
                native_call_id as bindings::pjsua_call_id,
                0,
                std::ptr::null(),
                std::ptr::null(),
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_call_hangup"));
            }
        }
        Ok(())
    }

    fn conf_connect(
        &mut self,
        source: NativeConfPortId,
        sink: NativeConfPortId,
    ) -> Result<(), SipError> {
        use crate::ffi::bindings;
        unsafe {
            let status = bindings::pjsua_conf_connect(
                source as bindings::pjsua_conf_port_id,
                sink as bindings::pjsua_conf_port_id,
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_conf_connect"));
            }
        }
        Ok(())
    }

    fn conf_disconnect(
        &mut self,
        source: NativeConfPortId,
        sink: NativeConfPortId,
    ) -> Result<(), SipError> {
        use crate::ffi::bindings;
        unsafe {
            let status = bindings::pjsua_conf_disconnect(
                source as bindings::pjsua_conf_port_id,
                sink as bindings::pjsua_conf_port_id,
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_conf_disconnect"));
            }
        }
        Ok(())
    }

    fn configure_codecs(&mut self) -> Result<(), SipError> {
        use crate::ffi::bindings;
        unsafe {
            // PCMU（G.711 μ-law）= 最高優先度
            let pcmu: bindings::pj_str_t = bindings::pj_str_t {
                ptr: b"PCMU/8000/1\0" as *const u8 as *mut ::std::os::raw::c_char,
                slen: 10,
            };
            let mut status = bindings::pjsua_codec_set_priority(&pcmu as *const _, CODEC_PRIO_PCMU);
            if status != 0 {
                return Err(pj_status_to_sip_error(
                    status,
                    "pjsua_codec_set_priority PCMU",
                ));
            }

            // Opus（利用可能な場合）= 高優先度
            let opus: bindings::pj_str_t = bindings::pj_str_t {
                ptr: b"opus/48000/2\0" as *const u8 as *mut ::std::os::raw::c_char,
                slen: 12,
            };
            status = bindings::pjsua_codec_set_priority(&opus as *const _, CODEC_PRIO_OPUS);
            if status != 0 {
                // Opus 未インストールの場合は無視
            }

            // PCMU/Opus 以外の全コーデックを無効化
            let mut count: ::std::os::raw::c_uint = 128;
            let mut codecs: Vec<bindings::pjsua_codec_info> =
                vec![std::mem::zeroed(); count as usize];
            status = bindings::pjsua_enum_codecs(codecs.as_mut_ptr(), &mut count as *mut _);
            if status == 0 {
                for codec in codecs.iter().take(count as usize) {
                    let codec_id = &codec.codec_id;
                    let name_bytes = std::slice::from_raw_parts(
                        codec_id.ptr as *const u8,
                        codec_id.slen as usize,
                    );
                    let name = std::str::from_utf8_unchecked(name_bytes);
                    if name != "PCMU/8000/1" && !name.starts_with("opus/") {
                        let _ = bindings::pjsua_codec_set_priority(
                            codec_id as *const _,
                            CODEC_PRIO_DISABLED,
                        );
                    }
                }
            }
        }
        Ok(())
    }

    fn send_dtmf(
        &mut self,
        native_call_id: NativeCallId,
        _method: &DtmfMethod,
        digits: &str,
    ) -> Result<(), SipError> {
        use crate::ffi::bindings;
        use std::os::raw::c_long;

        unsafe {
            let digits_bytes = digits.as_bytes().to_vec();
            let dtmf_str = bindings::pj_str_t {
                ptr: digits_bytes.as_ptr() as *mut ::std::os::raw::c_char,
                slen: digits_bytes.len() as c_long,
            };
            let status = bindings::pjsua_call_dial_dtmf(
                native_call_id as bindings::pjsua_call_id,
                &dtmf_str as *const _,
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_call_dial_dtmf"));
            }
        }
        Ok(())
    }

    fn transfer_call(
        &mut self,
        native_call_id: NativeCallId,
        target: &str,
    ) -> Result<(), SipError> {
        use crate::ffi::bindings;
        use std::os::raw::c_long;

        unsafe {
            let target_bytes = target.as_bytes().to_vec();
            let dest_str = bindings::pj_str_t {
                ptr: target_bytes.as_ptr() as *mut ::std::os::raw::c_char,
                slen: target_bytes.len() as c_long,
            };
            let status = bindings::pjsua_call_xfer(
                native_call_id as bindings::pjsua_call_id,
                &dest_str as *const _,
                std::ptr::null(),
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_call_xfer"));
            }
        }
        Ok(())
    }
}

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
    #[cfg(not(feature = "pjsip"))]
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
