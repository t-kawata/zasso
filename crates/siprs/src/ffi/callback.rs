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
// [::STUB::] P4-2: Full callback implementations require:
// - Real PJSUA library linkage (pjsua.h types)
// - NativeEvent type integration from P0-5 event module
// - Reactor channel reference for enqueue
// The function signatures below define the ABI contract.

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
/// [::STUB::] P4-2: Implement NativeEvent::IncomingCall enqueue.
/// Parameters: acc_id (pjsua_acc_id), call_id (pjsua_call_id),
/// rdata metadata (caller URI, called URI, etc.)
#[no_mangle]
pub unsafe extern "C" fn on_incoming_call(
    _acc_id: bindings::pjsua_acc_id,
    _call_id: bindings::pjsua_call_id,
    _rdata: *mut bindings::pj_str_t,
) {
    // [::STUB::] P4-2: Enqueue NativeEvent::IncomingCall { acc_id, call_id }
    let _ = (_acc_id, _call_id, _rdata);
}

/// Callback for registration state changes.
///
/// Called by PJSUA when an account's registration status changes.
///
/// [::STUB::] P4-2: Implement NativeEvent::RegState enqueue.
/// Parameters: acc_id, is_registering, code, reason
#[no_mangle]
pub unsafe extern "C" fn on_reg_state(
    _acc_id: bindings::pjsua_acc_id,
    _is_registering: i32,
    _code: i32,
    _reason: *mut bindings::pj_str_t,
) {
    // [::STUB::] P4-2: Enqueue NativeEvent::RegState { acc_id, is_registering, code, reason }
    let _ = (_acc_id, _is_registering, _code, _reason);
}

/// Callback for call state changes.
///
/// Called by PJSUA whenever a call's state transitions
/// (null → calling → connecting → confirmed → disconnected).
///
/// [::STUB::] P4-2: Implement NativeEvent::CallState enqueue.
/// Parameters: call_id, state (pjsua_call_state constant)
#[no_mangle]
pub unsafe extern "C" fn on_call_state(
    _call_id: bindings::pjsua_call_id,
    _state: u32,
) {
    // [::STUB::] P4-2: Enqueue NativeEvent::CallState { call_id, state }
    let _ = (_call_id, _state);
}

/// Callback for call media state changes.
///
/// Called by PJSUA when a call's media state changes
/// (e.g., media is established or deactivated).
///
/// [::STUB::] P4-2: Implement NativeEvent::CallMediaState enqueue.
/// Parameters: call_id, media_state
#[no_mangle]
pub unsafe extern "C" fn on_call_media_state(
    _call_id: bindings::pjsua_call_id,
) {
    // [::STUB::] P4-2: Enqueue NativeEvent::CallMediaState { call_id }
    let _ = _call_id;
}

// [::STUB::] P4-2: Additional callbacks as needed:
// - on_reg_started: Registration attempt started
// - on_call_redirected: Call redirection
// - on_dtmf_digit: DTMF digit received
// - on_call_transfer_status: Call transfer status
