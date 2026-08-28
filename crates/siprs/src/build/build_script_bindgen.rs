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
// [::TICKET::] P17-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-3 --for-spec --no-implementation-order`.
pub const BINDGEN_ALLOWLIST_TYPES: &[&str] = &[
    // [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    // [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    // [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
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
    // P11-10: codec enumeration (PjsuaBackend::configure_codecs) and the
    // account-config structs the backend marshals.
    "pjsua_codec_info",
    "pjsua_acc_config",
    "pjsua_cred_info",
    "pjsua_acc_info",
    "pjsua_transport_config",
    // P16-2: the transport kind enum — `pjsua_transport_create` takes it as the
    // first argument and the `PJSIP_TRANSPORT_*` values are allowlisted below.
    "pjsip_transport_type_e",
    "pjsua_call_setting",
    "pjsua_msg_data",
    "pjsip_media_type",
    "pjsip_dialog",
    // P11-11: callback-bridge ABI — pjsua_config.cb and the types the 8
    // registered callbacks reference. pjsip_event must be a real struct (not an
    // opaque stub) so the shared `pjsip_event::call_state()` accessor reads the
    // call_state_info union member under pjsua-native.
    "pjsua_config",
    "pjsua_callback",
    "pjsip_event",
    "pjsip_rx_data",
    "pjsip_uri",
    "pjsip_transaction",
    "pjsua_reg_info",
    "pjsip_redirect_op",
    // P17-3 §62.23: P1/P2 callback types — on_transport_state reads the
    // transport id; the transport-state enum and info/result structs appear in
    // the P1/P2 callback signatures.
    "pjsip_transport",
    "pjsip_transport_state",
    "pjsip_transport_state_info",
    "pj_stun_nat_detect_result",
    // P17-2 §62.22: raw SIP capture module — the pjsip_module extension point
    // and the opaque endpoint / tx_data types its registration references.
    "pjsip_module",
    "pjsip_endpoint",
    "pjsip_tx_data",
    // P16-7 §62.16: the custom media port (RustMediaPort) and the frame/format
    // types its get_frame / put_frame callbacks exchange with the conf bridge.
    "pjmedia_port",
    "pjmedia_port_info",
    "pjmedia_frame",
    "pjmedia_format",
    "pjmedia_dir",
    "pjmedia_port_op",
    "pjmedia_frame_type",
    "pj_timestamp",
    "pj_pool_t",
    "pj_grp_lock_t",
    "pjsua_conf_port_info",
    // P16-8 §62.17: STUN/TURN/ICE wiring — the pjsua_config STUN/TURN members
    // and the pjsua_media_config ICE members the wiring reflects into.
    "pjsua_media_config",
    "pjsua_turn_config",
    "pjsua_turn_config_use",
    "pj_ice_sess_options",
    "pj_stun_auth_cred",
    "pj_stun_auth_cred_static",
    "pj_stun_auth_cred_type",
    "pj_stun_passwd_type",
    "pj_turn_tp_type",
];

/// Enum types generated as Rust enums (§62.33 / N0102).
///
/// PJSIP's `PJ_SUCCESS` / `PJSIP_INV_STATE_*` / `PJSUA_CALL_MEDIA_*` are C enum
/// enumerators that a type allowlist alone cannot emit as usable Rust variants.
/// These types are allowlisted here and generated with
/// `default_enum_style(Rust)` + `prepend_enum_name(false)` so code can match
/// `pjsip_inv_state::CALLING` etc. (P18-1 / N0102).
pub const BINDGEN_ENUM_TYPES: &[&str] = &[
    "pjsip_inv_state",
    "pjsip_tsx_state",
    "pjsip_transport_state",
    "pjsip_redirect_op",
    "pjsua_call_media_status",
    "pj_status_t",
];

