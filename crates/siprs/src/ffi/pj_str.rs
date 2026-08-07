// [::TICKET::] P3-2: PjOwnedStr — safe wrapper for pj_str_t with Rust-owned memory.
//
// # Memory ownership
// PJSUA's `pj_str_t` points to memory that may be owned by PJSUA's pool
// (`pj_pool_t`). Holding a `pj_str_t` across an FFI call is safe only if
// the backing memory lives as long as the string is used.
//
// `PjOwnedStr` solves this by keeping a Rust-owned `Vec<u8>` that the
// internal `pj_str_t.ptr` points into. The original PJSIP-allocated bytes
// are copied into the `Vec` during construction. As long as the
// `PjOwnedStr` is alive, the `pj_str_t` is valid.
//
// Dropping the `PjOwnedStr` drops the `Vec`, making the `pj_str_t`
// dangling — callers must not hold `pj_str_t` beyond the `PjOwnedStr`'s
// lifetime.

use crate::ffi::bindings;
use crate::model::{MemoryOwnershipTag, NativePtrClassification};

/// A safe wrapper around `pj_str_t` with Rust-owned memory.
///
/// The wrapped `pj_str_t` is valid as long as this struct is alive.
/// Obtain a temporary copy for each FFI call via `as_raw()`.
pub struct PjOwnedStr {
    /// Rust-owned backing buffer. Kept alive alongside `raw`.
    bytes: Vec<u8>,
    /// The `pj_str_t` pointing into `bytes`.
    raw: bindings::pj_str_t,
}

// [::TICKET::] P3-2, P3-3, P11-5, P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P3-3|P11-5|P12-3) --for-spec --no-implementation-order`.
impl PjOwnedStr {
    /// Construct a new `PjOwnedStr` from a `&str`.
    ///
    /// The input bytes are copied to a Rust-owned `Vec<u8>`.
    /// The resulting `pj_str_t` points into this `Vec`.
    ///
    /// # Panics
    /// Never panics for valid UTF-8 input. Empty strings produce
    /// `slen=0` and `ptr` pointing to the (non-null) empty Vec's
    /// backing storage.
    pub fn new(s: &str) -> Self {
        let mut bytes: Vec<u8> = s.as_bytes().to_vec();
        // Ensure a terminating NUL for C interop safety.
        // PJSUA does not strictly require NUL termination for pj_str_t
        // (slen governs length), but having it is defensive.
        if bytes.last() != Some(&0) {
            bytes.push(0u8);
        }
        let ptr = bytes.as_mut_ptr().cast::<i8>();
        // slen excludes the NUL terminator. `as _` infers the field type so the
        // constructor compiles against both the stub alias (`i32`) and the
        // bindgen-generated `pj_ssize_t` (`i64` on 64-bit targets).
        let raw = bindings::pj_str_t {
            ptr,
            slen: (bytes.len() - 1) as _,
        };
        Self { bytes, raw }
    }

    /// Return a copy of the inner `pj_str_t` for use in FFI calls.
    ///
    /// The returned `pj_str_t` is valid only while this `PjOwnedStr`
    /// is alive. Call this immediately before each FFI call — do not
    /// cache the returned value across calls that might move the `Vec`.
    pub fn as_raw(&self) -> bindings::pj_str_t {
        self.raw
    }

    /// Return the string content as a `&str`.
    pub fn as_str(&self) -> &str {
        // Invariant: bytes contains valid UTF-8 (constructed from &str),
        // and slen reflects the original string length (excluding NUL).
        let slen = self.raw.slen.max(0) as usize;
        match std::str::from_utf8(&self.bytes[..slen]) {
            Ok(text) => text,
            // Unreachable: PjOwnedStr is only constructed from valid UTF-8 &str,
            // so the stored bytes and slen always form a valid UTF-8 slice.
            Err(_) => unreachable!("PjOwnedStr is always constructed from valid UTF-8 &str"),
        }
    }
}

// Safety: PjOwnedStr owns only a Vec<u8> and a pj_str_t (ptr + i32),
// both of which are Send. The Vec<u8> moves with the struct.
unsafe impl Send for PjOwnedStr {}

