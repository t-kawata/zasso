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
//! `pjsip` feature 無効時もシングルトン基盤が未使用と判定される。
//! いずれも後続チケット（M17-4 以降）で実際の FFI 呼び出しが実装されるタイミングで必要になる。
//! M20-2 の get_account_info 追加により一部使用されたが、シングルトン基盤自体はまだ全結合されていない。
#![allow(dead_code)]

use std::sync::{Mutex, OnceLock};

#[cfg(feature = "pjsip")]
use secrecy::ExposeSecret;

use crate::config::AccountConfig;
use crate::config::ClientConfig;
use crate::config::Codec;
use crate::config::DtmfMethod;
use crate::config::OutgoingCallRequest;
use crate::config::TransportConfig;
use crate::error::SipError;
use crate::event::ClientCapabilities;
use crate::runtime::backend::NativeAccId;
use crate::runtime::backend::NativeCallId;
use crate::runtime::backend::NativeConfPortId;
use crate::runtime::backend::SipBackend;
use crate::runtime::command::AccountInfoSnapshot;

// ---------------------------------------------------------------------------
// コーデック優先度定数
// ---------------------------------------------------------------------------

/// PCMU/8000 の優先度（Opus 非対応環境向けフォールバック）。
pub(crate) const CODEC_PRIO_PCMU: u8 = 254;
/// Opus 系コーデックの最優先度。
pub(crate) const CODEC_PRIO_OPUS: u8 = 255;
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
    /// pj_thread_register() のスレッド記述子（リークして永続化）。
    /// PJSIP はこの記述子のポインタを内部で保持し続けるため、プロセス生存期間中有効。
    #[allow(dead_code)]
    thread_desc: Option<Box<[::std::os::raw::c_long; 64]>>,
}

