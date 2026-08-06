// [::TICKET::] P3-2: PJSUA FFI binding type aliases.
//
// When `pjsua-native` feature is enabled, this module is replaced by
// the bindgen-generated code from build.rs (see build.rs for configuration).
// When the feature is not enabled, these stub type aliases allow the crate
// to compile without a system PJSIP installation.
//
// Exactly one body is active per the feature flag (C058): `include!` pulls the
// bindgen output when the feature is on, the `stub_aliases` submodule when it
// is off — both are never compiled together.
// [::TICKET::] P3-2, P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5) --for-spec --no-implementation-order`.

// Allow the PJSIP C API naming conventions in both bodies:
// - `non_camel_case_types` — C typedefs/structs (`pj_str_t`, `pjsua_call_id`)
// - `non_upper_case_globals` — bindgen emits C enum values namespaced by the
//   enum type (e.g. `pjsua_call_media_status_PJSUA_CALL_MEDIA_ACTIVE`)
// - `non_snake_case` — bindgen's generated layout-test fn names
//   (`bindgen_test_layout_pjsua_call_info__bindgen_ty_1`)
// These names are dictated by the vendored headers, not by this crate.
#![allow(non_camel_case_types, non_upper_case_globals, non_snake_case)]

#[cfg(feature = "pjsua-native")]
include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

#[cfg(not(feature = "pjsua-native"))]
mod stub_aliases {
    // ---------------------------------------------------------------------------
    // Type aliases matching PJSIP ABI
    // ---------------------------------------------------------------------------

    /// Opaque account identifier — maps to `pjsua_acc_id` (int).
    pub type pjsua_acc_id = i32;

    /// Opaque call identifier — maps to `pjsua_call_id` (int).
    pub type pjsua_call_id = i32;

    /// Conference port identifier — maps to `pjsua_conf_port_id` (int).
    pub type pjsua_conf_port_id = i32;

    /// Transport identifier — maps to `pjsua_transport_id` (int).
    pub type pjsua_transport_id = i32;

    /// PJSUA success result code (maps to `PJ_SUCCESS` = 0).
    pub const PJ_SUCCESS: i32 = 0;

    /// Generic PJSUA error indicator.
    pub const PJ_EUNKNOWN: i32 = -1;

    // ---------------------------------------------------------------------------
    // PJSUA call state constants (pjsua_call_state)
    // ---------------------------------------------------------------------------

    /// Call is idle (not yet established or disconnected).
    pub const PJSUA_CALL_NULL: u32 = 0;
    /// Call is being set up (outgoing).
    pub const PJSUA_CALL_CALLING: u32 = 1;
    /// Incoming call is being alerted.
    pub const PJSUA_CALL_INCOMING: u32 = 2;
    /// Call is being set up (early media).
    pub const PJSUA_CALL_EARLY: u32 = 3;
    /// Call is active (media established).
    pub const PJSUA_CALL_CONNECTING: u32 = 4;
    /// Call is confirmed (media connected).
    pub const PJSUA_CALL_CONFIRMED: u32 = 5;
    /// Call is being disconnected.
    pub const PJSUA_CALL_DISCONNECTED: u32 = 6;

    // ---------------------------------------------------------------------------
    // PJSUA registration state constants (pjsua_reg_state)
    // ---------------------------------------------------------------------------

    /// Registration is not yet started.
    pub const PJSUA_REG_STATE_NULL: u32 = 0;
    /// Registration is being sent.
    pub const PJSUA_REG_STATE_REGISTERING: u32 = 1;
    /// Registration is active.
    pub const PJSUA_REG_STATE_ACTIVE: u32 = 2;
    /// Registration attempt failed.
    pub const PJSUA_REG_STATE_FAILED: u32 = 3;

    // ---------------------------------------------------------------------------
    // pj_str_t — PJSIP string descriptor
    // ---------------------------------------------------------------------------

