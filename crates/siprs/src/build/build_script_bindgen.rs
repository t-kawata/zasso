// [::TICKET::] P11-5: Shared build-script logic for the pjsua-native bindgen pipeline.
//
// This module holds the deterministic, unit-testable pieces of the bindgen build
// pipeline (RFC §27/§28): the fixed allowlist symbol set, the header-root
// resolution order, and the feature-flag predicate. `build.rs` includes this
// file verbatim via `#[path = "src/build/build_script_bindgen.rs"]` so the same
// logic drives the build; the crate also compiles the module (src/build/mod.rs)
// so `cargo test` can cover it. Build scripts are not test targets, so keeping
// the deterministic logic here — reachable by `cargo test` — is what makes the
// pipeline testable.
//
// The `pjsua-native` feature gates the whole pipeline: when it is off (default)
// the crate builds with no bindgen and no external C library; when it is on,
// build.rs resolves the header root and runs bindgen against wrapper.h.

/// File name of the bindgen output, written to `OUT_DIR` by build.rs and
/// `include!`-d into `src/ffi/bindings.rs` when `pjsua-native` is enabled.
pub const BINDINGS_OUTPUT: &str = "bindings.rs";

/// Fixed allowlist of PJSIP types siprs references. Bindgen emits exactly these
/// typedefs/structs so the generated surface stays minimal and reviewable.
///
/// Covers the current stub surface: `src/ffi/bindings.rs` type aliases plus the
/// struct/typedefs those aliases depend on (`pj_str_t`, `pjsua_call_info`).
pub const BINDGEN_ALLOWLIST_TYPES: &[&str] = &[
    "pjsua_acc_id",
    "pjsua_call_id",
    "pjsua_conf_port_id",
    "pjsua_transport_id",
    "pj_str_t",
    "pjsua_call_info",
    // P11-9: the call-state mapping modules consume these enum types; bindgen
    // emits them (consts style) as modules of constants.
    "pjsip_inv_state",
    "pjsua_call_media_status",
];

/// Fixed allowlist of PJSIP calls siprs references.
///
/// `pjsua_call_get_info` is the only FFI entry the current stub surface
/// declares; the real call sites are wired by P11-10 and may extend this list.
pub const BINDGEN_ALLOWLIST_FUNCTIONS: &[&str] = &["pjsua_call_get_info"];

/// Fixed allowlist of PJSIP constants siprs references.
///
/// Mirrors the constants hand-declared in `src/ffi/bindings.rs` (PJ_SUCCESS /
/// PJ_EUNKNOWN, `PJSUA_CALL_*`, `PJSUA_REG_STATE_*`). P11-9 replaces the
/// hand-coded duplicates in error/state modules from this generated set.
pub const BINDGEN_ALLOWLIST_VARS: &[&str] = &[
    "PJ_SUCCESS",
    "PJ_EUNKNOWN",
    // P11-9: pj_status_t error codes consumed by the error/state mapping.
    "PJ_ENOMEM",
    "PJ_EINVALIDOP",
    "PJ_EBUSY",
    // P11-9: pjsip_inv_state enumerators (bindgen consts-style strips the prefix).
    "PJSIP_INV_STATE_NULL",
    "PJSIP_INV_STATE_CALLING",
    "PJSIP_INV_STATE_CONNECTING",
    "PJSIP_INV_STATE_CONFIRMED",
    "PJSIP_INV_STATE_DISCONNECTED",
    // P11-9: pjsua_call_media_status enumerators.
    "PJSUA_CALL_MEDIA_NONE",
    "PJSUA_CALL_MEDIA_ACTIVE",
    "PJSUA_CALL_MEDIA_LOCAL_HOLD",
    "PJSUA_CALL_MEDIA_REMOTE_HOLD",
    "PJSUA_CALL_MEDIA_ERROR",
    "PJSUA_CALL_NULL",
    "PJSUA_CALL_CALLING",
    "PJSUA_CALL_INCOMING",
    "PJSUA_CALL_EARLY",
    "PJSUA_CALL_CONNECTING",
    "PJSUA_CALL_CONFIRMED",
    "PJSUA_CALL_DISCONNECTED",
    "PJSUA_REG_STATE_NULL",
    "PJSUA_REG_STATE_REGISTERING",
    "PJSUA_REG_STATE_ACTIVE",
    "PJSUA_REG_STATE_FAILED",
];

