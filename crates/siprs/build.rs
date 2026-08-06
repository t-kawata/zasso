// [::TICKET::] P3-2: Bindgen build script — generates Rust FFI declarations
// from PJSIP C headers.
//
// The allowlist restricts generation to the specific symbols siprs needs,
// keeping compile times low and preventing accidental exposure of internal
// PJSIP symbols.
//
// [::STUB::] P11-5: PJSIP headers are not yet available in the build environment; bindgen generation is disabled (covers build.rs:8,11) -- Generate PJSIP bindings via bindgen behind the pjsua-native feature once PJSIP headers are available in the build environment, and uncomment the wrapper.h includes
// [::TICKET::] P3-2, P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-2) --for-spec --no-implementation-order`.
fn main() {
    // P10-2: coordinate PJSIP detection with the pjsua-native feature flag.
    // When the feature is on, resolve the prebuilt library dir and emit link
    // directives so the bindgen-generated bindings (P11-5) can link.
    if pjsua_native_enabled() {
        if let Some(prebuilt_lib_dir) = resolve_prebuilt_lib_dir() {
            emit_link_directives(&prebuilt_lib_dir);
        } else {
            emit_cargo_directive(
                "cargo:warning=PJSIP not found — install pjsua2 or use the prebuilt pipeline",
            );
        }
    }
    // P11-5: bindgen generation remains disabled until PJSIP headers are available.
    // The stub aliases in src/ffi/bindings.rs keep the crate compiling.
}

/// Whether the `pjsua-native` Cargo feature is enabled.
///
/// Cargo sets `CARGO_FEATURE_<NAME>` for every enabled feature; the env var
/// name is the feature name upper-cased with `-` → `_`.
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
fn pjsua_native_enabled() -> bool {
    std::env::var("CARGO_FEATURE_PJSUA_NATIVE").is_ok()
}

/// Resolves the prebuilt PJSIP `lib/` directory for the current target triple.
///
/// Follows RFC §28.1 search order step 1: `vendor/prebuilt/{target-triple}/lib/`.
/// Returns `None` when the directory is absent or holds no `libpjsua*` archive.
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
fn resolve_prebuilt_lib_dir() -> Option<std::path::PathBuf> {
    let target_triple = std::env::var("TARGET").ok()?;
    let lib_dir = std::path::PathBuf::from("vendor/prebuilt").join(&target_triple).join("lib");
    if lib_dir.is_dir() && contains_pjsua_library(&lib_dir) {
        Some(lib_dir)
    } else {
        None
    }
}

/// Whether `lib_dir` contains a `libpjsua*` static archive.
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
fn contains_pjsua_library(lib_dir: &std::path::Path) -> bool {
    std::fs::read_dir(lib_dir)
        .map(|entries| {
            entries.flatten().any(|entry| {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                name.contains("pjsua") && (name.ends_with(".a") || name.ends_with(".lib"))
            })
        })
        .unwrap_or(false)
}

/// Emits the `cargo:rustc-link-*` directives for a resolved prebuilt `lib/` dir.
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
fn emit_link_directives(lib_dir: &std::path::Path) {
    emit_cargo_directive(&format!("cargo:rustc-link-search=native={}", lib_dir.display()));
    emit_cargo_directive("cargo:rustc-link-lib=static=pjsua2");
}

/// Writes one `cargo:` directive to stdout — the Cargo build-script protocol.
///
/// Cargo parses stdout lines beginning with `cargo:` as build instructions
/// (link-search, link-lib, warning, …). This is the only channel a build
/// script has to communicate with Cargo, so the write must go to stdout
/// verbatim; a write failure means the build output is already unrecoverable.
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
fn emit_cargo_directive(directive: &str) {
    use std::io::Write;
    let stdout = std::io::stdout();
    let mut handle = stdout.lock();
    // stdout write errors cannot be recovered in a build script — the process
    // is about to exit with a compile error anyway, so a best-effort write
    // (ignoring the Result) is the correct behavior.
    let _ = writeln!(handle, "{directive}");
}
