// [::TICKET::] P11-10: Safe PJSUA backend-call wrappers.
// [::TICKET::] P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-10 --for-spec --no-implementation-order`.
//
// All `unsafe` FFI invocations for the PjsuaBackend live here (C038 — no
// `unsafe` outside `src/ffi/`). Each wrapper performs one PJSUA operation and
// yields the raw `pj_status_t` (plus any out-values) so the caller maps the
// status via `crate::runtime::backend::map_pjsua_status`.
//
// Under `pjsua-native` the wrappers invoke the bindgen symbols. The
// `resolve_conf_port` wrapper is intentionally NOT feature-gated: it uses
// `pjsua_call_get_info`, which exists as a deterministic stub in the default
// build and as the real symbol under `pjsua-native`.

use crate::ffi::bindings;
#[cfg(feature = "pjsua-native")]
use crate::api::dtmf_unification::{send_api_for, DtmfSendApi};
#[cfg(feature = "pjsua-native")]
use crate::ffi::pj_str::PjOwnedStr;
#[cfg(feature = "pjsua-native")]
use crate::model::dtmf_spec::DtmfMethod;
#[cfg(feature = "pjsua-native")]
use std::net::SocketAddr;

/// Initialize the PJSUA stack: `pjsua_create` → `pjsua_init` → `pjsua_start`.
///
/// Reads as prose: create the stack, install the pre-allocated NativeEvent queue
/// and register every PJSIP callback into `pjsua_config.cb`, reflect the
/// `ClientConfig` STUN/TURN settings into the same config and the ICE settings
/// into a real `pjsua_media_config`, initialize with both, then start. Returns
/// the first non-success status, or `PJ_SUCCESS`.
#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
pub fn initialize(config: &crate::config::ClientConfig) -> i32 {
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    let create = unsafe { bindings::pjsua_create() };
    if create != bindings::PJ_SUCCESS {
        return create;
    }
    let queue = crossbeam_queue::ArrayQueue::new(crate::ffi::callback::NATIVE_EVENT_QUEUE_CAPACITY);
    let mut pjsua_cfg: bindings::pjsua_config = unsafe { std::mem::zeroed() };
    crate::ffi::callback::register_callbacks(&mut pjsua_cfg, queue);
    // Reflect STUN/TURN into the config; the owned strings back the `pj_str_t`
    // pointers and must stay alive through `pjsua_init` below (§62.17 / P16-8).
    let owned = match crate::config::stun_turn_ice_wiring::apply_stun_turn(&mut pjsua_cfg, config) {
        Ok(owned) => owned,
        // A config-level wiring error (e.g. >8 STUN servers) is an invalid
        // operation; the caller maps it to a NativeError via map_pjsua_status.
        Err(_) => return bindings::PJ_EINVALIDOP,
    };
    let mut media_cfg: bindings::pjsua_media_config = unsafe { std::mem::zeroed() };
    crate::config::stun_turn_ice_wiring::apply_ice(&mut media_cfg, &config.ice);
    // SAFETY: pjsua_cfg is a valid, initialized pjsua_config carrying the
    // callback registry and STUN/TURN fields whose strings are backed by
    // `owned` (alive for this call); media_cfg is a valid, initialized
    // pjsua_media_config carrying the ICE settings; null log config selects the
    // PJSIP default.
    let init = unsafe {
        bindings::pjsua_init(&mut pjsua_cfg, std::ptr::null_mut(), &mut media_cfg)
    };
    if init != bindings::PJ_SUCCESS {
        return init;
    }
    unsafe { bindings::pjsua_start() }
}

/// Tear down the PJSUA stack via `pjsua_destroy`.
#[cfg(feature = "pjsua-native")]
pub fn shutdown() -> i32 {
    // SAFETY: pjsua_destroy takes no arguments and tears down the stack.
    unsafe { bindings::pjsua_destroy() }
}