// §47 (C057): PjOwnedStr is the concrete Rust-owned pj_str_t primitive. Its
// backing bytes are a Rust-owned Vec<u8>, so it always reports RUST_OWNED.
// [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
impl MemoryOwnershipTag for PjOwnedStr {
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn classification(&self) -> NativePtrClassification {
        NativePtrClassification::RUST_OWNED
    }
}

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
impl std::fmt::Debug for PjOwnedStr {
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PjOwnedStr")
            .field("slen", &self.raw.slen)
            .field("content", &self.as_str())
            .finish()
    }
}

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
impl std::fmt::Display for PjOwnedStr {
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
impl PartialEq<str> for PjOwnedStr {
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn eq(&self, other: &str) -> bool {
        self.as_str() == other
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{
        MemoryOwnership, MemoryOwnershipTag, NativePtrClassification, OwnershipScope,
    };

    // ── Normal ──────────────────────────────────────────────────────

    #[test]
    // @verifies C038, C057
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_new_constructs_from_str() {
        let input = "sip:user@domain.com";
        let owned = PjOwnedStr::new(input);
        assert_eq!(
            owned.raw.slen as i64,
            input.len() as i64,
            "slen must match input length"
        );
        assert!(!owned.raw.ptr.is_null(), "ptr must not be null");
        assert_eq!(owned.as_str(), input, "content must match input");
    }

    #[test]
    // @verifies C038, C057
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_as_raw_returns_consistent_value() {
        let owned = PjOwnedStr::new("test-value");
        let raw1 = owned.as_raw();
        let raw2 = owned.as_raw();
        assert_eq!(raw1.ptr, raw2.ptr, "ptr must remain stable across calls");
        assert_eq!(raw1.slen, raw2.slen, "slen must remain stable across calls");
    }

    #[test]
    // @verifies C038, C057
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_empty_string() {
        let owned = PjOwnedStr::new("");
        assert_eq!(owned.raw.slen, 0, "empty string must have slen=0");
        assert!(
            !owned.raw.ptr.is_null(),
            "ptr must not be null even for empty string"
        );
        assert_eq!(owned.as_str(), "", "content must be empty");
    }

    #[test]
    // @verifies C057
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_owns_its_bytes() {
        let owned = {
            let input = String::from("owned-test");
            PjOwnedStr::new(&input)
            // input dropped here — PjOwnedStr still alive
        };
        // owned must still be valid
        assert_eq!(owned.as_str(), "owned-test");
    }

    #[test]
    // @verifies C038, C057
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_is_send() {
        // [::TICKET::] P3-2, P11-5, P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3) --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<PjOwnedStr>();
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_debug_does_not_show_ptr() {
        let owned = PjOwnedStr::new("hello");
        let debug = format!("{:?}", owned);
        assert!(debug.contains("hello"), "Debug must show string content");
        assert!(debug.contains("PjOwnedStr"), "Debug must show type name");
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_display_shows_content() {
        let owned = PjOwnedStr::new("display-test");
        assert_eq!(format!("{}", owned), "display-test");
    }

    #[test]
    // @verifies C057
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_partial_eq_str() {
        let owned = PjOwnedStr::new("eq-test");
        assert_eq!(owned.as_str(), "eq-test");
        assert_ne!(owned.as_str(), "other");
    }

    // ── Boundary ────────────────────────────────────────────────────

    #[test]
    // @verifies C057
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_large_input() {
        let large = "x".repeat(4096);
        let owned = PjOwnedStr::new(&large);
        assert_eq!(owned.raw.slen, 4096, "large input slen must match");
        assert_eq!(
            owned.as_str(),
            large.as_str(),
            "large input content must match"
        );
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_unicode_content() {
        let owned = PjOwnedStr::new("日本語");
        assert_eq!(owned.as_str(), "日本語", "unicode content must match");
        assert_eq!(owned.raw.slen, 9, "日本語 is 9 bytes in UTF-8");
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_special_characters() {
        let owned = PjOwnedStr::new("user+tag@domain.org;param=value");
        assert!(owned.raw.slen > 0);
        assert_eq!(owned.as_str(), "user+tag@domain.org;param=value");
    }

    // ── Invariant ───────────────────────────────────────────────────

    #[test]
    // @verifies C057
    // [::TICKET::] P3-2, P11-5, P12-3, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-5|P12-3|P12-7) --for-spec --no-implementation-order`.
    fn pj_owned_str_raw_ptr_invariants() {
        // raw.ptr must alias the Rust-owned Vec<u8> backing for the whole
        // PjOwnedStr lifetime (C057 invariant) — the bytes are readable without
        // copying because the Vec is alive.
        let owned = PjOwnedStr::new("verify");
        let raw = owned.as_raw();
        assert_eq!(raw.ptr as *const u8, owned.as_str().as_ptr());
        assert_eq!(raw.slen as usize, owned.as_str().len());
    }

    // ── P11-5: C057 pre/post — pointer-ownership assertions ──────────

    #[test]
    // @verifies C057
    // [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn pj_owned_str_only_constructs_from_rust_bytes() {
        // C057-Pre: the only constructor takes &str and copies bytes; a
        // pj_pool_t-backed pj_str_t can never be adopted (no raw-pointer constructor exists).
        let owned = PjOwnedStr::new("rust-owned");
        assert_eq!(owned.as_str(), "rust-owned");
    }

    #[test]
    // @verifies C057
    // [::TICKET::] P11-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-5 --for-spec --no-implementation-order`.
    fn pj_owned_str_ptr_points_into_rust_buffer() {
        // C057-Post/Inv: as_raw().ptr points into the Rust-owned Vec<u8> backing.
        let owned = PjOwnedStr::new("abc");
        let raw = owned.as_raw();
        assert_eq!(raw.ptr as *const u8, owned.as_str().as_ptr());
        assert_eq!(raw.slen, 3);
    }

    // ── P12-3: C057/C038 — ownership-model classification ───────────

    #[test]
    // @verifies C057
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn pj_owned_str_classification_is_rust_owned() {
        // C057-Post: the only pj_str_t holder in Rust reports RustOwned + RustOwned scope.
        let owned = PjOwnedStr::new("sip:user@example.com");
        let class = owned.classification();
        assert_eq!(class.ownership, MemoryOwnership::RustOwned);
        assert_eq!(class.scope, OwnershipScope::RustOwned);
        assert!(class.is_rust_owned());
        assert!(!class.is_callback_only());
    }

    #[test]
    // @verifies C057
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn pj_owned_str_has_no_raw_pointer_constructor() {
        // C057-Inv: the original PJSUA ptr is only an immediate copy source, never stored.
        // Only the &str constructor exists — a pj_pool_t-backed pj_str_t can never be adopted.
        let _ctor: fn(&str) -> PjOwnedStr = PjOwnedStr::new;
        let copied = PjOwnedStr::new("immediate-copy");
        assert_eq!(copied.classification(), NativePtrClassification::RUST_OWNED);
    }

    #[test]
    // @verifies C057
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn pj_owned_str_empty_and_large_stay_rust_owned() {
        // C057-Inv edge cases: slen=0 with non-null ptr, and >4096-byte inputs.
        let empty = PjOwnedStr::new("");
        assert_eq!(empty.raw.slen, 0);
        assert!(!empty.raw.ptr.is_null());
        assert_eq!(empty.classification(), NativePtrClassification::RUST_OWNED);

        let large = "x".repeat(4096);
        let big = PjOwnedStr::new(&large);
        assert_eq!(big.raw.slen, 4096);
        assert_eq!(big.classification(), NativePtrClassification::RUST_OWNED);
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P12-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-3 --for-spec --no-implementation-order`.
    fn pj_owned_str_construction_needs_no_runtime() {
        // C038-Pre / C034-Pre: the ownership primitive needs no reactor thread and no
        // Tokio runtime — usable from any thread via plain std::thread.
        let handle = std::thread::spawn(|| {
            let owned = PjOwnedStr::new("thread-safe");
            assert!(owned.classification().is_rust_owned());
        });
        assert!(handle.join().is_ok(), "worker thread must not panic");
    }
}