/// Resolves the PJSIP header root per RFC §28.1 search order:
/// 1. `vendor/prebuilt/{target_triple}/include` when it contains `pjsua.h`
/// 2. `vendor/pjsip/include` when it contains `pjsua.h`
/// 3. `None` — callers surface the RFC §28.4 package-list error.
pub fn resolve_header_root(
    manifest_dir: &std::path::Path,
    target_triple: &str,
) -> Option<std::path::PathBuf> {
    let prebuilt = manifest_dir
        .join("vendor")
        .join("prebuilt")
        .join(target_triple)
        .join("include");
    if has_pjsua_header(&prebuilt) {
        return Some(prebuilt);
    }
    let source = manifest_dir.join("vendor").join("pjsip").join("include");
    if has_pjsua_header(&source) {
        return Some(source);
    }
    None
}

/// Whether `dir` contains a `pjsua.h` — the marker that a directory is a valid
/// PJSIP header root.
pub fn has_pjsua_header(dir: &std::path::Path) -> bool {
    dir.join("pjsua.h").is_file()
}

/// Pure predicate extracted from `build.rs::pjsua_native_enabled()` so the
/// CARGO_FEATURE_* presence check is unit-testable.
pub fn feature_env_present(env_value: Result<String, std::env::VarError>) -> bool {
    env_value.is_ok()
}

