// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.

// [::TICKET::] P3-2: External C callback bridge — PJSIP → Rust event channel.
//
// # Design constraints
// These callbacks are invoked from PJSIP's real-time threads. They MUST:
// 1. Never acquire locks (mutex, RwLock, etc.)
// 2. Never allocate memory (no Vec::push, Box::new, etc.)
// 3. Never await or drive futures
// 4. Never call back into PJSUA
//
// The only permitted operation is copying event parameters into a
// pre-allocated NativeEvent and enqueuing it on a lock-free queue
// or MPSC channel.
//
// [::STUB::] P4-2: PJSIP is not yet linked; callbacks are no-ops and NativeEvent enqueue is deferred (covers callback.rs:16,30,51,74,91,97) -- Register all PJSIP callbacks via pjsua_config.cb and enqueue NativeEvents (IncomingCall, RegState, CallState, CallMediaState, plus reg_started/call_redirected/dtmf_digit/call_transfer_status) through the reactor channel once PJSIP is linked

use crate::ffi::bindings;

/// Callback for incoming calls.
///
/// Called by PJSUA when a new incoming call arrives.
/// The callback must not block; it enqueues the call event
/// for processing on the reactor thread.
///
/// # Safety
/// `rdata` is valid only within this callback's scope. Data
/// referenced by `rdata` is copied to Rust-owned types immediately.
///
#[no_mangle]
pub unsafe extern "C" fn on_incoming_call(
    _acc_id: bindings::pjsua_acc_id,
    _call_id: bindings::pjsua_call_id,
    _rdata: *mut bindings::pj_str_t,
) {
    let _ = (_acc_id, _call_id, _rdata);
}

/// Callback for registration state changes.
///
/// Called by PJSUA when an account's registration status changes.
///
/// # Safety
///
/// `_reason` must be a valid pointer to a `pj_str_t` for the duration of
/// this call, or null if no reason string is available. The callback runs
/// on PJSUA's real-time thread and must not block, allocate, or call into
/// PJSUA.
///
#[no_mangle]
pub unsafe extern "C" fn on_reg_state(
    _acc_id: bindings::pjsua_acc_id,
    _is_registering: i32,
    _code: i32,
    _reason: *mut bindings::pj_str_t,
) {
    let _ = (_acc_id, _is_registering, _code, _reason);
}

/// Callback for call state changes.
///
/// Called by PJSUA whenever a call's state transitions
/// (null → calling → connecting → confirmed → disconnected).
///
/// # Safety
///
/// This callback runs on PJSUA's real-time thread and must not block,
/// allocate, or call back into PJSUA. The `call_id` parameter is valid
/// only for the duration of this callback and must be copied to Rust-owned
/// storage if needed later.
///
#[no_mangle]
pub unsafe extern "C" fn on_call_state(_call_id: bindings::pjsua_call_id, _state: u32) {
    let _ = (_call_id, _state);
}

/// Callback for call media state changes.
///
/// Called by PJSUA when a call's media state changes
/// (e.g., media is established or deactivated).
///
/// # Safety
///
/// This callback runs on PJSUA's real-time thread and must not block,
/// allocate, or call back into PJSUA. The `call_id` parameter is valid
/// only for the duration of this callback.
///
#[no_mangle]
pub unsafe extern "C" fn on_call_media_state(_call_id: bindings::pjsua_call_id) {
    let _ = _call_id;
}