/// Fixed allowlist of PJSIP calls siprs references.
///
/// `pjsua_call_get_info` anchors the call-info surface; P11-10 adds the
/// PjsuaBackend FFI symbols it drives.
pub const BINDGEN_ALLOWLIST_FUNCTIONS: &[&str] = &[
    // [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    // [::TICKET::] P16-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-7 --for-spec --no-implementation-order`.
    // [::TICKET::] P16-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-2 --for-spec --no-implementation-order`.
    "pjsua_call_get_info",
    "pjsua_enum_codecs",
    "pjsua_create",
    "pjsua_init",
    "pjsua_start",
    "pjsua_destroy",
    "pjsua_transport_create",
    // P16-2: transport teardown — pjsua_transport_close destroys a transport at
    // shutdown (§32 step 5).
    "pjsua_transport_close",
    "pjsua_acc_add",
    "pjsua_acc_del",
    "pjsua_acc_modify",
    "pjsua_acc_set_registration",
    "pjsua_acc_get_info",
    "pjsua_call_make_call",
    "pjsua_call_answer",
    "pjsua_call_hangup",
    "pjsua_call_send_dtmf",
    // P16-6: pjsua_call_dial_dtmf sends DTMF as an RFC 2833 payload (Inband).
    "pjsua_call_dial_dtmf",
    "pjsua_call_xfer",
    "pjsua_codec_set_priority",
    "pjsua_conf_connect",
    "pjsua_conf_disconnect",
    // P16-7 §62.16: the RustMediaPort (custom pjmedia_port) is registered into
    // the conf bridge via pjsua_conf_add_port (vendored PJSIP has no
    // pjsua_conf_set_callback). pjsua_call_get_conf_port resolves the call's
    // conf slot for the media wiring.
    "pjsua_conf_add_port",
    "pjsua_conf_remove_port",
    "pjsua_conf_get_active_ports",
    "pjsua_call_get_conf_port",
    // PX-3 §39/§62.16: pjsua_conf_add_port requires a non-NULL pj_pool_t
    // (PJ_ASSERT_RETURN(conf && pool && strm_port, PJ_EINVAL)), so the native
    // build must expose pjsua_pool_create to obtain the pool for registration.
    "pjsua_pool_create",
    // P11-11: hold/unhold FFI — pjsua_call_set_hold puts a call on hold and
    // pjsua_call_reinvite (default options) resumes the media on unhold.
    // pjsua_call_set_inactive does NOT exist in the vendored pjsua.h.
    "pjsua_call_set_hold",
    "pjsua_call_reinvite",
    // P17-2 §62.22: raw SIP module registration — pjsua_get_pjsip_endpt returns
    // the endpoint after pjsua_init; pjsip_endpt_register_module registers the
    // observation-only module.
    "pjsip_endpt_register_module",
    "pjsua_get_pjsip_endpt",
];

/// Fixed allowlist of PJSIP constants siprs references.
///
/// Mirrors the constants hand-declared in `src/ffi/bindings.rs` (PJ_SUCCESS /
/// PJ_EUNKNOWN, `PJSUA_CALL_*`, `PJSUA_REG_STATE_*`). P11-9 replaces the
/// hand-coded duplicates in error/state modules from this generated set.
pub const BINDGEN_ALLOWLIST_VARS: &[&str] = &[
    // P18-1 §62.32: PJ_SUCCESS/PJ_EUNKNOWN/PJ_ENOMEM/PJ_EINVALIDOP/PJ_EBUSY are
    // `enum pj_constants_` enumerators that bindgen cannot emit as free vars
    // (E0432/E0425); they live in crate::ffi::constants, not the allowlist.
    // P16-2: pjsip_transport_type_e enumerators — the transport-kind constants
    // the wiring maps `TransportKind` into before calling pjsua_transport_create.
    "PJSIP_TRANSPORT_UDP",
    "PJSIP_TRANSPORT_TCP",
    "PJSIP_TRANSPORT_TLS",
    // PX-3 §39/§62.16: pjmedia constants the RustMediaPort adapter uses to build
    // a pjmedia_port_info.fmt (PCM, audio type, audio detail) for conf_add_port.
    "PJMEDIA_FORMAT_PCM",
    "PJMEDIA_TYPE_AUDIO",
    "PJMEDIA_FORMAT_DETAIL_AUDIO",
    // P18-1 §62.32: PJSUA_CALL_NULL is absent from the vendored tree; the
    // sentinel lives in crate::ffi::constants. pjsua_call_media_status and
    // pjsip_inv_state enumerators are generated as Rust enums via
    // BINDGEN_ENUM_TYPES (N0102), so their consts are not allowlisted here.
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
    // P11-10 / P18-1 §62.32: the plain-password credential constant
    // PJSIP_CRED_DATA_PLAIN_PASSWD (sip_auth.h:109) is an enumerator of
    // pjsip_cred_data_type, which bindgen does not emit as a free var — it lives
    // in crate::ffi::constants alongside the pj_status_t codes.
    // P16-8 §62.17: TURN connection-type constants and config-selector / auth
    // constants the STUN/TURN wiring references.
    "PJ_TURN_TP_UDP",
    "PJ_TURN_TP_TCP",
    "PJ_TURN_TP_TLS",
    "PJSUA_TURN_CONFIG_USE_DEFAULT",
    "PJSUA_TURN_CONFIG_USE_CUSTOM",
    "PJ_STUN_AUTH_CRED_STATIC",
    "PJ_STUN_PASSWD_PLAIN",
    // P17-2 §62.22: pjsip_module priority / packet-length boundary constants,
    // plus the pj_bool_t truth values the observation-only handlers return.
    "PJSIP_MOD_PRIORITY_APPLICATION",
    "PJSIP_MAX_PKT_LEN",
    "PJ_TRUE",
    "PJ_FALSE",
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

/// Which source the 4-stage PJSIP resolution selected (§62.35 / N0104).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedPjsip {
    /// Stage 1 — `vendor/prebuilt/<target>/lib` (link dir).
    Prebuilt(std::path::PathBuf),
    /// Stage 2 — a system PJSIP install (header root).
    System(std::path::PathBuf),
    /// Stage 3 — vendored-source CMake build (header root).
    Built(std::path::PathBuf),
}

