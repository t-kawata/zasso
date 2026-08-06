// [::TICKET::] P3-2: Bindgen build script — generates Rust FFI declarations
// from PJSIP C headers.
//
// The allowlist restricts generation to the specific symbols siprs needs,
// keeping compile times low and preventing accidental exposure of internal
// PJSIP symbols.
//
// [::STUB::] P11-5: PJSIP headers are not yet available in the build environment; bindgen generation is disabled (covers build.rs:8,11) -- Generate PJSIP bindings via bindgen behind the pjsua-native feature once PJSIP headers are available in the build environment, and uncomment the wrapper.h includes
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
fn main() {
    // feature and configure the wrapper.h header path once PJSIP is installed.
    // The stub aliases in src/ffi/bindings.rs keep the crate compiling.
}