/// Platform-specific clang `-D` defines required for the PJSIP headers
/// (RFC §27.1: build.rs sets platform include paths and defines). ARM cores are
/// bi-endian and `pj/config.h` demands an explicit endianness declaration for
/// both macros (`PJ_IS_LITTLE_ENDIAN` AND `PJ_IS_BIG_ENDIAN`, one set to 1 and
/// the other to 0) instead of auto-detecting it. x86_64 / macOS / Windows
/// targets auto-detect and need no define.
pub fn platform_clang_defines(target: &str) -> Vec<String> {
    let is_arm = target.contains("aarch64") || target.contains("armv") || target.starts_with("arm");
    let is_big_endian = target.contains("armeb")
        || target.contains("aarch64_be")
        || target.ends_with("eb")
        || target.contains("-big-endian");
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    match (is_arm, is_big_endian) {
        (true, false) => vec![
            "PJ_IS_LITTLE_ENDIAN=1".to_string(),
            "PJ_IS_BIG_ENDIAN=0".to_string(),
        ],
        (true, true) => vec![
            "PJ_IS_LITTLE_ENDIAN=0".to_string(),
            "PJ_IS_BIG_ENDIAN=1".to_string(),
        ],
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn feature_env_present_reflects_cargo_env() {
        assert!(feature_env_present(Ok(String::from("1"))));
        assert!(!feature_env_present(Err(std::env::VarError::NotPresent)));
    }

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn resolve_header_root_prefers_prebuilt_over_vendor() -> std::io::Result<()> {
        let root = std::env::temp_dir().join(format!("siprs-bindgen-test-{}", std::process::id()));
        let prebuilt = root.join("vendor/prebuilt/x86_64-unknown-linux-gnu/include");
        let vendor = root.join("vendor/pjsip/include");
        std::fs::create_dir_all(&prebuilt)?;
        std::fs::write(prebuilt.join("pjsua.h"), b"int pjsua_init(void);")?;
        std::fs::create_dir_all(&vendor)?;
        std::fs::write(vendor.join("pjsua.h"), b"int pjsua_init(void);")?;
        let got = resolve_header_root(&root, "x86_64-unknown-linux-gnu");
        assert_eq!(got, Some(prebuilt));
        let _ = std::fs::remove_dir_all(&root);
        Ok(())
    }

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn resolve_header_root_returns_none_when_no_headers() -> std::io::Result<()> {
        let root = std::env::temp_dir().join(format!("siprs-empty-{}", std::process::id()));
        assert_eq!(resolve_header_root(&root, "x86_64-unknown-linux-gnu"), None);
        let _ = std::fs::remove_dir_all(&root);
        Ok(())
    }

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn has_pjsua_header_distinguishes_pjsua_from_other() -> std::io::Result<()> {
        let root = std::env::temp_dir().join(format!("siprs-hdr-{}", std::process::id()));
        std::fs::create_dir_all(&root)?;
        std::fs::write(root.join("pjmedia.h"), b"x")?;
        assert!(!has_pjsua_header(&root));
        std::fs::write(root.join("pjsua.h"), b"x")?;
        assert!(has_pjsua_header(&root));
        let _ = std::fs::remove_dir_all(&root);
        Ok(())
    }

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn allowlist_covers_stub_surface() {
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pj_str_t"));
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsua_call_info"));
        assert!(BINDGEN_ALLOWLIST_FUNCTIONS.contains(&"pjsua_call_get_info"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSUA_CALL_CONFIRMED"));
    }

    // [::TICKET::] P11-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-9 --for-spec --no-implementation-order`.
    #[test]
// [::TICKET::] P11-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-9 --for-spec --no-implementation-order`.
    fn allowlist_covers_p11_9_constant_surface() {
        // P11-9: the error/state mapping modules consume these constants from
        // ffi::bindings. A constant missing from the allowlist fails this test,
        // so a missing bindgen constant surfaces as a compile error, never a
        // silent fallback to a hardcoded value.
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJ_ENOMEM"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJ_EINVALIDOP"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJ_EBUSY"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSIP_INV_STATE_NULL"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSIP_INV_STATE_CALLING"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSIP_INV_STATE_CONNECTING"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSIP_INV_STATE_CONFIRMED"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSIP_INV_STATE_DISCONNECTED"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSUA_CALL_MEDIA_NONE"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSUA_CALL_MEDIA_ACTIVE"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSUA_CALL_MEDIA_LOCAL_HOLD"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSUA_CALL_MEDIA_REMOTE_HOLD"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSUA_CALL_MEDIA_ERROR"));
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsip_inv_state"));
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsua_call_media_status"));
    }

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn allowlist_is_fixed_and_duplicate_free() {
        let mut all: Vec<&str> = BINDGEN_ALLOWLIST_TYPES
            .iter()
            .chain(BINDGEN_ALLOWLIST_FUNCTIONS.iter())
            .chain(BINDGEN_ALLOWLIST_VARS.iter())
            .copied()
            .collect();
        let total_count = all.len();
        all.sort();
        all.dedup();
        assert_eq!(all.len(), total_count, "allowlist must be duplicate-free");
        assert!(!all.is_empty(), "allowlist must not be empty");
    }

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn bindings_output_path_is_well_known() {
        assert_eq!(BINDINGS_OUTPUT, "bindings.rs");
    }

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn platform_clang_defines_for_arm_little_endian() {
        assert_eq!(
            platform_clang_defines("aarch64-apple-darwin"),
            vec![
                "PJ_IS_LITTLE_ENDIAN=1".to_string(),
                "PJ_IS_BIG_ENDIAN=0".to_string(),
            ]
        );
        assert_eq!(
            platform_clang_defines("aarch64-unknown-linux-gnu"),
            vec![
                "PJ_IS_LITTLE_ENDIAN=1".to_string(),
                "PJ_IS_BIG_ENDIAN=0".to_string(),
            ]
        );
    }

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn platform_clang_defines_for_big_endian_arm() {
        assert_eq!(
            platform_clang_defines("armeb-unknown-linux-gnueabi"),
            vec![
                "PJ_IS_LITTLE_ENDIAN=0".to_string(),
                "PJ_IS_BIG_ENDIAN=1".to_string(),
            ]
        );
    }

    #[test]
// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn platform_clang_defines_for_x86_are_empty() {
        assert_eq!(
            platform_clang_defines("x86_64-unknown-linux-gnu"),
            Vec::<String>::new()
        );
        assert_eq!(
            platform_clang_defines("x86_64-pc-windows-msvc"),
            Vec::<String>::new()
        );
    }
}
