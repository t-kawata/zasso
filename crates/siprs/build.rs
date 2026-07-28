// [::TICKET::] P3-2: Bindgen build script — generates Rust FFI declarations
// from PJSIP C headers.
//
// The allowlist restricts generation to only the functions, types, and
// constants that siprs actually needs. This keeps compile times low and
// prevents accidental exposure of internal PJSIP symbols.
//
// [::STUB::] P4-2: Enable bindgen generation when `pjsua-native` feature
// is active. The stub type aliases in `src/ffi/bindings.rs` currently
// provide compile-time placeholders for all PJSIP types.
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
fn main() {
    // [::STUB::] P4-2: Uncomment when PJSIP library headers are available
    // in the build environment:
    //
    // #[cfg(feature = "pjsua-native")]
    // {
    //     let bindings = bindgen::Builder::default()
    //         .header("wrapper.h")
    //         .allowlist_function("pjsua_.*")
    //         .allowlist_function("pj_.*")
    //         .allowlist_type("pjsua_.*")
    //         .allowlist_type("pj_.*")
    //         .allowlist_var("PJSUA_.*")
    //         .allowlist_var("PJ_.*")
    //         .generate()
    //         .expect("bindgen failed — is PJSIP installed?");
    //
    //     bindings
    //         .write_to_file(std::env::current_dir().join("src/ffi/bindings_gen.rs"))
    //         .expect("failed to write bindings");
    // }
    //
    // println!("cargo:rerun-if-changed=wrapper.h");
}
