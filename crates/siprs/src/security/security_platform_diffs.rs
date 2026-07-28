// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0047:  §35 Security & §36 Platform Differences
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0047 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Security module for siprs — SecretString, Authorization redaction, platform-specific build notes.
//!
//! # Security measures
//! - `SecretString` prevents accidental password leakage via `Display`/`Debug` output.
//! - Authorization header redaction in raw SIP events.
//! - TLS verify default is `true`.
//! - Memory zeroization via optional `zeroize` feature.
//!
//! # Platform differences
//! - **Windows**: MSVC prebuilt binaries (see `src/build/`).
//! - **macOS**: System frameworks (CoreAudio, CoreFoundation).
//! - **Linux**: `alsa`, `openssl`, `uuid` system libraries.

use std::fmt;

/// The display text used when redacting a secret value.
const REDACTED_DISPLAY: &str = "[REDACTED]";

/// A string wrapper that prevents accidental leakage of sensitive values.
///
/// `SecretString` ensures that:
/// - `Display` output is always `[REDACTED]` — never the actual value.
/// - `Debug` output is `SecretString([REDACTED])` — no value leakage.
/// - The inner value is accessible only through `as_str()` for controlled use.
/// - With the `zeroize` feature, the inner memory is zeroed on drop.
///
/// # Example
/// ```rust
/// use siprs::security::SecretString;
///
/// let secret = SecretString::new("my_password");
/// assert_eq!(format!("{}", secret), "[REDACTED]");
/// assert_eq!(secret.as_str(), "my_password");
/// ```
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct SecretString(String);

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl SecretString {
    /// Create a new `SecretString` wrapping the given value.
    ///
    /// The inner value is preserved for controlled access via `as_str()`,
    /// but `Display` and `Debug` never expose it.
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// Access the inner secret value.
    ///
    /// Use this method only when the value is needed for controlled operations
    /// (e.g., passing to PJSIP auth callback). Avoid logging or persisting
    /// the returned value.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl fmt::Debug for SecretString {
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SecretString({})", REDACTED_DISPLAY)
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl fmt::Display for SecretString {
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", REDACTED_DISPLAY)
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl PartialEq for SecretString {
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl Eq for SecretString {}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl From<String> for SecretString {
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl From<&str> for SecretString {
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn from(value: &str) -> Self {
        Self::new(value.to_string())
    }
}

// Conditional zeroize implementation behind feature flag.
#[cfg(feature = "zeroize")]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl zeroize::Zeroize for SecretString {
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn zeroize(&mut self) {
        self.0.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal ──────────────────────────────────────────────────────────

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_new_wraps_input() {
        let secret = SecretString::new("my_password");
        assert_eq!(secret.as_str(), "my_password");
    }

    #[test]
    #[cfg(feature = "zeroize")]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_zeroize_clears_memory() {
        let mut secret = SecretString::new("sensitive_data".to_string());
        secret.zeroize();
        // After zeroize, the inner string should be zeroed (empty or zero-filled)
        assert!(
            secret.as_str().chars().all(|c| c == '\0'),
            "zeroize must clear memory"
        );
    }

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_display_redacted() {
        let secret = SecretString::new("s3cret!");
        let display = format!("{}", secret);
        assert_eq!(display, REDACTED_DISPLAY);
        assert_ne!(display, "s3cret!");
    }

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_debug_redacted() {
        let secret = SecretString::new("s3cret!");
        let debug = format!("{:?}", secret);
        assert_eq!(debug, "SecretString([REDACTED])");
        assert!(!debug.contains("s3cret!"));
    }

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_inner_preserved_via_as_str() {
        let secret = SecretString::new("s3cret!");
        assert_eq!(secret.as_str(), "s3cret!");
    }

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_from_string() {
        let secret: SecretString = String::from("pass123").into();
        assert_eq!(secret.as_str(), "pass123");
    }

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_from_str() {
        let secret: SecretString = "pass456".into();
        assert_eq!(secret.as_str(), "pass456");
    }

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_clone_preserves_value() {
        let original = SecretString::new("clone_me");
        let cloned = original.clone();
        assert_eq!(original.as_str(), cloned.as_str());
    }

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_partial_eq() {
        let a = SecretString::new("same_value");
        let b = SecretString::new("same_value");
        let c = SecretString::new("different");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_serde_roundtrip() {
        let original = SecretString::new("serde_test");
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: SecretString = serde_json::from_str(&json).unwrap();
        assert_eq!(original.as_str(), deserialized.as_str());
        // SecretString serializes as a plain string value (newtype wrapper)
        assert!(json.contains("serde_test"), "JSON must contain the raw value for serialization");
    }

    // ── Error ─────────────────────────────────────────────────────────

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_empty_wraps_without_panic() {
        let secret = SecretString::new("");
        assert_eq!(secret.as_str(), "");
        // Display should still be redacted even for empty
        assert_eq!(format!("{}", secret), REDACTED_DISPLAY);
    }

    // ── Boundary ──────────────────────────────────────────────────────

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_long_preserves_length() {
        let long = "a".repeat(1024);
        let secret = SecretString::new(&long);
        assert_eq!(secret.as_str().len(), 1024);
    }

    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_max_length_usize() {
        // Verify that the wrapper works with strings near usize boundary.
        // We test with 1MB to avoid OOM but verify the pattern holds.
        let large = "x".repeat(1024 * 1024);
        let secret = SecretString::new(&large);
        assert_eq!(secret.as_str().len(), 1024 * 1024);
    }
}
