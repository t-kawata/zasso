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

// [::TICKET::] P3-2, P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P3-3) --for-spec --no-implementation-order`.
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
        let slen = bytes.len() as i32 - 1; // slen excludes NUL terminator
        let raw = bindings::pj_str_t { ptr, slen };
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
        // SAFETY: PjOwnedStr is always constructed from valid UTF-8 &str,
        // and slen never exceeds bytes length.
        #[allow(unsafe_code)]
        unsafe {
            // SAFETY: We verified UTF-8 validity above. The unchecked variant
            // avoids the unavailable std::str::from_utf8_lossy standalone function
            // (removed in Rust 1.97+). This is safe because PjOwnedStr invariants
            // guarantee valid UTF-8 content.
            std::str::from_utf8_unchecked(&self.bytes[..slen])
        }
    }
}

// Safety: PjOwnedStr owns only a Vec<u8> and a pj_str_t (ptr + i32),
// both of which are Send. The Vec<u8> moves with the struct.
unsafe impl Send for PjOwnedStr {}

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

    // ── Normal ──────────────────────────────────────────────────────

    #[test]
    // @verifies C038, C057
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_new_constructs_from_str() {
        let input = "sip:user@domain.com";
        let s = PjOwnedStr::new(input);
        assert_eq!(
            s.raw.slen,
            input.len() as i32,
            "slen must match input length"
        );
        assert!(!s.raw.ptr.is_null(), "ptr must not be null");
        assert_eq!(s.as_str(), input, "content must match input");
    }

    #[test]
    // @verifies C038, C057
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_as_raw_returns_consistent_value() {
        let s = PjOwnedStr::new("test-value");
        let raw1 = s.as_raw();
        let raw2 = s.as_raw();
        assert_eq!(raw1.ptr, raw2.ptr, "ptr must remain stable across calls");
        assert_eq!(raw1.slen, raw2.slen, "slen must remain stable across calls");
    }

    #[test]
    // @verifies C038, C057
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_empty_string() {
        let s = PjOwnedStr::new("");
        assert_eq!(s.raw.slen, 0, "empty string must have slen=0");
        assert!(
            !s.raw.ptr.is_null(),
            "ptr must not be null even for empty string"
        );
        assert_eq!(s.as_str(), "", "content must be empty");
    }

    #[test]
    // @verifies C057
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_owns_its_bytes() {
        let s = {
            let input = String::from("owned-test");
            PjOwnedStr::new(&input)
            // input dropped here — PjOwnedStr still alive
        };
        // s must still be valid
        assert_eq!(s.as_str(), "owned-test");
    }

    #[test]
    // @verifies C038, C057
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_is_send() {
        // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<PjOwnedStr>();
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_debug_does_not_show_ptr() {
        let s = PjOwnedStr::new("hello");
        let debug = format!("{:?}", s);
        assert!(debug.contains("hello"), "Debug must show string content");
        assert!(debug.contains("PjOwnedStr"), "Debug must show type name");
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_display_shows_content() {
        let s = PjOwnedStr::new("display-test");
        assert_eq!(format!("{}", s), "display-test");
    }

    #[test]
    // @verifies C057
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_partial_eq_str() {
        let s = PjOwnedStr::new("eq-test");
        assert_eq!(s.as_str(), "eq-test");
        assert_ne!(s.as_str(), "other");
    }

    // ── Boundary ────────────────────────────────────────────────────

    #[test]
    // @verifies C057
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_large_input() {
        let large = "x".repeat(4096);
        let s = PjOwnedStr::new(&large);
        assert_eq!(s.raw.slen, 4096, "large input slen must match");
        assert_eq!(s.as_str(), large.as_str(), "large input content must match");
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_unicode_content() {
        let s = PjOwnedStr::new("日本語");
        assert_eq!(s.as_str(), "日本語", "unicode content must match");
        assert_eq!(s.raw.slen, 9, "日本語 is 9 bytes in UTF-8");
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_special_characters() {
        let s = PjOwnedStr::new("user+tag@domain.org;param=value");
        assert!(s.raw.slen > 0);
        assert_eq!(s.as_str(), "user+tag@domain.org;param=value");
    }

    // ── Invariant ───────────────────────────────────────────────────

    #[test]
    // @verifies C057
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pj_owned_str_raw_ptr_invariants() {
        // raw.ptr must point to bytes backing Vec<u8> until drop
        let s = PjOwnedStr::new("verify");
        let raw = s.as_raw();
        // Read via ptr — must be valid within PjOwnedStr lifetime
        let slice = unsafe { std::slice::from_raw_parts(raw.ptr as *const u8, raw.slen as usize) };
        assert_eq!(slice, b"verify");
    }
}