impl PjsuaBackend {
    /// 新しい `PjsuaBackend` を生成する。
    pub fn new() -> Self {
        Self {
            initialized: false,
            thread_desc: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Global singleton
// ---------------------------------------------------------------------------

/// PjsuaBackend のグローバルシングルトン（プロセス単位で1インスタンス）。
static PJSIP_BACKEND: OnceLock<Mutex<PjsuaBackend>> = OnceLock::new();

/// グローバルシングルトンの PjsuaBackend インスタンスを取得する。
pub(crate) fn global() -> &'static Mutex<PjsuaBackend> {
    PJSIP_BACKEND.get_or_init(|| Mutex::new(PjsuaBackend::new()))
}

/// SipBackend trait 実装の薄いラッパー。
/// 全メソッド呼び出しをグローバルシングルトンの PjsuaBackend に委譲する。
pub(crate) struct PjsuaBackendRef;

#[cfg(feature = "pjsip")]
impl SipBackend for PjsuaBackendRef {
    fn initialize(&mut self, config: &ClientConfig) -> Result<ClientCapabilities, SipError> {
        global().lock().unwrap().initialize(config)
    }
    fn shutdown(&mut self) -> Result<(), SipError> {
        global().lock().unwrap().shutdown()
    }
    fn create_transport(&mut self, config: &TransportConfig) -> Result<(), SipError> {
        global().lock().unwrap().create_transport(config)
    }
    fn add_account(
        &mut self,
        config: &AccountConfig,
    ) -> Result<(NativeAccId, ClientCapabilities), SipError> {
        global().lock().unwrap().add_account(config)
    }
    fn remove_account(&mut self, native_acc_id: NativeAccId) -> Result<(), SipError> {
        global().lock().unwrap().remove_account(native_acc_id)
    }
    fn set_registration(
        &mut self,
        native_acc_id: NativeAccId,
        enabled: bool,
    ) -> Result<(), SipError> {
        global()
            .lock()
            .unwrap()
            .set_registration(native_acc_id, enabled)
    }
    fn make_call(
        &mut self,
        native_acc_id: NativeAccId,
        request: &OutgoingCallRequest,
    ) -> Result<NativeCallId, SipError> {
        global().lock().unwrap().make_call(native_acc_id, request)
    }
    fn answer_call(&mut self, native_call_id: NativeCallId, code: u16) -> Result<(), SipError> {
        global().lock().unwrap().answer_call(native_call_id, code)
    }
    fn hangup(&mut self, native_call_id: NativeCallId) -> Result<(), SipError> {
        global().lock().unwrap().hangup(native_call_id)
    }
    fn get_account_info(
        &self,
        native_acc_id: NativeAccId,
    ) -> Result<AccountInfoSnapshot, SipError> {
        global().lock().unwrap().get_account_info(native_acc_id)
    }
    fn conf_connect(
        &mut self,
        src: NativeConfPortId,
        dst: NativeConfPortId,
    ) -> Result<(), SipError> {
        global().lock().unwrap().conf_connect(src, dst)
    }
    fn conf_disconnect(
        &mut self,
        src: NativeConfPortId,
        dst: NativeConfPortId,
    ) -> Result<(), SipError> {
        global().lock().unwrap().conf_disconnect(src, dst)
    }
    fn configure_codecs(&mut self, preferred: &[Codec]) -> Result<(), SipError> {
        global().lock().unwrap().configure_codecs(preferred)
    }
    fn send_dtmf(
        &mut self,
        native_call_id: NativeCallId,
        method: &DtmfMethod,
        digits: &str,
    ) -> Result<(), SipError> {
        global()
            .lock()
            .unwrap()
            .send_dtmf(native_call_id, method, digits)
    }
    fn transfer_call(
        &mut self,
        native_call_id: NativeCallId,
        target: &str,
    ) -> Result<(), SipError> {
        global()
            .lock()
            .unwrap()
            .transfer_call(native_call_id, target)
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
            // SAFETY: pjsua_create は初期化されていない状態からのみ呼び出す。
            // self.initialized が false であることを直前に確認している。
            let mut status = bindings::pjsua_create();
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_create"));
            }

            // SAFETY: pj_thread_register は pjsua_create 成功後にのみ呼び出せる。
            // 渡す desc は Box でヒープ確保し、self.thread_desc に保持することで
            // PjsuaBackend 生存期間中の有効性を保証する。
            let mut desc: bindings::pj_thread_desc = std::mem::zeroed();
            let mut thread_ptr: *mut bindings::pj_thread_t = std::ptr::null_mut();
            let thread_name = std::ffi::CString::new("siprs-reactor")
                .expect("thread name must not contain null bytes");
            let reg_status = bindings::pj_thread_register(
                thread_name.as_ptr(),
                desc.as_mut_ptr(),
                &mut thread_ptr,
            );
            if reg_status != 0 {
                return Err(pj_status_to_sip_error(reg_status, "pj_thread_register"));
            }
            self.thread_desc = Some(Box::new(desc));

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

            // SAFETY: pjsip_cred_info のフィールドは C の pj_str_t と同じメモリレイアウト。
            // ptr が指す CString はこの unsafe ブロック内で生存し、pjsua_acc_add が
            // 内部で cred_info をコピーするまで有効である。
            //（PJSIP の仕様: pjsua_acc_add は acc_cfg の内容を内部で複製する）
            let cred_realm = std::ffi::CString::new("")
                .map_err(|_| SipError::invalid_config("credential realm contains null byte"))?;
            let cred_scheme = std::ffi::CString::new("Digest")
                .map_err(|_| SipError::invalid_config("credential scheme contains null byte"))?;
            let cred_username = std::ffi::CString::new(config.username.clone())
                .map_err(|_| SipError::invalid_config("credential username contains null byte"))?;
            let password_exposed = config.password.expose_secret();
            let cred_data = std::ffi::CString::new(password_exposed.as_bytes())
                .map_err(|_| SipError::invalid_config("credential password contains null byte"))?;

            // pjsua_acc_config.cred_info は [pjsip_cred_info; 8] のインライン配列。
            // 先頭要素に認証情報を設定し、cred_count で有効要素数を指定する。
            acc_cfg.cred_info[0].realm = bindings::pj_str_t {
                ptr: cred_realm.as_ptr() as *mut ::std::os::raw::c_char,
                slen: cred_realm.as_bytes().len() as c_long,
            };
            acc_cfg.cred_info[0].scheme = bindings::pj_str_t {
                ptr: cred_scheme.as_ptr() as *mut ::std::os::raw::c_char,
                slen: cred_scheme.as_bytes().len() as c_long,
            };
            acc_cfg.cred_info[0].username = bindings::pj_str_t {
                ptr: cred_username.as_ptr() as *mut ::std::os::raw::c_char,
                slen: cred_username.as_bytes().len() as c_long,
            };
            // PJSIP_CRED_DATA_PLAIN_PASSWD = 0（平文パスワード）
            acc_cfg.cred_info[0].data_type = 0;
            acc_cfg.cred_info[0].data = bindings::pj_str_t {
                ptr: cred_data.as_ptr() as *mut ::std::os::raw::c_char,
                slen: cred_data.as_bytes().len() as c_long,
            };
            // algorithm_type は NOT_SET（0）に設定し、サーバのチャレンジから自動選択させる
            acc_cfg.cred_info[0].algorithm_type = bindings::PJSIP_AUTH_ALGORITHM_NOT_SET;
            acc_cfg.cred_count = 1;

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

    fn get_account_info(
        &self,
        native_acc_id: NativeAccId,
    ) -> Result<AccountInfoSnapshot, SipError> {
        use crate::ffi::bindings;
        use crate::util::id::AccountId;

        unsafe {
            let mut acc_info: bindings::pjsua_acc_info = std::mem::zeroed();
            let status = bindings::pjsua_acc_get_info(
                native_acc_id as bindings::pjsua_acc_id,
                &mut acc_info as *mut _,
            );
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_acc_get_info"));
            }

            // pjsua_acc_info から URI 文字列を抽出
            let uri_bytes = std::slice::from_raw_parts(
                acc_info.acc_uri.ptr as *const u8,
                acc_info.acc_uri.slen as usize,
            );
            let uri = String::from_utf8_lossy(uri_bytes).into_owned();

            Ok(AccountInfoSnapshot {
                acc_id: AccountId::from(native_acc_id as u64),
                registration_status: acc_info.status as u16,
                registration_expires: if acc_info.expires >= 0 {
                    Some(acc_info.expires as u32)
                } else {
                    None
                },
                online_status: acc_info.online_status != 0,
                uri,
            })
        }
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

    fn configure_codecs(&mut self, preferred: &[Codec]) -> Result<(), SipError> {
        if preferred.is_empty() {
            // Auto モード: Opus=255, PCMU=254, その他=0
            self.set_opus_priority()?;
            self.set_pcmu_priority()?;
            self.disable_other_codecs()?;
        } else {
            // 明示指定モード: 指定順に優先度設定、指定外は無効化
            self.apply_preferred_codecs(preferred)?;
        }
        Ok(())
    }

    /// PCMU/8000/1 をフォールバック優先度（CODEC_PRIO_PCMU = 254）に設定する。
    fn set_pcmu_priority(&self) -> Result<(), SipError> {
        use crate::ffi::bindings;
        // SAFETY: pj_str_t は静的なバイト列で初期化され、この呼び出し中のみ有効。
        // pjsua_codec_set_priority は内部で文字列をコピーする。
        unsafe {
            let codec_id: bindings::pj_str_t = bindings::pj_str_t {
                ptr: b"PCMU/8000/1\0" as *const u8 as *mut ::std::os::raw::c_char,
                slen: 10,
            };
            let status = bindings::pjsua_codec_set_priority(&codec_id as *const _, CODEC_PRIO_PCMU);
            if status != 0 {
                return Err(pj_status_to_sip_error(
                    status,
                    "pjsua_codec_set_priority PCMU",
                ));
            }
        }
        Ok(())
    }

    /// Opus/48000/2 を最優先度（CODEC_PRIO_OPUS = 255）に設定する。
    ///
    /// Opus がシステムにインストールされていない場合の失敗は無視する。
    fn set_opus_priority(&self) -> Result<(), SipError> {
        use crate::ffi::bindings;
        // SAFETY: PCMU と同様に静的文字列で初期化し、API 内でコピーされる。
        unsafe {
            let codec_id: bindings::pj_str_t = bindings::pj_str_t {
                ptr: b"opus/48000/2\0" as *const u8 as *mut ::std::os::raw::c_char,
                slen: 12,
            };
            let status = bindings::pjsua_codec_set_priority(&codec_id as *const _, CODEC_PRIO_OPUS);
            if status != 0 {
                tracing::debug!("Opus codec not available (status={status}), skipping");
            }
        }
        Ok(())
    }

    /// PCMU/Opus 以外の全コーデックを無効化する（priority = 0）。
    fn disable_other_codecs(&self) -> Result<(), SipError> {
        use crate::ffi::bindings;
        // SAFETY: pjsua_enum_codecs は事前に確保したバッファに結果を書き込む。
        // count は呼び出し後に実際に書き込まれた要素数で上書きされる。
        unsafe {
            let mut count: ::std::os::raw::c_uint = 128;
            let mut codecs: Vec<bindings::pjsua_codec_info> =
                vec![std::mem::zeroed(); count as usize];
            let status = bindings::pjsua_enum_codecs(codecs.as_mut_ptr(), &mut count as *mut _);
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_enum_codecs"));
            }
            for codec in codecs.iter().take(count as usize) {
                let codec_id_str = Self::codec_id_to_str(&codec.codec_id);
                if codec_id_str != "PCMU/8000/1" && !codec_id_str.starts_with("opus/") {
                    let _ = bindings::pjsua_codec_set_priority(
                        &codec.codec_id as *const _,
                        CODEC_PRIO_DISABLED,
                    );
                }
            }
        }
        Ok(())
    }

    /// 明示指定モード: `preferred` の順序に従い、指定されたコーデックを有効化し、
    /// それ以外を無効化する。
    fn apply_preferred_codecs(&self, preferred: &[Codec]) -> Result<(), SipError> {
        use crate::ffi::bindings;
        // 先に全コーデックを無効化する
        // SAFETY: pjsua_enum_codecs バッファの事前確保。呼び出し後に count が更新される。
        unsafe {
            let mut count: ::std::os::raw::c_uint = 128;
            let mut codecs: Vec<bindings::pjsua_codec_info> =
                vec![std::mem::zeroed(); count as usize];
            let status = bindings::pjsua_enum_codecs(codecs.as_mut_ptr(), &mut count as *mut _);
            if status != 0 {
                return Err(pj_status_to_sip_error(status, "pjsua_enum_codecs"));
            }
            for codec in codecs.iter().take(count as usize) {
                let _ = bindings::pjsua_codec_set_priority(
                    &codec.codec_id as *const _,
                    CODEC_PRIO_DISABLED,
                );
            }
        }

        // 指定順に優先度を設定（先頭 = 最高 priority 255, 以降 1 ずつ減少）
        for (i, codec) in preferred.iter().enumerate() {
            let priority = (255u8).saturating_sub(i as u8);
            let codec_id_bytes = match codec {
                Codec::Pcmu => b"PCMU/8000/1\0" as &[u8],
                Codec::Opus => b"opus/48000/2\0" as &[u8],
            };
            // SAFETY: 静的文字列を pj_str_t に変換し pjsua_codec_set_priority を呼ぶ。
            // API 内で文字列はコピーされる。
            unsafe {
                let pj_codec_id: bindings::pj_str_t = bindings::pj_str_t {
                    ptr: codec_id_bytes.as_ptr() as *const u8 as *mut ::std::os::raw::c_char,
                    slen: codec_id_bytes.len() as ::std::os::raw::c_long - 1, // null 終端除く
                };
                let status = bindings::pjsua_codec_set_priority(&pj_codec_id as *const _, priority);
                if status != 0 {
                    let codec_name = match codec {
                        Codec::Pcmu => "PCMU",
                        Codec::Opus => "Opus",
                    };
                    tracing::debug!("{codec_name} codec not available (status={status}), skipping");
                }
            }
        }
        Ok(())
    }

    /// `pj_str_t` のバイト列を `&str` として解釈する。
    ///
    /// PJSIP が返す codec_id は有効な UTF-8 として扱う（`pj_str_t` は C の文字列）。
    /// 不正な UTF-8 の場合は代替文字列を返す。
    // SAFETY: pj_str_t.ptr は有効なメモリ領域を指し、slen はその長さを表す。
    fn codec_id_to_str(codec_id: &bindings::pj_str_t) -> &str {
        unsafe {
            let bytes =
                std::slice::from_raw_parts(codec_id.ptr as *const u8, codec_id.slen as usize);
            std::str::from_utf8_unchecked(bytes)
        }
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

    fn get_account_info(
        &self,
        _native_acc_id: NativeAccId,
    ) -> Result<AccountInfoSnapshot, SipError> {
        unimplemented!("PjsuaBackend::get_account_info requires PJSIP headers (enable 'pjsip' feature, see M19-1)")
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

    fn configure_codecs(&mut self, _preferred: &[Codec]) -> Result<(), SipError> {
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
    ///
    /// RFC02 §6.4 に従い Opus=255（最優先）、PCMU=254（フォールバック）。
    #[test]
    fn test_codec_priority_constants() {
        assert_eq!(CODEC_PRIO_OPUS, 255, "Opus は最高優先度 (255) — RFC02 §6.4");
        assert_eq!(
            CODEC_PRIO_PCMU, 254,
            "PCMU は Opus 非対応環境用フォールバック (254) — RFC02 §6.4"
        );
        assert_eq!(CODEC_PRIO_DISABLED, 0, "無効化コーデックは priority 0");
    }
}
