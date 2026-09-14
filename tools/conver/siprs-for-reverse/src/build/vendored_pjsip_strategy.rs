
//! Vendored PJSIP 2.17.0 version strategy (§62.32 / N0101).
//!
//! PJSIP stays pinned at 2.17.0 (C139 invariant — no upgrade path exists; the
//! latest release is the vendored one). The crate therefore *adapts* to the
//! actual 2.17.0 symbols instead of upgrading the library:
//!
//! - `PJSIP_CRED_DATA_PLAIN_PASSWD` (sip_auth.h:109) replaces the absent
//!   `PJ_CRED_DATA_PLAIN_PASSWD` — defined in [`crate::ffi::constants`].
//! - `pjsua_codec_info` in 2.17.0 exposes only `codec_id`/`priority`, so
//!   `encoding_name`/`clock_rate` are derived from a `codec_id` "mime/clock"
//!   parse (`codec_id_to_name_rate` in `config::observability_metrics`).
//! - `PJSUA_CALL_NULL` (absent from the vendored headers) is a crate-internal
//!   sentinel in [`crate::ffi::constants`].

/// Canonical vendored PJSIP version — pinned by RFC §4 / §62.32 (C139).
pub use crate::build::build_strategy_os_deps::{PjsipVersion, PJSIP_CANONICAL_VERSION};

/// The fields `pjsua_codec_info` exposes in PJSIP 2.17.0 (pjsua.h:8155).
///
/// `encoding_name` / `clock_rate` are absent — they are derived from the
/// `codec_id` string (§62.32 / N0101).
pub const VENDORED_CODEC_INFO_FIELDS: &[&str] = &["codec_id", "priority"];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vendored_pjsip_is_pinned_at_2_17_0() {
        // symbols rather than upgrading the library.
        assert_eq!(PJSIP_CANONICAL_VERSION, PjsipVersion::new(2, 17, 0));
    }

    #[test]
    fn codec_info_surface_is_the_two_2_17_0_fields() {
        // exposes only codec_id/priority, so name/rate derive from codec_id.
        assert_eq!(VENDORED_CODEC_INFO_FIELDS, &["codec_id", "priority"]);
    }
}
