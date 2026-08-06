// [::TICKET::] P3-2: Bindgen build script — generates Rust FFI declarations
// from PJSIP C headers.
//
// The allowlist restricts generation to the specific symbols siprs needs,
// keeping compile times low and preventing accidental exposure of internal
// PJSIP symbols.
//
// The deterministic pipeline logic (allowlist, header-root resolution, feature
// predicate) lives in src/build/build_script_bindgen.rs, which is included here
// verbatim and also compiled by the crate so `cargo test` covers it — build
// scripts themselves are not test targets.
// [::TICKET::] P3-2, P10-2, P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-2|P11-5) --for-spec --no-implementation-order`.
#[path = "src/build/build_script_bindgen.rs"]
mod build_script_bindgen;

// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
fn main() {
    emit_cargo_directive("cargo:rerun-if-env-changed=CARGO_FEATURE_PJSUA_NATIVE");
    emit_cargo_directive("cargo:rerun-if-changed=wrapper.h");
    emit_cargo_directive("cargo:rerun-if-env-changed=TARGET");

    if !pjsua_native_enabled() {
        // Default stub path: no bindgen, no external C library. The hand-written
        // aliases in src/ffi/bindings.rs keep the crate compiling.
        return;
    }

    // P10-2: coordinate PJSIP detection with the pjsua-native feature flag.
    // When the feature is on, resolve the prebuilt library dir and emit link
    // directives so the bindgen-generated bindings (P11-5) can link.
    if let Some(prebuilt_lib_dir) = resolve_prebuilt_lib_dir() {
        emit_link_directives(&prebuilt_lib_dir);
    } else {
        emit_cargo_directive(
            "cargo:warning=PJSIP not found — install pjsua2 or use the prebuilt pipeline",
        );
    }

    // P11-5: resolve the header root per RFC §28.1 and generate bindings.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|e| panic!("CARGO_MANIFEST_DIR not set by Cargo: {e}"));
    let target = std::env::var("TARGET").unwrap_or_default();
    let header_root =
        build_script_bindgen::resolve_header_root(std::path::Path::new(&manifest_dir), &target);
    match header_root {
        Some(root) => generate_bindings(&root),
        None => panic!(
            "pjsua-native enabled but no PJSIP headers found under \
             vendor/prebuilt/{target}/include or vendor/pjsip/include.\n\
             Install PJSIP per RFC §28.4 — Ubuntu: build-essential cmake \
             libasound2-dev libssl-dev libcrypto-dev libuuid-dev; macOS: \
             brew install pkg-config cmake; Windows: MSVC Build Tools + \
             vcpkg install libsrtp:x64-windows."
        ),
    }
}

/// Whether the `pjsua-native` Cargo feature is enabled.
///
/// Cargo sets `CARGO_FEATURE_<NAME>` for every enabled feature; the env var
/// name is the feature name upper-cased with `-` → `_`. The predicate is
/// extracted into `build_script_bindgen::feature_env_present` for testability.
// [::TICKET::] P10-2, P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-2|P11-5) --for-spec --no-implementation-order`.
fn pjsua_native_enabled() -> bool {
    build_script_bindgen::feature_env_present(std::env::var("CARGO_FEATURE_PJSUA_NATIVE"))
}

/// Runs bindgen against wrapper.h with the fixed allowlist and writes the
/// generated declarations to `OUT_DIR/bindings.rs`.
///
/// The include dir is passed as a clang arg so `#include <pjsua.h>` in
/// wrapper.h resolves against the RFC §28.1 header root. Failures panic with a
/// message naming the RFC §28.4 package list — never a raw clang/bindgen dump.
// [::TICKET::] P11-5, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11) --for-spec --no-implementation-order`.
fn generate_bindings(header_root: &std::path::Path) {
    let target = std::env::var("TARGET").unwrap_or_default();
    let mut builder = bindgen::Builder::default()
        .header("wrapper.h")
        .clang_arg(format!("-I{}", header_root.display()));
    for define in build_script_bindgen::platform_clang_defines(&target) {
        builder = builder.clang_arg(format!("-D{define}"));
    }
    let bindings = builder
        .allowlist_type(build_script_bindgen::BINDGEN_ALLOWLIST_TYPES.join("|"))
        .allowlist_function(build_script_bindgen::BINDGEN_ALLOWLIST_FUNCTIONS.join("|"))
        .allowlist_var(build_script_bindgen::BINDGEN_ALLOWLIST_VARS.join("|"))
        .generate()
        .unwrap_or_else(|e| {
            panic!(
                "bindgen failed against wrapper.h with include dir {}: {e}. \
                 Check the PJSIP install per RFC §28.4.",
                header_root.display()
            )
        });
    let out_dir = std::path::PathBuf::from(
        std::env::var("OUT_DIR").unwrap_or_else(|e| panic!("OUT_DIR not set by Cargo: {e}")),
    );
    bindings
        .write_to_file(out_dir.join(build_script_bindgen::BINDINGS_OUTPUT))
        .unwrap_or_else(|e| {
            panic!(
                "failed to write {}: {e}",
                build_script_bindgen::BINDINGS_OUTPUT
            )
        });
    emit_cargo_directive(&format!(
        "cargo:warning=P11-5: generated bindings from {}",
        header_root.display()
    ));
}

/// Resolves the prebuilt PJSIP `lib/` directory for the current target triple.
///
/// Follows RFC §28.1 search order step 1: `vendor/prebuilt/{target-triple}/lib/`.
/// Returns `None` when the directory is absent or holds no `libpjsua*` archive.
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
fn resolve_prebuilt_lib_dir() -> Option<std::path::PathBuf> {
    let target_triple = std::env::var("TARGET").ok()?;
    let lib_dir = std::path::PathBuf::from("vendor/prebuilt")
        .join(&target_triple)
        .join("lib");
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
    emit_cargo_directive(&format!(
        "cargo:rustc-link-search=native={}",
        lib_dir.display()
    ));
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