/// Create a SIP transport of `kind` bound to `bind_addr`.
///
/// Builds a real `pjsua_transport_config` (port + bound_addr) instead of passing
/// a null config, so `ClientConfig.transports` reaches PJSIP (§62.11 / N0080).
/// Returns `(status, transport_id)`.
#[cfg(feature = "pjsua-native")]
pub fn transport_create(kind: i32, bind_addr: SocketAddr) -> (i32, i32) {
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    let mut cfg: bindings::pjsua_transport_config = unsafe { std::mem::zeroed() };
    crate::ffi::transport_wiring::apply_transport_port(&mut cfg, bind_addr.port());
    let bound_addr = crate::ffi::transport_wiring::resolve_bound_addr_string(bind_addr);
    let bound_owned = PjOwnedStr::new(&bound_addr);
    cfg.bound_addr = bound_owned.as_raw();
    let mut transport_id: bindings::pjsua_transport_id = 0;
    // SAFETY: cfg is a valid, initialized pjsua_transport_config carrying the
    // resolved port and a live bound_addr string (bound_owned lives for this
    // call); transport_id is a valid out-pointer written by the call.
    let status = unsafe {
        bindings::pjsua_transport_create(
            kind as bindings::pjsip_transport_type_e,
            &mut cfg,
            &mut transport_id,
        )
    };
    (status, transport_id)
}

/// Close a SIP transport via `pjsua_transport_close`.
///
/// `force = 0` lets PJSIP drain the transport gracefully; the caller (the
/// shutdown sequence §32 step 5) has already unregistered accounts and hung up
/// calls so the transport is idle.
#[cfg(feature = "pjsua-native")]
pub fn close_transport(transport_id: i32) -> i32 {
// [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    // SAFETY: transport_id is a valid pjsua_transport_id; force = 0 (pj_bool_t)
    // requests a graceful close.
    unsafe { bindings::pjsua_transport_close(transport_id, 0) }
}

/// Register a SIP account from the domain `AccountConfig`.
///
/// Returns `(status, native_acc_id)`.
#[cfg(feature = "pjsua-native")]
pub fn add_account(config: &crate::config::account_config_spec::AccountConfig) -> (i32, i32) {
    let mut native_acc_id: bindings::pjsua_acc_id = 0;
    // Build a pjsua_acc_config from the domain AccountConfig: the account URI is
    // sip:{username}@{domain}, the registrar defaults to sip:{domain} unless
    // overridden, and one digest credential carries the password. The struct is
    // zeroed first so unset optional fields stay at their PJSIP defaults.
    let acc_uri = format!("sip:{}@{}", config.username, config.domain);
    let registrar_uri = config
        .registrar_uri
        .clone()
        .unwrap_or_else(|| format!("sip:{}", config.domain));
    let auth_user = config
        .auth_username
        .clone()
        .unwrap_or_else(|| config.username.clone());
    let acc_uri_owned = PjOwnedStr::new(&acc_uri);
    let registrar_owned = PjOwnedStr::new(&registrar_uri);
    let user_owned = PjOwnedStr::new(&auth_user);
    let realm_owned = PjOwnedStr::new(&config.domain);
    let pass_owned = PjOwnedStr::new(config.password.expose_secret());
    let mut cfg: bindings::pjsua_acc_config = unsafe { std::mem::zeroed() };
    cfg.id = acc_uri_owned.as_raw();
    cfg.registrar_uri = registrar_owned.as_raw();
    cfg.cred_count = 1;
    cfg.cred_info[0].username = user_owned.as_raw();
    cfg.cred_info[0].realm = realm_owned.as_raw();
    cfg.cred_info[0].data_type = bindings::PJ_CRED_DATA_PLAIN_PASSWD as _;
    cfg.cred_info[0].data = pass_owned.as_raw();
    // SAFETY: cfg is a valid, initialized pjsua_acc_config; native_acc_id is a
    // valid out-pointer written by the call.
    let status = unsafe { bindings::pjsua_acc_add(&cfg, 0, &mut native_acc_id) };
    (status, native_acc_id)
}

