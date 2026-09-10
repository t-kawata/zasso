
//!
//! The reactor error path must preserve the PJSUA `pj_status_t` diagnostic code
//! end-to-end: FFI status → `map_native_error`/`ReactorError::NativeError` →
//! `From<ReactorError> for SipError` → public `SipError.native_status()`.
//!
//! §14.1 compliance is centralized in `m20_runtime_command_error::classify` —
//! the single source of truth for the `pj_status_t → SipErrorKind` mapping.
//! `SipError::with_status` is the only constructor that stores the native code.
//!
//! The integration tests below prove the invariant: no conversion step drops
//! `native_status` once set.

#[cfg(test)]
mod tests {
    use crate::error::error_design_siperror::{SipError, SipErrorKind};
    use crate::runtime::command::ReactorError;

    // ── C089: reactor path never loses native_status ─────────────────

    #[test]
    fn reactor_native_error_conversion_preserves_native_status() {
        let sip: SipError = ReactorError::NativeError {
            message: "make_call failed".into(),
            native_status: crate::ffi::bindings::PJ_EUNKNOWN,
        }
        .into();
        assert_eq!(sip.native_status(), Some(crate::ffi::bindings::PJ_EUNKNOWN));
        assert_eq!(sip.kind, SipErrorKind::NativeError);
    }

    #[test]
    fn with_status_round_trips_native_status() {
        let err = SipError::with_status(SipErrorKind::NativeError, "hangup failed", 70001);
        let _: Option<i32> = err.native_status;
        assert_eq!(err.native_status(), Some(70001));
    }

    // ── C090: map_native_error is the backend conversion entry point ─

    #[test]
    fn backend_map_native_error_preserves_status() {
        let err = crate::runtime::backend::map_native_error(
            crate::ffi::bindings::PJ_EBUSY,
            "conf_connect failed",
        );
        assert_eq!(err.native_status(), Some(crate::ffi::bindings::PJ_EBUSY));
        assert_eq!(err.kind, SipErrorKind::NativeError);
    }
}
