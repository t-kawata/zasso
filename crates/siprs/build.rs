// [::TICKET::] P3-2: Bindgen build script — generates Rust FFI declarations
// from PJSIP C headers.
//
// The allowlist restricts generation to the specific symbols siprs needs,
// keeping compile times low and preventing accidental exposure of internal
// PJSIP symbols.
//
// [::STUB::] P4-2: bindgen generation disabled; stub aliases in bindings.rs provide placeholders -- Enable bindgen with pjsua-native feature when PJSIP headers available in build environment
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
fn main() {
    // [::STUB::] P4-2: bindgen generation disabled -- Enable the pjsua-native
    // feature and configure the wrapper.h header path once PJSIP is installed.
    // The stub aliases in src/ffi/bindings.rs keep the crate compiling.
}