/// Remove a registered account via `pjsua_acc_del`.
#[cfg(feature = "pjsua-native")]
pub fn remove_account(native_acc_id: i32) -> i32 {
    // SAFETY: native_acc_id is a valid pjsua_acc_id.
    unsafe { bindings::pjsua_acc_del(native_acc_id) }
}

/// Enable or disable registration via `pjsua_acc_set_registration`.
#[cfg(feature = "pjsua-native")]
pub fn set_registration(native_acc_id: i32, enabled: bool) -> i32 {
    // SAFETY: native_acc_id is a valid pjsua_acc_id; pj_bool_t is an int.
    unsafe { bindings::pjsua_acc_set_registration(native_acc_id, enabled as bindings::pj_bool_t) }
}

/// Apply a rebuilt `pjsua_acc_config` to an existing account via `pjsua_acc_modify`.
#[cfg(feature = "pjsua-native")]
pub fn update_account(
    native_acc_id: i32,
    config: &crate::config::account_config_spec::AccountConfig,
) -> i32 {
    let acc_uri = format!("sip:{}@{}", config.username, config.domain);
    let registrar_uri = config
        .registrar_uri
        .clone()
        .unwrap_or_else(|| format!("sip:{}", config.domain));
    let auth_user = config
        .auth_username
        .clone()
        .unwrap_or_else(|| config.username.clone());
    let acc_uri_owned = PjOwnedStr::new(&acc_uri);
    let registrar_owned = PjOwnedStr::new(&registrar_uri);
    let user_owned = PjOwnedStr::new(&auth_user);
    let realm_owned = PjOwnedStr::new(&config.domain);
    let pass_owned = PjOwnedStr::new(config.password.expose_secret());
    let mut cfg: bindings::pjsua_acc_config = unsafe { std::mem::zeroed() };
    cfg.id = acc_uri_owned.as_raw();
    cfg.registrar_uri = registrar_owned.as_raw();
    cfg.cred_count = 1;
    cfg.cred_info[0].username = user_owned.as_raw();
    cfg.cred_info[0].realm = realm_owned.as_raw();
    cfg.cred_info[0].data_type = bindings::PJ_CRED_DATA_PLAIN_PASSWD as _;
    cfg.cred_info[0].data = pass_owned.as_raw();
    // SAFETY: cfg is a valid, initialized pjsua_acc_config.
    unsafe { bindings::pjsua_acc_modify(native_acc_id, &cfg) }
}

/// Place an outgoing call via `pjsua_call_make_call`.
///
/// Returns `(status, native_call_id)`.
#[cfg(feature = "pjsua-native")]
pub fn make_call(native_acc_id: i32, target_uri: &str) -> (i32, i32) {
    let target_owned = PjOwnedStr::new(target_uri);
    let raw_uri = target_owned.as_raw();
    let mut call_id: bindings::pjsua_call_id = 0;
    // SAFETY: raw_uri points to target_owned's live buffer; opt/user_data/dlg are
    // null (PJSIP defaults); call_id is a valid out-pointer.
    let status = unsafe {
        bindings::pjsua_call_make_call(
            native_acc_id,
            &raw_uri,
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null(),
            &mut call_id,
        )
    };
    (status, call_id)
}

/// Answer an incoming call via `pjsua_call_answer`.
#[cfg(feature = "pjsua-native")]
pub fn answer_call(native_call_id: i32, code: u16) -> i32 {
    // SAFETY: call id and code are valid; type/msg_data are null (defaults).
    unsafe {
        bindings::pjsua_call_answer(
            native_call_id,
            code as u32,
            std::ptr::null(),
            std::ptr::null(),
        )
    }
}

/// Hang up a call via `pjsua_call_hangup`.
#[cfg(feature = "pjsua-native")]
pub fn hangup_call(native_call_id: i32) -> i32 {
    // SAFETY: call id is valid; reason/msg_data are null (no body).
    unsafe { bindings::pjsua_call_hangup(native_call_id, 0, std::ptr::null(), std::ptr::null()) }
}