    /// Mirror of PJSIP's `pj_str_t` struct.
    ///
    /// # Memory safety
    /// This struct is only used as an FFI argument passthrough — the pointer
    /// must point to valid memory for the duration of the FFI call.
    /// When using `PjOwnedStr` (from `ffi::pj_str`), the backing memory
    /// is Rust-owned `Vec<u8>`.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pj_str_t {
        /// Pointer to the string data (may be null if slen is 0).
        pub ptr: *mut i8,
        /// Length of the string in bytes.
        pub slen: i32,
    }

    // ---------------------------------------------------------------------------
    // pjsua_call_info — call information struct (minimal mirror)
    // ---------------------------------------------------------------------------

    /// Mirror of PJSIP's `pjsua_call_info` struct.
    ///
    /// Only the fields needed by `resolve_conf_port` are included.
    /// Full struct should come from bindgen when `pjsua-native` is enabled.
    #[repr(C)]
    #[derive(Debug)]
    pub struct pjsua_call_info {
        /// Conference port slot for this call's media.
        pub conf_slot: pjsua_conf_port_id,
    }

    // ---------------------------------------------------------------------------
    // Stub FFI calls (compile-time only — no link symbol needed yet)
    // ---------------------------------------------------------------------------

    /// Stub for `pjsua_call_get_info`.
    ///
    /// # Safety
    ///
    /// `_info` must be non-null, properly aligned, and point to a valid,
    /// initialized `pjsua_call_info` struct. The caller is responsible for
    /// ensuring no concurrent mutable access to the pointed-to memory.
    ///
    // [::STUB::] P11-10: Real PJSIP FFI calls are not yet wired; canned or unimplemented values are returned -- Replace canned or unimplemented PJSIP FFI call sites (pjsua_call_get_info and other backend calls) with real bindgen-generated calls and obtain actual media_status once the pjsua-native feature and library linkage are ready
    pub unsafe fn pjsua_call_get_info(_call_id: pjsua_call_id, _info: *mut pjsua_call_info) -> i32 {
        if _info.is_null() {
            return PJ_EUNKNOWN;
        }
        // Write a stub conf_slot
        unsafe {
            (*_info).conf_slot = _call_id as pjsua_conf_port_id;
        }
        PJ_SUCCESS
    }
}

#[cfg(not(feature = "pjsua-native"))]
pub use stub_aliases::*;

// Shared — available in both modes: bindgen output and the stub aliases both
// define `pj_str_t`, so the `null()` constructor is attached here once.
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
impl pj_str_t {
    /// Create a null (zero-length) `pj_str_t`.
    pub const fn null() -> Self {
        Self {
            ptr: std::ptr::null_mut(),
            slen: 0,
        }
    }
}

#[cfg(all(test, not(feature = "pjsua-native")))]
mod tests {
    use super::*;

    #[test]
// [::TICKET::] P3-2, P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5) --for-spec --no-implementation-order`.
    fn pj_str_t_null_creates_zero_length() {
        let owned = pj_str_t::null();
        assert_eq!(owned.slen, 0, "null pj_str_t must have slen=0");
        assert!(owned.ptr.is_null(), "null pj_str_t must have null ptr");
    }

    #[test]
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pjsua_call_get_info_stub_returns_success() {
        let mut info = pjsua_call_info { conf_slot: 0 };
        let status = unsafe { pjsua_call_get_info(42, &mut info) };
        assert_eq!(status, PJ_SUCCESS, "stub must return success");
        assert_eq!(info.conf_slot, 42, "conf_slot must match call_id");
    }

    #[test]
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pjsua_call_get_info_null_returns_error() {
        let status = unsafe { pjsua_call_get_info(42, std::ptr::null_mut()) };
        assert_eq!(status, PJ_EUNKNOWN, "null info must return error");
    }

    #[test]
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn call_state_constants_are_distinct() {
        let states = [
            PJSUA_CALL_NULL,
            PJSUA_CALL_CALLING,
            PJSUA_CALL_INCOMING,
            PJSUA_CALL_EARLY,
            PJSUA_CALL_CONNECTING,
            PJSUA_CALL_CONFIRMED,
            PJSUA_CALL_DISCONNECTED,
        ];
        let mut sorted: Vec<u32> = states.to_vec();
        sorted.sort();
        sorted.dedup();
        assert_eq!(
            sorted.len(),
            states.len(),
            "call state constants must be unique"
        );
    }

    #[test]
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pjsua_acc_id_is_i32() {
        // Compile-time assertion: pjsua_acc_id must be i32
        let _: pjsua_acc_id = 0i32;
        let _: pjsua_call_id = 0i32;
        let _: pjsua_conf_port_id = 0i32;
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn stub_surface_is_callable_without_pjsua() {
        // C038-Pre: the FFI surface must be callable with no system PJSIP install.
        let mut info = pjsua_call_info { conf_slot: 0 };
        let status = unsafe { pjsua_call_get_info(7, &mut info) };
        assert_eq!(status, PJ_SUCCESS);
        assert_eq!(info.conf_slot, 7);
    }
}