/// Resolve PJSIP through the §28.1 / §62.35 4-stage pipeline.
///
/// `prebuilt_lib` is the stage-1 prebuilt lib dir, `system_header_root` the
/// stage-2 pkg-config/env result, and `cmake_available` whether stage 3 can
/// build the vendored source. When all three are unavailable the pipeline
/// **fails stop** — warning-and-continue is prohibited (C142).
pub fn resolve_pjsip(
    prebuilt_lib: Option<std::path::PathBuf>,
    system_header_root: Option<std::path::PathBuf>,
    cmake_available: bool,
) -> ResolvedPjsip {
    if let Some(lib) = prebuilt_lib {
        return ResolvedPjsip::Prebuilt(lib);
    }
    if let Some(header) = system_header_root {
        return ResolvedPjsip::System(header);
    }
    if cmake_available {
        return ResolvedPjsip::Built(std::path::PathBuf::new());
    }
    panic!(
        "pjsua-native enabled but no PJSIP obtainable: prebuilt absent, \
         system absent, cmake unavailable (fail-stop)"
    );
}

/// Derive the static link set from a resolved `lib/` directory (§62.34 / N0103).
///
/// `libpjproject.a` (or `pjproject.lib` on Windows) wins as the single
/// integrated archive; otherwise every `lib*.a` stem is returned sorted. The
/// result is never a hardcoded module list — it is derived from the directory.
pub fn derive_link_set(lib_dir: &std::path::Path) -> Vec<String> {
    if lib_dir.join("libpjproject.a").is_file() || lib_dir.join("pjproject.lib").is_file() {
        return vec!["pjproject".to_string()];
    }
    let mut stems: Vec<String> = std::fs::read_dir(lib_dir)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|entry| {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    name.strip_prefix("lib")
                        .and_then(|stem| stem.strip_suffix(".a"))
                        .map(|s| s.to_string())
                })
                .collect()
        })
        .unwrap_or_default();
    stems.sort();
    stems
}

/// ELF-linker group wrapper for the link set, or `None` for linkers that
/// resolve multi-path archives themselves (macOS ld64, MSVC link.exe).
pub fn link_group_wrapper(target: &str) -> Option<(&'static str, &'static str)> {
    if target.contains("linux") || target.contains("android") {
        Some(("--start-group", "--end-group"))
    } else {
        None
    }
}