/// Send DTMF digits, dispatching on the method (§62.15 Q5).
///
/// `Info` / `Rfc4733` go through `pjsua_call_send_dtmf` with the correct
/// `pjsua_call_send_dtmf_param`; `Inband` goes through `pjsua_call_dial_dtmf`.
/// The dispatch decision lives in `send_api_for` so the mapping is unit-tested
/// without `pjsua-native`.
#[cfg(feature = "pjsua-native")]
pub fn send_dtmf(native_call_id: i32, method: DtmfMethod, digits: &str) -> i32 {
    match send_api_for(method) {
        DtmfSendApi::DialDtmf => dial_dtmf(native_call_id, digits),
        DtmfSendApi::SendDtmf => send_dtmf_with_param(native_call_id, method, digits),
    }
}

/// Send DTMF as an RFC 2833 payload via `pjsua_call_dial_dtmf`.
#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
fn dial_dtmf(native_call_id: i32, digits: &str) -> i32 {
    let digits_owned = PjOwnedStr::new(digits);
    let raw = digits_owned.as_raw();
    // SAFETY: raw points to digits_owned's live buffer for the call.
    unsafe { bindings::pjsua_call_dial_dtmf(native_call_id, &raw) }
}

/// Send DTMF via `pjsua_call_send_dtmf` with the method selected in `param`.
#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
fn send_dtmf_with_param(native_call_id: i32, method: DtmfMethod, digits: &str) -> i32 {
    let digits_owned = PjOwnedStr::new(digits);
    let param = bindings::pjsua_call_send_dtmf_param {
        method: native_dtmf_method(method),
        duration: DTMF_DURATION_DEFAULT_MS,
        digits: digits_owned.as_raw(),
    };
    // SAFETY: param.digits references digits_owned's live buffer for the call.
    unsafe { bindings::pjsua_call_send_dtmf(native_call_id, &param) }
}

/// Map a unified `DtmfMethod` to the PJSIP `pjsua_dtmf_method` enum.
///
/// Only `Info` and `Rfc4733` reach here — `send_api_for` routes `Inband` to
/// `dial_dtmf`, so the `Inband` arm is unreachable by construction.
#[cfg(feature = "pjsua-native")]
// [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
fn native_dtmf_method(method: DtmfMethod) -> bindings::pjsua_dtmf_method {
    match method {
        DtmfMethod::Info => bindings::pjsua_dtmf_method_PJSUA_DTMF_METHOD_SIP_INFO,
        DtmfMethod::Rfc4733 => bindings::pjsua_dtmf_method_PJSUA_DTMF_METHOD_RFC2833,
        DtmfMethod::Inband => unreachable!("send_api_for routes Inband to pjsua_call_dial_dtmf"),
    }
}

/// `PJSUA_CALL_SEND_DTMF_DURATION_DEFAULT` — not emitted by bindgen.
#[cfg(feature = "pjsua-native")]
const DTMF_DURATION_DEFAULT_MS: u32 = 160;

/// Transfer a call via `pjsua_call_xfer`.
#[cfg(feature = "pjsua-native")]
pub fn transfer_call(native_call_id: i32, target: &str) -> i32 {
    let target_owned = PjOwnedStr::new(target);
    let raw = target_owned.as_raw();
    // SAFETY: raw points to target_owned's live buffer; msg_data is null.
    unsafe { bindings::pjsua_call_xfer(native_call_id, &raw, std::ptr::null()) }
}

/// Put a call on hold via `pjsua_call_set_hold`.
#[cfg(feature = "pjsua-native")]
pub fn hold_call(native_call_id: i32) -> i32 {
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    // SAFETY: native_call_id is a valid pjsua_call_id; null msg_data selects
    // PJSIP defaults for the re-INVITE that puts the call on hold.
    unsafe { bindings::pjsua_call_set_hold(native_call_id, std::ptr::null()) }
}

