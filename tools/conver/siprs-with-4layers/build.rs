// [::TICKET::] P3-2: Bindgen build script — generates Rust FFI declarations
// from PJSIP C headers.
//
// The allowlist restricts generation to the specific symbols siprs needs,
// keeping compile times low and preventing accidental exposure of internal
// PJSIP symbols.
//
// The deterministic pipeline logic (allowlist, header-root resolution, feature
// predicate, enum/const generation, link-set derivation, 4-stage resolution)
// lives in src/build/build_script_bindgen.rs, which is included here verbatim
// and also compiled by the crate so `cargo test` covers it — build scripts
// themselves are not test targets.
// [::TICKET::] P3-2, P10-2, P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-2|P11-5) --for-spec --no-implementation-order`.
#[path = "src/build/build_script_bindgen.rs"]
mod build_script_bindgen;

// [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn main() {
    emit_cargo_directive("cargo:rerun-if-env-changed=CARGO_FEATURE_PJSUA_NATIVE");
    emit_cargo_directive("cargo:rerun-if-changed=wrapper.h");
    emit_cargo_directive("cargo:rerun-if-env-changed=TARGET");
    emit_cargo_directive("cargo:rerun-if-env-changed=SIPRS_STAGE_PREBUILT");

    if !pjsua_native_enabled() {
        // Default stub path: no bindgen, no external C library. The hand-written
        // aliases in src/ffi/bindings.rs keep the crate compiling.
        return;
    }

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|e| panic!("CARGO_MANIFEST_DIR not set by Cargo: {e}"));
    let target = std::env::var("TARGET").unwrap_or_default();
    resolve_and_generate(std::path::Path::new(&manifest_dir), &target);
}

/// Orchestrates the §62.35 4-stage PJSIP resolution and drives bindgen.
///
/// Reads as prose: "resolve PJSIP through prebuilt → system → vendored-source
/// build → fail-stop, then emit link directives and generate bindings; in
/// staging mode, copy the vendored-build artifacts into vendor/prebuilt."
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn resolve_and_generate(manifest_dir: &std::path::Path, target: &str) {
    let prebuilt_lib = resolve_prebuilt_lib_dir();
    let system_header = if prebuilt_lib.is_none() {
        resolve_system_header_root()
    } else {
        None
    };

    match build_script_bindgen::resolve_pjsip(prebuilt_lib, system_header, cmake_available()) {
        build_script_bindgen::ResolvedPjsip::Prebuilt(lib_dir) => {
            let include_dir = build_script_bindgen::resolve_header_root(manifest_dir, target)
                .unwrap_or_else(|| {
                    panic!("prebuilt lib present but header root missing for {target}")
                });
            emit_link_directives(&lib_dir, target);
            generate_bindings(&include_dir);
        }
        build_script_bindgen::ResolvedPjsip::System(header_root) => {
            emit_system_deps(target);
            generate_bindings(&header_root);
        }
        build_script_bindgen::ResolvedPjsip::Built(_) => {
            let (lib_dir, include_dir) = build_vendored_source(manifest_dir, target);
            emit_link_directives(&lib_dir, target);
            generate_bindings(&include_dir);
            if build_script_bindgen::should_stage_prebuilt(std::env::var("SIPRS_STAGE_PREBUILT")) {
                stage_prebuilt(manifest_dir, target, &lib_dir, &include_dir);
            }
        }
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
///
/// P18-1 (§62.33): enum types are generated as Rust enums via
/// `BINDGEN_ENUM_TYPES` + `default_enum_style(Rust)` + `prepend_enum_name(false)`,
/// so `pjsip_inv_state::CALLING` etc. resolve to real enum variants.
// [::TICKET::] P11-5, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-5|P11-11) --for-spec --no-implementation-order`.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn generate_bindings(header_root: &std::path::Path) {
    let target = std::env::var("TARGET").unwrap_or_default();
    let mut builder = bindgen::Builder::default()
        .header("wrapper.h")
        .clang_arg(format!("-I{}", header_root.display()))
        .default_enum_style(bindgen::EnumVariation::Rust {
            non_exhaustive: false,
        })
        .prepend_enum_name(false);
    for define in build_script_bindgen::platform_clang_defines(&target) {
        builder = builder.clang_arg(format!("-D{define}"));
    }
    let bindings = builder
        .allowlist_type(build_script_bindgen::BINDGEN_ALLOWLIST_TYPES.join("|"))
        .allowlist_type(build_script_bindgen::BINDGEN_ENUM_TYPES.join("|"))
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

/// Stage-2 system PJSIP header-root detection (pkg-config, then common paths).
///
/// PJSIP 2.17.0's pkg-config name is `libpjproject`. Falls back to the standard
/// system include locations so a distro-installed PJSIP is found without
/// pkg-config metadata.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn resolve_system_header_root() -> Option<std::path::PathBuf> {
    if let Ok(output) = std::process::Command::new("pkg-config")
        .args(["--cflags-only-I", "libpjproject"])
        .output()
    {
        if output.status.success() {
            let flags = String::from_utf8_lossy(&output.stdout);
            if let Some(include) = flags.split_whitespace().find_map(|f| f.strip_prefix("-I")) {
                return Some(std::path::PathBuf::from(include));
            }
        }
    }
    for candidate in [
        "/usr/include",
        "/usr/local/include",
        "/opt/homebrew/include",
    ] {
        if std::path::Path::new(candidate).join("pjsua.h").is_file() {
            return Some(std::path::PathBuf::from(candidate));
        }
    }
    None
}

/// Whether the `cmake` binary is on PATH for the vendored-source build.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn cmake_available() -> bool {
    std::process::Command::new("cmake")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Builds the vendored PJSIP source with CMake into `OUT_DIR` (§62.35 stage 3).
///
/// Returns `(lib_dir, include_dir)` for the emitted link set and bindgen header
/// root. Fails the build on any cmake error — no warning-and-continue.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn build_vendored_source(
    manifest_dir: &std::path::Path,
    target: &str,
) -> (std::path::PathBuf, std::path::PathBuf) {
    let vendor_src = manifest_dir.join("vendor/pjsip");
    let out_dir = std::path::PathBuf::from(
        std::env::var("OUT_DIR").unwrap_or_else(|e| panic!("OUT_DIR not set by Cargo: {e}")),
    );
    let build_dir = out_dir.join(format!("pjsip-build-{target}"));
    let configure = std::process::Command::new("cmake")
        .arg("-S")
        .arg(&vendor_src)
        .arg("-B")
        .arg(&build_dir)
        .arg("-DPJ_AUTOCONF=1")
        .arg("-DCMAKE_BUILD_TYPE=Release")
        .status()
        .unwrap_or_else(|e| panic!("cmake configure failed to start: {e}"));
    if !configure.success() {
        panic!(
            "cmake configure failed for vendored PJSIP at {}",
            vendor_src.display()
        );
    }
    let build = std::process::Command::new("cmake")
        .arg("--build")
        .arg(&build_dir)
        .status()
        .unwrap_or_else(|e| panic!("cmake build failed to start: {e}"));
    if !build.success() {
        panic!(
            "cmake build failed for vendored PJSIP at {}",
            vendor_src.display()
        );
    }
    (build_dir.join("lib"), build_dir.join("include"))
}

