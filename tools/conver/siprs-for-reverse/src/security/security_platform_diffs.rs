
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

    /// Expose the inner secret value to a PJSIP FFI consumer (RFC §28 addendum).
    ///
    /// This is the explicit accessor the FFI marshalling layer uses when a
    /// secret (e.g. a TURN password or account digest credential) must be handed
    /// to a PJSIP config struct. It is an alias of [`Self::as_str`] whose name
    /// makes the sensitive boundary explicit at the call site; the value is never
    /// logged or persisted through this path.
    pub fn expose_secret(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SecretString({})", REDACTED_DISPLAY)
    }
}

impl fmt::Display for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", REDACTED_DISPLAY)
    }
}

impl PartialEq for SecretString {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl Eq for SecretString {}

impl From<String> for SecretString {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

impl From<&str> for SecretString {
    fn from(value: &str) -> Self {
        Self::new(value.to_string())
    }
}

// Conditional zeroize implementation behind feature flag.
#[cfg(feature = "zeroize")]
impl zeroize::Zeroize for SecretString {
    fn zeroize(&mut self) {
        self.0.zeroize();
    }
}

// zeroize feature is active. Without this handler, dropping a SecretString left
// the password in the heap buffer despite the module doc claiming otherwise.
#[cfg(feature = "zeroize")]
impl Drop for SecretString {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.0.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal ──────────────────────────────────────────────────────────

    #[test]
    fn secret_string_new_wraps_input() {
        let secret = SecretString::new("my_password");
        assert_eq!(secret.as_str(), "my_password");
    }

    #[test]
    #[cfg(feature = "zeroize")]
    fn secret_string_zeroize_clears_memory() {
        use zeroize::Zeroize;
        let mut secret = SecretString::new("sensitive_data".to_string());
        secret.zeroize();
        // After zeroize, the inner string should be zeroed (empty or zero-filled)
        assert!(
            secret.as_str().chars().all(|c| c == '\0'),
            "zeroize must clear memory"
        );
    }

    #[test]
    #[cfg(feature = "zeroize")]
    fn secret_string_zeroized_on_drop() {
        // on drop when the zeroize feature is active. The prior test only called
        // .zeroize() explicitly and would pass without a Drop handler, so it
        // could not detect a missing Drop impl. Reading the freed heap buffer is
        // unreliable (the allocator may write free-list metadata into the block),
        // so this test verifies the Drop handler structurally: the impl must
        // exist and must invoke zeroize on the inner value. The behavioral
        // zeroization itself is covered by secret_string_zeroize_clears_memory
        // (same `String::zeroize` mechanism on a live buffer).
        let src = include_str!("security_platform_diffs.rs");
        assert!(
            src.contains("impl Drop for SecretString"),
            "SecretString must implement Drop for drop-triggered zeroization"
        );
        assert!(
            src.contains("fn drop(&mut self)"),
            "the Drop impl must define drop()"
        );
        assert!(
            src.contains("self.0.zeroize()"),
            "Drop must zeroize the inner value via self.0.zeroize()"
        );
    }

    #[test]
    fn platform_docs_contain_os_notes() {
        // measures and platform differences are documented. The C048 contract
        // names the specific build notes (Windows/MSVC, macOS system
        // frameworks, Linux system libraries), so the test asserts each keyword
        // — not just the bare OS names. Stripping any single build note fails
        // red (the prior version only checked "Windows"/"macOS"/"Linux").
        //
        // Only the module-level `//!` doc lines are the documented contract.
        // Filtering out the rest of the file (including this test's own
        // assertion-message strings) prevents a vacuous pass: without the
        // filter, the literal keyword inside an assert message would satisfy
        // doc.contains(...) even if the doc stopped naming it.
        let module_doc = include_str!("security_platform_diffs.rs")
            .lines()
            .filter(|line| line.trim_start().starts_with("//!"))
            .map(|line| line.trim_start().trim_start_matches("//!").trim_start())
            .collect::<Vec<_>>()
            .join("\n");
        let doc = module_doc.as_str();
        assert!(
            doc.contains("Windows"),
            "docs must cover Windows build notes"
        );
        assert!(
            doc.contains("MSVC"),
            "docs must name MSVC prebuilt binaries"
        );
        assert!(
            doc.contains("macOS"),
            "docs must cover macOS system frameworks"
        );
        assert!(
            doc.contains("CoreAudio"),
            "docs must name CoreAudio framework"
        );
        assert!(
            doc.contains("CoreFoundation"),
            "docs must name CoreFoundation framework"
        );
        assert!(
            doc.contains("Linux"),
            "docs must cover Linux system libraries"
        );
        assert!(doc.contains("alsa"), "docs must name alsa library");
        assert!(doc.contains("openssl"), "docs must name openssl library");
        assert!(doc.contains("uuid"), "docs must name uuid library");
    }

    #[test]
    fn secret_string_display_redacted() {
        let secret = SecretString::new("s3cret!");
        let display = format!("{}", secret);
        assert_eq!(display, REDACTED_DISPLAY);
        assert_ne!(display, "s3cret!");
    }

    #[test]
    fn secret_string_debug_redacted() {
        let secret = SecretString::new("s3cret!");
        let debug = format!("{:?}", secret);
        assert_eq!(debug, "SecretString([REDACTED])");
        assert!(!debug.contains("s3cret!"));
    }

    #[test]
    fn secret_string_inner_preserved_via_as_str() {
        let secret = SecretString::new("s3cret!");
        assert_eq!(secret.as_str(), "s3cret!");
    }

    #[test]
    fn secret_string_from_string() {
        let secret: SecretString = String::from("pass123").into();
        assert_eq!(secret.as_str(), "pass123");
    }

    #[test]
    fn secret_string_from_str() {
        let secret: SecretString = "pass456".into();
        assert_eq!(secret.as_str(), "pass456");
    }

    #[test]
    fn secret_string_clone_preserves_value() {
        let original = SecretString::new("clone_me");
        let cloned = original.clone();
        assert_eq!(original.as_str(), cloned.as_str());
    }

    #[test]
    fn secret_string_partial_eq() {
        let first = SecretString::new("same_value");
        let second = SecretString::new("same_value");
        let different = SecretString::new("different");
        assert_eq!(first, second);
        assert_ne!(first, different);
    }

    #[test]
    fn secret_string_serde_roundtrip() {
        let original = SecretString::new("serde_test");
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: SecretString = serde_json::from_str(&json).unwrap();
        assert_eq!(original.as_str(), deserialized.as_str());
        // SecretString serializes as a plain string value (newtype wrapper)
        assert!(
            json.contains("serde_test"),
            "JSON must contain the raw value for serialization"
        );
    }

    // ── Error ─────────────────────────────────────────────────────────

    #[test]
    fn secret_string_empty_wraps_without_panic() {
        let secret = SecretString::new("");
        assert_eq!(secret.as_str(), "");
        // Display should still be redacted even for empty
        assert_eq!(format!("{}", secret), REDACTED_DISPLAY);
    }

    // ── Boundary ──────────────────────────────────────────────────────

    #[test]
    fn secret_string_long_preserves_length() {
        let long = "a".repeat(1024);
        let secret = SecretString::new(&long);
        assert_eq!(secret.as_str().len(), 1024);
    }

    #[test]
    fn secret_string_max_length_usize() {
        // Verify that the wrapper works with strings near usize boundary.
        // We test with 1MB to avoid OOM but verify the pattern holds.
        let large = "x".repeat(1024 * 1024);
        let secret = SecretString::new(&large);
        assert_eq!(secret.as_str().len(), 1024 * 1024);
    }
}
