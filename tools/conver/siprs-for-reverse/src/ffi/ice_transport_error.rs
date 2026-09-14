
use crate::ffi::bindings;
use crate::ffi::callback::enqueue_native_event;
use crate::state::m20_native_event_conv::NativeEvent;

/// ICE-operation argument type for `on_ice_transport_error`.
///
/// Under `pjsua-native`, bindgen generates `pj_ice_strans_op` as a Rust enum
/// (`BINDGEN_ENUM_TYPES`, §62.33); in the stub build the same name is a module
/// of `u32` constants, so the callback parameter is the scalar `u32` there. The
/// alias keeps the extern "C" signature ABI-compatible in both modes (P19-2 /
/// N0108).
#[cfg(feature = "pjsua-native")]
type IceStransOpParam = bindings::pj_ice_strans_op;
#[cfg(not(feature = "pjsua-native"))]
type IceStransOpParam = u32;

/// Callback for ICE media transport errors (P19-2 §62.39 / N0108).
///
/// PJSIP reports errors in the ICE media transport — currently TURN Refresh
/// failures. The callback runs on a real-time thread: it copies the error
/// parameters into a scalar-only `NativeEvent::IceTransportError` and enqueues
/// it without locking, allocating, or awaiting.
///
/// # Safety
/// Must only be invoked from a PJSIP callback context. `param` is never
/// dereferenced (PJSIP documents it as always NULL).
#[no_mangle]
pub unsafe extern "C" fn on_ice_transport_error(
    index: std::os::raw::c_int,
    op: IceStransOpParam,
    status: bindings::pj_status_t,
    _param: *mut std::ffi::c_void,
) {
    enqueue_native_event(NativeEvent::IceTransportError {
        index,
        operation: op as u32,
        status,
    });
}