/// Whether `SIPRS_STAGE_PREBUILT=1` enables the producer staging mode.
///
/// A normal consumer build never writes into `vendor/prebuilt/` (§5.2(b)).
pub fn should_stage_prebuilt(env_value: Result<String, std::env::VarError>) -> bool {
    matches!(env_value.as_deref(), Ok("1"))
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
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
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
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn feature_env_present_reflects_cargo_env() {
        assert!(feature_env_present(Ok(String::from("1"))));
        assert!(!feature_env_present(Err(std::env::VarError::NotPresent)));
    }

    #[test]
    // @verifies C111
    // [::TICKET::] P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-10 --for-spec --no-implementation-order`.
    fn allowlist_includes_pjsua_backend_ffi() {
        // Every FFI symbol PjsuaBackend drives must be bindgen-allowlisted so the
        // generated bindings expose it under pjsua-native (C111).
        let required = [
            "pjsua_call_get_info",
            "pjsua_create",
            "pjsua_init",
            "pjsua_start",
            "pjsua_destroy",
            "pjsua_transport_create",
            "pjsua_acc_add",
            "pjsua_acc_del",
            "pjsua_acc_modify",
            "pjsua_acc_set_registration",
            "pjsua_call_make_call",
            "pjsua_call_answer",
            "pjsua_call_hangup",
            "pjsua_call_send_dtmf",
            "pjsua_call_xfer",
            "pjsua_codec_set_priority",
            "pjsua_conf_connect",
            "pjsua_conf_disconnect",
        ];
        for sym in required {
            assert!(
                BINDGEN_ALLOWLIST_FUNCTIONS.contains(&sym),
                "BINDGEN_ALLOWLIST_FUNCTIONS must include {sym}"
            );
        }
    }

    #[test]
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
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
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn resolve_header_root_returns_none_when_no_headers() -> std::io::Result<()> {
        let root = std::env::temp_dir().join(format!("siprs-empty-{}", std::process::id()));
        assert_eq!(resolve_header_root(&root, "x86_64-unknown-linux-gnu"), None);
        let _ = std::fs::remove_dir_all(&root);
        Ok(())
    }

    #[test]
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
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
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn allowlist_covers_stub_surface() {
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pj_str_t"));
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsua_call_info"));
        assert!(BINDGEN_ALLOWLIST_FUNCTIONS.contains(&"pjsua_call_get_info"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSUA_CALL_CONFIRMED"));
    }

    #[test]
    // [::TICKET::] P16-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-8 --for-spec --no-implementation-order`.
    fn allowlist_covers_stun_turn_ice_surface() {
        // P16-8 §62.17: every STUN/TURN/ICE type and constant the wiring
        // references must be bindgen-allowlisted so the generated bindings
        // expose them under pjsua-native.
        for ty in [
            "pjsua_media_config",
            "pjsua_turn_config",
            "pjsua_turn_config_use",
            "pj_ice_sess_options",
            "pj_stun_auth_cred",
            "pj_stun_auth_cred_static",
            "pj_stun_auth_cred_type",
            "pj_stun_passwd_type",
            "pj_turn_tp_type",
        ] {
            assert!(
                BINDGEN_ALLOWLIST_TYPES.contains(&ty),
                "BINDGEN_ALLOWLIST_TYPES must include {ty}"
            );
        }
        for sym in [
            "PJ_TURN_TP_UDP",
            "PJ_TURN_TP_TCP",
            "PJ_TURN_TP_TLS",
            "PJSUA_TURN_CONFIG_USE_DEFAULT",
            "PJSUA_TURN_CONFIG_USE_CUSTOM",
            "PJ_STUN_AUTH_CRED_STATIC",
            "PJ_STUN_PASSWD_PLAIN",
        ] {
            assert!(
                BINDGEN_ALLOWLIST_VARS.contains(&sym),
                "BINDGEN_ALLOWLIST_VARS must include {sym}"
            );
        }
    }

    // [::TICKET::] P11-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-9 --for-spec --no-implementation-order`.
    #[test]
    // [::TICKET::] P11-9, P11-11, P12-7, P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-9|P11-11|P12-7|P18-1) --for-spec --no-implementation-order`.
    fn allowlist_covers_p11_9_constant_surface() {
        // P11-9: the error/state mapping modules consume these symbols from
        // ffi::bindings. A symbol missing from the allowlist fails this test,
        // so a missing bindgen symbol surfaces as a compile error, never a
        // silent fallback to a hardcoded value.
        //
        // P18-1 (§62.33/N0102): pjsip_inv_state and pjsua_call_media_status are
        // generated as Rust enums via BINDGEN_ENUM_TYPES (not consts-style
        // vars), so the VARS asserts moved to the enum-allowlist asserts.
        // P18-1 §62.32: the pj_status_t error codes moved to
        // crate::ffi::constants (bindgen cannot emit enum enumerators as vars),
        // so the allowlist no longer carries them.
        assert!(!BINDGEN_ALLOWLIST_VARS.contains(&"PJ_ENOMEM"));
        assert!(!BINDGEN_ALLOWLIST_VARS.contains(&"PJ_EINVALIDOP"));
        assert!(!BINDGEN_ALLOWLIST_VARS.contains(&"PJ_EBUSY"));
        assert!(BINDGEN_ENUM_TYPES.contains(&"pjsip_inv_state"));
        assert!(BINDGEN_ENUM_TYPES.contains(&"pjsua_call_media_status"));
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsip_inv_state"));
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsua_call_media_status"));
    }

    #[test]
    // [::TICKET::] P11-11, P16-6, PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-11|P16-6|PX-3) --for-spec --no-implementation-order`.
    fn allowlist_covers_p11_11_callback_bridge_surface() {
        // Every callback-bridge type and hold/unhold symbol register_callbacks /
        // PjsuaBackend reference must be bindgen-allowlisted so the generated
        // bindings expose them under pjsua-native (C050, C054).
        for ty in [
            "pjsua_config",
            "pjsua_callback",
            "pjsip_event",
            "pjsip_rx_data",
            "pjsip_uri",
            "pjsip_transaction",
            "pjsua_reg_info",
            "pjsip_redirect_op",
        ] {
            assert!(
                BINDGEN_ALLOWLIST_TYPES.contains(&ty),
                "BINDGEN_ALLOWLIST_TYPES must include {ty}"
            );
        }
        for sym in [
            "pjsua_call_set_hold",
            "pjsua_call_reinvite",
            // P16-6: both DTMF send entry points (§62.15 Q5) must be generated.
            "pjsua_call_send_dtmf",
            "pjsua_call_dial_dtmf",
        ] {
            assert!(
                BINDGEN_ALLOWLIST_FUNCTIONS.contains(&sym),
                "BINDGEN_ALLOWLIST_FUNCTIONS must include {sym}"
            );
        }
    }

    #[test]
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
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

    /// @verifies C123
    #[test]
    // [::TICKET::] P17-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-2 --for-spec --no-implementation-order`.
    fn allowlist_includes_raw_sip_module_symbols() {
        // Precondition: the raw SIP module's FFI surface is covered by the fixed allowlist.
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsip_module"));
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsip_endpoint"));
        assert!(BINDGEN_ALLOWLIST_FUNCTIONS.contains(&"pjsip_endpt_register_module"));
        assert!(BINDGEN_ALLOWLIST_FUNCTIONS.contains(&"pjsua_get_pjsip_endpt"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSIP_MOD_PRIORITY_APPLICATION"));
        assert!(BINDGEN_ALLOWLIST_VARS.contains(&"PJSIP_MAX_PKT_LEN"));
    }

    #[test]
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
    fn bindings_output_path_is_well_known() {
        assert_eq!(BINDINGS_OUTPUT, "bindings.rs");
    }

    #[test]
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
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
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
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
    // [::TICKET::] P11-5, P11-11, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11|P12-7) --for-spec --no-implementation-order`.
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

    // ── P18-1 §62.31–62.35: round-4 build repair ─────────────────────────

    /// @verifies C140
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn bindgen_enum_types_cover_rust_enum_surface() {
        // C140 (§62.33): enum types are generated as Rust enums via
        // BINDGEN_ENUM_TYPES + default_enum_style(Rust) + prepend_enum_name(false).
        for ty in [
            "pjsip_inv_state",
            "pjsip_tsx_state",
            "pjsip_transport_state",
            "pjsip_redirect_op",
            "pjsua_call_media_status",
            "pj_status_t",
        ] {
            assert!(
                BINDGEN_ENUM_TYPES.contains(&ty),
                "BINDGEN_ENUM_TYPES must include {ty}"
            );
        }
        // C140 invariant: the allowlist set stays the single bindgen entry — the
        // full pjsua_config (turn_cfg/turn_cfg_use) is a type allowlist member.
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsua_config"));
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsua_turn_config"));
        assert!(BINDGEN_ALLOWLIST_TYPES.contains(&"pjsua_turn_config_use"));
    }

    /// @verifies C139
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn allowlist_vars_use_real_credential_symbol() {
        // C139 (§62.32): PJ_CRED_DATA_PLAIN_PASSWD is absent from the vendored
        // tree; the real symbol PJSIP_CRED_DATA_PLAIN_PASSWD (sip_auth.h:109) is
        // an enum enumerator that bindgen cannot emit as a var — it lives in
        // crate::ffi::constants. PJSUA_CALL_NULL is likewise dropped from the
        // allowlist (moved to the crate-internal constants module, N0101).
        assert!(
            !BINDGEN_ALLOWLIST_VARS.contains(&"PJSIP_CRED_DATA_PLAIN_PASSWD"),
            "PJSIP_CRED_DATA_PLAIN_PASSWD is not emit-able; use constants::PJSIP_CRED_DATA_PLAIN_PASSWD"
        );
        assert!(
            !BINDGEN_ALLOWLIST_VARS.contains(&"PJ_CRED_DATA_PLAIN_PASSWD"),
            "stale PJ_CRED_DATA_PLAIN_PASSWD must be removed"
        );
        assert!(
            !BINDGEN_ALLOWLIST_VARS.contains(&"PJSUA_CALL_NULL"),
            "PJSUA_CALL_NULL is absent from vendored headers; use constants::PJSUA_CALL_NULL"
        );
    }

    /// @verifies C141
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn derive_link_set_prefers_integrated_archive() {
        // C141 (§62.34): libpjproject.a present → single "pjproject" stem.
        let root = std::env::temp_dir().join(format!("siprs-link-archive-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("libpjproject.a"), b"").unwrap();
        std::fs::write(root.join("libpjsip.a"), b"").unwrap();
        assert_eq!(derive_link_set(&root), vec!["pjproject".to_string()]);
        let _ = std::fs::remove_dir_all(&root);
    }

    /// @verifies C141
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn derive_link_set_enumerates_individual_stems_sorted() {
        // C141 (§62.34): no integrated archive → every lib*.a stem, sorted.
        let root = std::env::temp_dir().join(format!("siprs-link-stems-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("libpjlib-util.a"), b"").unwrap();
        std::fs::write(root.join("libpjsip.a"), b"").unwrap();
        std::fs::write(root.join("libpjmedia.a"), b"").unwrap();
        assert_eq!(
            derive_link_set(&root),
            vec![
                "pjlib-util".to_string(),
                "pjmedia".to_string(),
                "pjsip".to_string(),
            ]
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    /// @verifies C141
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn derive_link_set_returns_empty_for_libless_dir() {
        // C141: a directory with no lib*.a files yields an empty link set, so
        // build.rs emits only the link-search directive.
        let root = std::env::temp_dir().join(format!("siprs-link-libless-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("readme.txt"), b"").unwrap();
        assert!(derive_link_set(&root).is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    /// @verifies C141
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn link_group_wrapper_for_linux_only() {
        // C141 (§62.34): --start-group/--end-group wrap only on ELF linkers.
        assert_eq!(
            link_group_wrapper("x86_64-unknown-linux-gnu"),
            Some(("--start-group", "--end-group"))
        );
        assert_eq!(
            link_group_wrapper("aarch64-apple-darwin"),
            None,
            "macOS ld64 resolves multi-path archives, no group wrapper"
        );
        assert_eq!(link_group_wrapper("x86_64-pc-windows-msvc"), None);
    }

    /// @verifies C138
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn resolve_pjsip_prefers_prebuilt_over_system() {
        // C138 (§62.35): §28.1 step 1 (prebuilt lib dir) is consulted before
        // the system install — prebuilt-first order preserved.
        let prebuilt = std::path::PathBuf::from("/tmp/p18-1/prebuilt/lib");
        let resolved = resolve_pjsip(
            Some(prebuilt.clone()),
            Some("/tmp/p18-1/system".into()),
            true,
        );
        assert_eq!(resolved, ResolvedPjsip::Prebuilt(prebuilt));
    }

    /// @verifies C142
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn resolve_pjsip_uses_system_before_vendored_build() {
        // C142 (§62.35): system (stage 2) precedes the vendored-source build
        // (stage 3).
        let resolved = resolve_pjsip(None, Some("/tmp/p18-1/system".into()), true);
        assert_eq!(resolved, ResolvedPjsip::System("/tmp/p18-1/system".into()));
    }

    /// @verifies C142
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn resolve_pjsip_fails_stop_when_unobtainable() {
        // C142 invariant (§62.35): no prebuilt, no system, no cmake → panic;
        // warning-and-continue is prohibited.
        let result = std::panic::catch_unwind(|| resolve_pjsip(None, None, false));
        assert!(
            result.is_err(),
            "fail-stop: must panic, never warning-and-continue"
        );
    }

    /// @verifies C142
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn should_stage_prebuilt_only_on_explicit_1() {
        // §5.2(b): SIPRS_STAGE_PREBUILT=1 enables staging; unset/0 keeps the
        // consumer build read-only over vendor/.
        assert!(should_stage_prebuilt(Ok("1".to_string())));
        assert!(!should_stage_prebuilt(Ok("0".to_string())));
        assert!(!should_stage_prebuilt(Err(std::env::VarError::NotPresent)));
    }
}