/// Copies a vendored-source build into `vendor/prebuilt/<target>` (§5.2(b)).
///
/// Only runs when `SIPRS_STAGE_PREBUILT=1`; a normal consumer build never
/// writes into the vendor tree.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn stage_prebuilt(
    manifest_dir: &std::path::Path,
    target: &str,
    lib_dir: &std::path::Path,
    include_dir: &std::path::Path,
) {
    let dest = manifest_dir.join("vendor/prebuilt").join(target);
    let dest_lib = dest.join("lib");
    let dest_include = dest.join("include");
    std::fs::create_dir_all(&dest_lib)
        .unwrap_or_else(|e| panic!("stage_prebuilt: create {} failed: {e}", dest_lib.display()));
    std::fs::create_dir_all(&dest_include).unwrap_or_else(|e| {
        panic!(
            "stage_prebuilt: create {} failed: {e}",
            dest_include.display()
        )
    });
    copy_directory_contents(include_dir, &dest_include);
    copy_directory_contents(lib_dir, &dest_lib);
}

/// Copies every file from `src` into `dst` (recursively) for the staging mode.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn copy_directory_contents(src: &std::path::Path, dst: &std::path::Path) {
    let entries = std::fs::read_dir(src).unwrap_or_else(|e| {
        panic!(
            "copy_directory_contents: read {} failed: {e}",
            src.display()
        )
    });
    for entry in entries.flatten() {
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            std::fs::create_dir_all(&to)
                .unwrap_or_else(|e| panic!("mkdir {} failed: {e}", to.display()));
            copy_directory_contents(&from, &to);
        } else {
            std::fs::copy(&from, &to).unwrap_or_else(|e| {
                panic!("copy {} → {} failed: {e}", from.display(), to.display())
            });
        }
    }
}

/// Emits the `cargo:rustc-link-*` directives for a resolved `lib/` directory.
///
/// The link set is derived from the directory (§62.34): `libpjproject.a` wins
/// as a single `static=pjproject`, otherwise every `lib*.a` stem is emitted
/// sorted. Linux targets wrap the set in `--start-group`/`--end-group` to
/// resolve pjmedia ↔ pjmedia-codec ↔ pjlib-util cycles. Target-specific system
/// dependencies follow.
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn emit_link_directives(lib_dir: &std::path::Path, target: &str) {
    emit_cargo_directive(&format!(
        "cargo:rustc-link-search=native={}",
        lib_dir.display()
    ));
    if let Some((start, _)) = build_script_bindgen::link_group_wrapper(target) {
        emit_cargo_directive(&format!("cargo:rustc-link-arg=-Wl,{start}"));
    }
    for stem in build_script_bindgen::derive_link_set(lib_dir) {
        emit_cargo_directive(&format!("cargo:rustc-link-lib=static={stem}"));
    }
    if let Some((_, end)) = build_script_bindgen::link_group_wrapper(target) {
        emit_cargo_directive(&format!("cargo:rustc-link-arg=-Wl,{end}"));
    }
    emit_system_deps(target);
}

/// Emits the target-specific system libraries PJSIP links against (§62.34).
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
fn emit_system_deps(target: &str) {
    if target.contains("apple") {
        for framework in ["CoreFoundation", "CoreAudio", "Security"] {
            emit_cargo_directive(&format!("cargo:rustc-link-lib=framework={framework}"));
        }
    } else if target.contains("linux") || target.contains("android") {
        for lib in [
            "asound", "ssl", "crypto", "uuid", "pthread", "m", "dl", "rt",
        ] {
            emit_cargo_directive(&format!("cargo:rustc-link-lib={lib}"));
        }
    } else if target.contains("windows") {
        for lib in ["ws2_32", "ole32", "userenv", "winmm", "iphlpapi", "crypt32"] {
            emit_cargo_directive(&format!("cargo:rustc-link-lib={lib}"));
        }
    }
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
