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

use crate::runtime::command::ReactorError;

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

    /// Generic PJSUA error indicator (`PJ_ERRNO_START_STATUS + 1` = 70001).
    pub const PJ_EUNKNOWN: i32 = 70001;

    /// Not enough memory (`PJ_ERRNO_START_STATUS + 7` = 70007).
    ///
    /// [::TICKET::] P11-9: the stub mirrors the pjsua.h values (vendored
    /// `pj/errno.h`) so the error/state mapping compiles identically under both
    /// constant sources.
    pub const PJ_ENOMEM: i32 = 70007;
    /// Invalid operation (`PJ_ERRNO_START_STATUS + 13` = 70013).
    pub const PJ_EINVALIDOP: i32 = 70013;
    /// Object is busy (`PJ_ERRNO_START_STATUS + 11` = 70011).
    pub const PJ_EBUSY: i32 = 70011;

    // ---------------------------------------------------------------------------
    // pjsip_inv_state — invite-session state constants (bindgen consts-style:
    // the PJSIP_INV_STATE_ prefix is stripped, so `CONFIRMED` == PJSIP_INV_STATE_CONFIRMED).
    // ---------------------------------------------------------------------------

    /// Initial state.
    ///
    /// Values match `enum pjsip_inv_state` in `pjsip-ua/sip_inv.h`; the full enum
    /// also has INCOMING=2 and EARLY=3, which no mapping consumes yet.
    pub mod pjsip_inv_state {
        /// Before INVITE is sent or received.
        pub const NULL: u32 = 0;
        /// After INVITE is sent (outgoing).
        pub const CALLING: u32 = 1;
        /// After a 2xx is sent/received.
        pub const CONNECTING: u32 = 4;
        /// After ACK is sent/received.
        pub const CONFIRMED: u32 = 5;
        /// Session is terminated.
        pub const DISCONNECTED: u32 = 6;
    }

    // ---------------------------------------------------------------------------
    // pjsua_call_media_status — call media status constants (bindgen consts-style:
    // the PJSUA_CALL_MEDIA_ prefix is stripped).
    // ---------------------------------------------------------------------------

    /// Call media state, mapped from PJSIP's `pjsua_call_media_status`.
    pub mod pjsua_call_media_status {
        /// No media / initial state.
        pub const NONE: u32 = 0;
        /// Media is active (send/receive).
        pub const ACTIVE: u32 = 1;
        /// Media is locally held.
        pub const LOCAL_HOLD: u32 = 2;
        /// Media is remotely held.
        pub const REMOTE_HOLD: u32 = 3;
        /// Media error occurred.
        pub const ERROR: u32 = 4;
    }

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
    /// Exposes the fields the crate consumes — `conf_slot` (for the conference
    /// bridge) and `media_status` (for `CallMediaStateChanged`) — matching the
    /// bindgen-generated struct's field names so shared code compiles under both
    /// modes. Full struct comes from bindgen when `pjsua-native` is enabled.
    #[repr(C)]
    #[derive(Debug)]
    pub struct pjsua_call_info {
        /// Conference port slot for this call's media.
        pub conf_slot: pjsua_conf_port_id,
        /// Call media status (`pjsua_call_media_status`); NONE in stub mode.
        pub media_status: u32,
    }

    // ---------------------------------------------------------------------------
    // pjsua_codec_info — codec information struct (minimal mirror)
    // ---------------------------------------------------------------------------

    /// Mirror of PJSIP's `pjsua_codec_info` struct.
    ///
    /// Only the fields needed to build `Codec` are modelled; the full struct
    /// comes from bindgen when `pjsua-native` is enabled.
    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct pjsua_codec_info {
        /// Codec ID string (e.g., "opus/48000/2").
        pub codec_id: pj_str_t,
        /// Encoding name (e.g., "opus").
        pub encoding_name: pj_str_t,
        /// Clock rate in Hz (e.g., 48000).
        pub clock_rate: u32,
        /// Number of channels (e.g., 2).
        pub channel_cnt: u32,
    }

    // ---------------------------------------------------------------------------
    // Stub FFI calls (compile-time only — no link symbol needed yet)
    // ---------------------------------------------------------------------------

    /// Stub for `pjsua_call_get_info`.
    ///
    /// The non-`pjsua-native` build has no linked PJSIP library, so the stub
    /// fills the mirror deterministically: `conf_slot` echoes the call id and
    /// `media_status` is `NONE` (no real call media without the stack). Under
    /// `pjsua-native` this call is replaced by the bindgen symbol.
    ///
    /// # Safety
    ///
    /// `_info` must be non-null, properly aligned, and point to a valid,
    /// initialized `pjsua_call_info` struct. The caller is responsible for
    /// ensuring no concurrent mutable access to the pointed-to memory.
    pub unsafe fn pjsua_call_get_info(_call_id: pjsua_call_id, _info: *mut pjsua_call_info) -> i32 {
        if _info.is_null() {
            return PJ_EUNKNOWN;
        }
        unsafe {
            (*_info).conf_slot = _call_id as pjsua_conf_port_id;
            (*_info).media_status = pjsua_call_media_status::NONE;
        }
        PJ_SUCCESS
    }

    /// Stub for `pjsua_enum_codecs`.
    ///
    /// The non-`pjsua-native` build has no linked PJSIP library, so no native
    /// codecs are available: `count` is set to 0 and success is returned.
    ///
    /// # Safety
    ///
    /// `count` must be non-null and point to a valid `u32`. `codecs` is
    /// unused by the stub and may be null.
    pub unsafe fn pjsua_enum_codecs(_codecs: *mut pjsua_codec_info, count: *mut u32) -> i32 {
        if count.is_null() {
            return PJ_EUNKNOWN;
        }
        unsafe {
            *count = 0;
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

// ---------------------------------------------------------------------------
// Shared codec-enumeration helpers — available in both modes: the bindgen
// output and the stub aliases both define `pjsua_codec_info`, `pj_str_t`,
// `pjsua_enum_codecs`, and `PJ_SUCCESS`, so these helpers compile against
// either body.
// ---------------------------------------------------------------------------

/// Maximum number of codecs reportable by `pjsua_enum_codecs` (`PJMEDIA_MAX_CODECS`).
const MAX_ENUM_CODECS: usize = 256;

/// Read a `pj_str_t` into an owned `String`.
///
/// Returns an empty string for a null pointer or a non-positive length.
///
/// # Safety contract
/// The caller guarantees that `ptr` points to at least `slen` readable bytes
/// for the duration of the call (PJSIP static codec strings in the live path,
/// or a live `PjOwnedStr` in fixture tests).
pub fn pj_str_to_string(s: &pj_str_t) -> String {
    if s.ptr.is_null() || s.slen <= 0 {
        return String::new();
    }
    let len = s.slen as usize;
    // SAFETY: guarded above — ptr is non-null and slen > 0, and the caller
    // guarantees at least `slen` readable bytes for the duration of the call.
    let bytes = unsafe { std::slice::from_raw_parts(s.ptr as *const u8, len) };
    String::from_utf8_lossy(bytes).into_owned()
}

/// Decode a raw `pjsua_enum_codecs` result into the filled entries.
///
/// Returns an empty list when the status is not success, or when `count`
/// exceeds the buffer capacity (a protocol violation).
// [::TICKET::] P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-8 --for-spec --no-implementation-order`.
fn decode_enumeration_result(
    status: i32,
    count: u32,
    mut raw: Vec<pjsua_codec_info>,
) -> Vec<pjsua_codec_info> {
    if status != PJ_SUCCESS || count as usize > raw.len() {
        return Vec::new();
    }
    raw.truncate(count as usize);
    raw
}

/// Enumerate native audio codecs from the PJSUA stack.
///
/// The raw `pjsua_codec_info` entries returned contain `pj_str_t` pointers
/// into PJSIP-owned static codec strings that remain valid for the process
/// lifetime; consumers must map them to owned types (e.g. `Codec`) promptly.
pub fn enumerate_codecs() -> Vec<pjsua_codec_info> {
    let mut raw = vec![unsafe { std::mem::zeroed() }; MAX_ENUM_CODECS];
    let mut count: u32 = 0;
    // SAFETY: raw.as_mut_ptr() points to MAX_ENUM_CODECS valid entries and
    // pjsua_enum_codecs writes at most that many; count is a valid pointer.
    // All-zero is a valid pjsua_codec_info (null ptr / slen 0 / rates 0).
    let status = unsafe { pjsua_enum_codecs(raw.as_mut_ptr(), &mut count) };
    if status != PJ_SUCCESS {
        tracing::warn!(status, "codec enumeration failed; degrading to empty available_codecs");
    } else if count as usize > raw.len() {
        tracing::warn!(count, "codec enumeration count exceeds buffer capacity; degrading to empty available_codecs");
    }
    decode_enumeration_result(status, count, raw)
}

// ---------------------------------------------------------------------------
// Call media status resolution — shared by both modes
// ---------------------------------------------------------------------------

/// Read the `media_status` field from a populated `pjsua_call_info`.
///
/// Pure decoder — unit-testable with a fixture struct; the FFI boundary is
/// confined to `resolve_call_media_status`.
pub fn media_status_from_call_info(info: &pjsua_call_info) -> u32 {
    info.media_status as u32
}

/// Resolve the actual media status for a call via `pjsua_call_get_info`.
///
/// Under `pjsua-native` this runs the real bindgen FFI symbol against the
/// linked PJSIP library; under the stub build it reads the stub-produced
/// struct. A non-success `pj_status_t` is surfaced as
/// `ReactorError::BackendError` with the status preserved — never a canned
/// success.
pub fn resolve_call_media_status(call_id: pjsua_call_id) -> Result<u32, ReactorError> {
    let mut info: pjsua_call_info = unsafe { std::mem::zeroed() };
    // SAFETY: info is a valid, aligned, initialized pjsua_call_info; the FFI
    // fills it in place; the caller has no concurrent mutable access.
    let status = unsafe { pjsua_call_get_info(call_id, &mut info) };
    if status != PJ_SUCCESS {
        return Err(ReactorError::BackendError(format!(
            "pjsua_call_get_info({call_id}) failed with status {status}"
        )));
    }
    Ok(media_status_from_call_info(&info))
}

#[cfg(all(test, not(feature = "pjsua-native")))]
mod tests {
    use super::*;
    use crate::ffi::pj_str::PjOwnedStr;

    #[test]
// [::TICKET::] P3-2, P11-5, P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P11-8) --for-spec --no-implementation-order`.
    fn pj_str_t_null_creates_zero_length() {
        let owned = pj_str_t::null();
        assert_eq!(owned.slen, 0, "null pj_str_t must have slen=0");
        assert!(owned.ptr.is_null(), "null pj_str_t must have null ptr");
    }

    #[test]
// [::TICKET::] P3-2, P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10) --for-spec --no-implementation-order`.
    fn pjsua_call_get_info_stub_returns_success() {
        let mut info = pjsua_call_info {
            conf_slot: 0,
            media_status: 0,
        };
        let status = unsafe { pjsua_call_get_info(42, &mut info) };
        assert_eq!(status, PJ_SUCCESS, "stub must return success");
        assert_eq!(info.conf_slot, 42, "conf_slot must match call_id");
        assert_eq!(
            info.media_status as u32,
            pjsua_call_media_status::NONE,
            "stub media_status must be NONE (no real media without pjsua-native)"
        );
    }

    #[test]
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pjsua_call_get_info_null_returns_error() {
        let status = unsafe { pjsua_call_get_info(42, std::ptr::null_mut()) };
        assert_eq!(status, PJ_EUNKNOWN, "null info must return error");
    }

    #[test]
    // [::TICKET::] P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-10 --for-spec --no-implementation-order`.
    fn media_status_from_call_info_reads_field() {
        let info = pjsua_call_info {
            conf_slot: 7,
            media_status: pjsua_call_media_status::ACTIVE,
        };
        assert_eq!(
            media_status_from_call_info(&info),
            pjsua_call_media_status::ACTIVE,
            "decoder must read the media_status field from a populated pjsua_call_info"
        );
    }

    #[test]
    // [::TICKET::] P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-10 --for-spec --no-implementation-order`.
    fn resolve_call_media_status_returns_stub_value() -> Result<(), ReactorError> {
        // The helper must route through pjsua_call_get_info (the stub writes NONE),
        // proving the media_status never comes from a hardcoded literal.
        let status = resolve_call_media_status(42)?;
        assert_eq!(
            status,
            pjsua_call_media_status::NONE,
            "resolve_call_media_status must return the value pjsua_call_get_info wrote"
        );
        Ok(())
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
// [::TICKET::] P11-5, P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-10) --for-spec --no-implementation-order`.
    fn stub_surface_is_callable_without_pjsua() {
        // C038-Pre: the FFI surface must be callable with no system PJSIP install.
        let mut info = pjsua_call_info {
            conf_slot: 0,
            media_status: 0,
        };
        let status = unsafe { pjsua_call_get_info(7, &mut info) };
        assert_eq!(status, PJ_SUCCESS);
        assert_eq!(info.conf_slot, 7);
        assert_eq!(
            info.media_status as u32,
            pjsua_call_media_status::NONE,
            "stub media_status must be NONE"
        );
    }

    // [::TICKET::] P11-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-9 --for-spec --no-implementation-order`.
    #[test]
// [::TICKET::] P11-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-9 --for-spec --no-implementation-order`.
    fn stub_surface_exposes_p11_9_constants() {
        // P11-9: the error/state mapping modules consume these constants from
        // ffi::bindings. RED until the stub_aliases expose them; the type
        // annotations pin the ABI widths (i32 status, u32 enum values).
        let _success: i32 = PJ_SUCCESS;
        let _enomem: i32 = PJ_ENOMEM;
        let _einval: i32 = PJ_EINVALIDOP;
        let _ebusy: i32 = PJ_EBUSY;
        let _inv_state: u32 = pjsip_inv_state::CONFIRMED;
        let _media_state: u32 = pjsua_call_media_status::ACTIVE;
        let _ = (_success, _enomem, _einval, _ebusy, _inv_state, _media_state);
    }

    // ── P11-8: codec-enumeration FFI surface ───────────────────────────

    #[test]
    // @verifies C041
// [::TICKET::] P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-8 --for-spec --no-implementation-order`.
    fn pj_str_to_string_reads_valid_str() {
        let owned = PjOwnedStr::new("opus/48000/2");
        let raw = owned.as_raw();
        assert_eq!(pj_str_to_string(&raw), "opus/48000/2");
    }

    #[test]
    // @verifies C041
// [::TICKET::] P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-8 --for-spec --no-implementation-order`.
    fn pj_str_to_string_null_returns_empty() {
        let raw = pj_str_t::null();
        assert_eq!(pj_str_to_string(&raw), "");
    }

    #[test]
    // @verifies C041
// [::TICKET::] P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-8 --for-spec --no-implementation-order`.
    fn decode_enumeration_result_error_returns_empty() {
        let raw: Vec<pjsua_codec_info> = Vec::new();
        let result = decode_enumeration_result(PJ_EUNKNOWN, 3, raw);
        assert!(result.is_empty());
    }

    #[test]
    // @verifies C041
// [::TICKET::] P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-8 --for-spec --no-implementation-order`.
    fn decode_enumeration_result_truncates_to_count() {
        let zero = pjsua_codec_info {
            codec_id: pj_str_t::null(),
            encoding_name: pj_str_t::null(),
            clock_rate: 0,
            channel_cnt: 0,
        };
        let raw = vec![zero; 4];
        let result = decode_enumeration_result(PJ_SUCCESS, 2, raw);
        assert_eq!(result.len(), 2);
    }

    #[test]
    // @verifies C041
// [::TICKET::] P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-8 --for-spec --no-implementation-order`.
    fn decode_enumeration_result_count_exceeding_buffer_returns_empty() {
        let zero = pjsua_codec_info {
            codec_id: pj_str_t::null(),
            encoding_name: pj_str_t::null(),
            clock_rate: 0,
            channel_cnt: 0,
        };
        let raw = vec![zero; 2];
        // A count larger than the buffer capacity is a protocol violation.
        let result = decode_enumeration_result(PJ_SUCCESS, 256, raw);
        assert!(result.is_empty());
    }

    #[test]
    // @verifies C041
// [::TICKET::] P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-8 --for-spec --no-implementation-order`.
    fn enumerate_codecs_empty_without_native() {
        // The stub pjsua_enum_codecs reports count=0, so the safe wrapper
        // returns an empty list on the non-pjsua-native path.
        assert!(enumerate_codecs().is_empty());
    }

    #[test]
    // @verifies C041
// [::TICKET::] P11-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-8 --for-spec --no-implementation-order`.
    fn pjsua_enum_codecs_null_count_returns_error() {
        let status = unsafe { pjsua_enum_codecs(std::ptr::null_mut(), std::ptr::null_mut()) };
        assert_eq!(status, PJ_EUNKNOWN);
    }
}
