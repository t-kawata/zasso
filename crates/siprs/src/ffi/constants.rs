// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.

//! Crate-internal PJSIP sentinel constants.
//!
//! PJSIP 2.17.0 does not define `PJSUA_CALL_NULL` anywhere in the vendored
//! headers (verified against `vendor/prebuilt/*/include`), so the sentinel is
//! defined here instead of in `bindings`. This keeps the constant independent
//! of bindgen output — it compiles in both the stub build and the native
//! `pjsua-native` build (§62.32/N0101).

/// Sentinel for "no call state" — PJSIP's `pjsua_call_state` idle value (0).
///
/// Mirrors the historical `PJSUA_CALL_NULL` sentinel that siprs referenced via
/// `bindings` before the vendored headers were verified to omit it.
pub const PJSUA_CALL_NULL: u32 = 0;

// ---------------------------------------------------------------------------
// pj_status_t success/error codes (pj/types.h `enum pj_constants_`)
// ---------------------------------------------------------------------------
//
// P18-1 §62.32: `PJ_SUCCESS`/`PJ_EUNKNOWN`/`PJ_ENOMEM`/`PJ_EINVALIDOP`/
// `PJ_EBUSY` are enumerators of `enum pj_constants_`, which bindgen does not
// emit as free `bindings::*` consts (E0432/E0425). They are defined here,
// independent of bindgen output, with the same values the stub bindings used.
// The error-code values follow pjlib's 70000 base (`pj/errno.h`).

/// Success result code.
pub const PJ_SUCCESS: i32 = 0;
/// Unknown / unspecified error.
pub const PJ_EUNKNOWN: i32 = 70001;
/// Operation is busy.
pub const PJ_EBUSY: i32 = 70011;
/// Out of memory.
pub const PJ_ENOMEM: i32 = 70007;
/// Invalid or unsupported operation.
pub const PJ_EINVALIDOP: i32 = 70013;

/// Plain-text password credential data type (`sip_auth.h:109`).
///
/// P18-1 §62.32: this is an enumerator of `pjsip_cred_data_type`, which bindgen
/// does not emit as a free `bindings::*` const; the value 0 is stable.
pub const PJSIP_CRED_DATA_PLAIN_PASSWD: i32 = 0;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn pjsua_call_null_sentinel_is_zero() {
        // N0101: the sentinel is value-stable at 0 across both feature modes.
        assert_eq!(PJSUA_CALL_NULL, 0);
    }

    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn pj_status_constants_match_pjlib_values() {
        // N0101: crate-internal constants are value-stable and independent of
        // bindgen output, so error mapping stays correct in both modes.
        assert_eq!(PJ_SUCCESS, 0);
        assert_eq!(PJ_EUNKNOWN, 70001);
        assert_eq!(PJ_ENOMEM, 70007);
        assert_eq!(PJ_EINVALIDOP, 70013);
        assert_eq!(PJ_EBUSY, 70011);
    }
}
