// Integration test for C057: memory ownership across the FFI boundary.
//
// Simulates the §47 rule that a pj_str_t delivered inside a native callback
// scope must be copied immediately into Rust-owned memory. A PjOwnedStr copied
// from a callback-provided source remains valid after the callback frame is
// popped, and its ownership classification stays Rust-owned.

use siprs::ffi::pj_str::PjOwnedStr;
use siprs::model::{MemoryOwnership, MemoryOwnershipTag};

#[test]
// @verifies C057
// [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
fn callback_copied_str_outlives_callback_frame() -> Result<(), Box<dyn std::error::Error>> {
    // Simulate bytes delivered inside a native callback scope.
    let callback_frame = PjOwnedStr::new("from-callback");
    // Immediate Rust-owned copy (C057): copy before the frame is popped.
    let copied: Vec<u8> = callback_frame.as_str().as_bytes().to_vec();
    drop(callback_frame); // callback frame popped

    let copied_text = String::from_utf8(copied)?;
    let owned = PjOwnedStr::new(&copied_text);
    assert!(owned.classification().is_rust_owned());
    assert_eq!(owned.classification().ownership, MemoryOwnership::RustOwned);
    assert_eq!(owned.as_str(), "from-callback");
    Ok(())
}
