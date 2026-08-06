// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.

// [::TICKET::] P3-2: FFI module — PJSIP unsafe binding isolation.
// All unsafe code in this crate lives exclusively in this module
// and its submodules. The rest of the crate (runtime/, client.rs, etc.)
// must use only safe abstractions from ffi::pj_str, ffi::bindings.

/// Bindgen-generated re-exports: pjsua_*, pj_*, PJSUA_*, PJ_*.
///
/// When the `pjsua-native` feature is not enabled, this module provides
/// stub type aliases (e.g. `pjsua_acc_id = i32`) that allow the rest
/// of the crate to compile without a system PJSIP installation.
pub mod bindings;

/// Safe wrapper for `pj_str_t` with Rust-owned `Vec<u8>` backing.
///
/// Ensures that C strings passed to PJSUA are valid for the duration
/// of the FFI call and freed when the `PjOwnedStr` is dropped.
pub mod pj_str;

/// Extern "C" callback bridge — PJSIP events → NativeEvent enqueue.
///
/// Each extern C function is minimal (no locks, no allocation, no .await):
/// it copies the event parameters into a `NativeEvent` and pushes it
/// onto the reactor's event queue.
///
// [::STUB::] P11-11: PJSIP is not yet linked; callbacks are no-ops and NativeEvent enqueue is deferred -- Register all PJSIP callbacks via pjsua_config.cb and enqueue NativeEvents (IncomingCall, RegState, CallState, CallMediaState, plus reg_started/call_redirected/dtmf_digit/call_transfer_status) through the reactor channel once PJSIP is linked
pub mod callback;