/// Resume a held call via `pjsua_call_reinvite` with default options.
///
/// The vendored `pjsua.h` has no `pjsua_call_set_inactive`; a re-INVITE with
/// options = 0 and null msg_data resumes the media direction on the call.
#[cfg(feature = "pjsua-native")]
pub fn unhold_call(native_call_id: i32) -> i32 {
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    // SAFETY: native_call_id is a valid pjsua_call_id; options=0 + null msg_data
    // send a default re-INVITE that resumes the call media.
    unsafe { bindings::pjsua_call_reinvite(native_call_id, 0, std::ptr::null()) }
}

/// Apply the auto-mode codec policy (Opus=255, PCMU=254, others=0).
///
/// Returns the first non-success status, or `PJ_SUCCESS`.
#[cfg(feature = "pjsua-native")]
pub fn configure_codecs() -> i32 {
    let codecs = bindings::enumerate_codecs();
    let codec_infos: Vec<crate::config::m20_codec_auto_mode::CodecInfo> = codecs
        .iter()
        .map(|c| {
            crate::config::m20_codec_auto_mode::CodecInfo::new(bindings::pj_str_to_string(
                &c.codec_id,
            ))
        })
        .collect();
    let priorities =
        match crate::config::m20_codec_auto_mode::CodecAutoMode::apply(&codec_infos, &[]) {
            Ok(priorities) => priorities,
            // A duplicate codec_id in the enumeration is an internal inconsistency;
            // surface it as an invalid-operation status so the caller sees an error.
            Err(_) => return bindings::PJ_EINVALIDOP,
        };
    for (codec_id, priority) in &priorities {
        let codec_id_owned = PjOwnedStr::new(codec_id.as_str());
        let raw = codec_id_owned.as_raw();
        // SAFETY: raw points to codec_id_owned's live buffer; the priority maps to
        // PJSIP's int codec priority.
        let status = unsafe { bindings::pjsua_codec_set_priority(&raw, *priority as i32) };
        if status != bindings::PJ_SUCCESS {
            return status;
        }
    }
    bindings::PJ_SUCCESS
}

/// Resolve the conference port slot for a call via `pjsua_call_get_info`.
///
/// Available in both modes: the real bindgen symbol under `pjsua-native`, the
/// deterministic stub otherwise. Returns `(status, conf_slot)`.
pub fn resolve_conf_port(native_call_id: i32) -> (i32, i32) {
    let mut info: bindings::pjsua_call_info = unsafe { std::mem::zeroed() };
    // SAFETY: info is a valid, aligned, initialized pjsua_call_info written by
    // the FFI in place.
    let status = unsafe { bindings::pjsua_call_get_info(native_call_id, &mut info) };
    (status, info.conf_slot)
}

/// Read account registration info via `pjsua_acc_get_info`.
///
/// Returns `(status, reg_last_err, online_status, acc_uri)`.
#[cfg(feature = "pjsua-native")]
pub fn get_account_info(native_acc_id: u32) -> (i32, u32, bool, String) {
    let mut info: bindings::pjsua_acc_info = unsafe { std::mem::zeroed() };
    // SAFETY: info is a valid, aligned, initialized pjsua_acc_info written by the
    // FFI in place.
    let status =
        unsafe { bindings::pjsua_acc_get_info(native_acc_id as bindings::pjsua_acc_id, &mut info) };
    (
        status,
        info.reg_last_err as u32,
        info.online_status != 0,
        bindings::pj_str_to_string(&info.acc_uri),
    )
}

/// Connect a call's media to the conference bridge via `pjsua_conf_connect`.
#[cfg(feature = "pjsua-native")]
pub fn conf_connect(source: i32, sink: i32) -> i32 {
    // SAFETY: source and sink are valid pjsua_conf_port_id values.
    unsafe { bindings::pjsua_conf_connect(source, sink) }
}

/// Disconnect a call's media from the conference bridge via `pjsua_conf_disconnect`.
#[cfg(feature = "pjsua-native")]
pub fn conf_disconnect(source: i32, sink: i32) -> i32 {
    // SAFETY: source and sink are valid pjsua_conf_port_id values.
    unsafe { bindings::pjsua_conf_disconnect(source, sink) }
}
