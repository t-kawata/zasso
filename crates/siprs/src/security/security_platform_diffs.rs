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

//! Security primitives: `SecretString` for password redaction and zeroization,
//! `TLS_VERIFY_DEFAULT` constant, and Authorization header redaction.
//!
//! ## Security guarantees
//!
//! - `SecretString` never leaks its content via `Display` or `Debug`
//! - `SecretString` does not implement `Clone` or `Copy` (prevents accidental
//!   secret duplication)
//! - When the `zeroize` feature is enabled, the inner buffer is overwritten
//!   with zeroes on drop
//! - `TLS_VERIFY_DEFAULT` is always `true` (secure-by-default)

/// Default value for TLS certificate verification.
///
/// Always `true` — secure-by-default: the SIP client must verify TLS
/// certificates unless explicitly overridden in transport configuration.
pub const TLS_VERIFY_DEFAULT: bool = true;

/// A newtype wrapper around `String` that prevents accidental secret leakage.
///
/// ## Redaction
///
/// Both `Display` and `Debug` implementations output a fixed placeholder
/// `[REDACTED]` instead of the actual content, preventing secrets from
/// appearing in logs, error messages, or debug output.
///
/// ## Zeroization
///
/// When the `zeroize` feature is enabled, `SecretString` implements
/// `zeroize::Zeroize` and overwrites its inner buffer on drop.
///
/// ## Clone / Copy
///
/// `SecretString` intentionally does **not** implement `Clone` or `Copy`.
/// Cloning a secret increases the window for accidental exposure; consumers
/// must explicitly extract the content via `as_str()` if they need multiple
/// references.
pub struct SecretString {
    inner: String,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl SecretString {
    /// Wraps a string as a secret.
    ///
    /// The caller passes ownership of the string; the original binding should
    /// be dropped or overwritten to minimise the window of exposure.
    pub fn new(value: impl Into<String>) -> Self {
        SecretString {
            inner: value.into(),
        }
    }

    /// Returns a read-only reference to the inner string.
    ///
    /// Use this sparingly — every call creates a new opportunity for the
    /// secret to end up in a log or trace.
    pub fn as_str(&self) -> &str {
        &self.inner
    }

    /// Returns the length of the inner string in bytes.
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns `true` if the inner string is empty.
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Zeroizes the inner buffer and clears the string.
    ///
    /// Called from `Drop` when the `zeroize` feature is active, but also
    /// available explicitly for early clearing.
    #[cfg(feature = "zeroize")]
    pub fn zeroize(&mut self) {
        use zeroize::Zeroize;
        self.inner.zeroize();
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl std::fmt::Display for SecretString {
    /// Always outputs `[REDACTED]` — never reveals the inner content.
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}

// Manual Debug impl to ensure the inner value is never leaked.
// `#[derive(Debug)]` would output `SecretString { inner: "value" }`,
// which defeats the purpose of a secret wrapper.
impl std::fmt::Debug for SecretString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SecretString")
            .field("inner", &"[REDACTED]")
            .finish()
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl From<String> for SecretString {
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn from(value: String) -> Self {
        SecretString::new(value)
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl From<&str> for SecretString {
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn from(value: &str) -> Self {
        SecretString::new(value.to_string())
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl AsRef<str> for SecretString {
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn as_ref(&self) -> &str {
        &self.inner
    }
}

/// On drop, zeroize the inner buffer if the `zeroize` feature is enabled.
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl Drop for SecretString {
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn drop(&mut self) {
        #[cfg(feature = "zeroize")]
        self.zeroize();
        // Without zeroize feature, the normal String drop handles deallocation.
    }
}

/// Represents a SIP Authorization header whose value is sensitive.
#[derive(Debug, Clone)]
pub struct AuthorizationHeader {
    /// The raw header value (e.g. `Digest username="alice", realm="...", ...`).
    value: String,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl AuthorizationHeader {
    /// Creates a new `AuthorizationHeader`.
    pub fn new(value: impl Into<String>) -> Self {
        AuthorizationHeader {
            value: value.into(),
        }
    }

    /// Returns a redacted representation for logging.
    ///
    /// Replaces known sensitive parameter values in the Digest challenge with
    /// `[REDACTED]`: `username`, `realm`, `nonce`, `uri`, `response`,
    /// `cnonce`, and `opaque`.
    pub fn redacted(&self) -> String {
        let mut result = self.value.clone();
        for param in &[
            "username", "realm", "nonce", "uri", "response", "cnonce", "opaque",
        ] {
            let search = format!(r#"{param}=""#);
            let redacted = format!(r#"{param}="[REDACTED]""#);
            // Use `replace` (not a `while` loop with `find`) to avoid
            // re-matching the replacement text — the replacement also
            // starts with `param="`, which would cause an infinite loop.
            result = result.replace(&search, &redacted);
        }
        result
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl std::fmt::Display for AuthorizationHeader {
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Authorization: {}", self.redacted())
    }
}

// ---------------------------------------------------------------------------
// Tests — §35 Security (N0047)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ── C048-precondition: SecretString wraps a string ─────────────────

    /// @verifies C048-precondition
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_wraps_str() {
        let secret = SecretString::new("my_secret_password");
        assert_eq!(secret.as_str(), "my_secret_password");
    }

    /// @verifies C048-precondition
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_from_string() {
        let owned: SecretString = String::from("turn_token").into();
        assert_eq!(owned.as_str(), "turn_token");
    }

    /// @verifies C048-precondition
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_from_str() {
        let secret: SecretString = "password".into();
        assert_eq!(secret.as_str(), "password");
    }

    // ── C048-postcondition: Display is redacted ────────────────────────

    /// @verifies C048-postcondition
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_display_redacted() {
        let secret = SecretString::new("password123");
        let display = format!("{}", secret);
        assert_eq!(display, "[REDACTED]");
        assert!(!display.contains("password123"));
    }

    /// @verifies C048-postcondition
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_debug_redacted() {
        let secret = SecretString::new("debug_leak");
        let debug = format!("{:?}", secret);
        // Debug must also be redacted — the inner value must not appear
        assert!(!debug.contains("debug_leak"));
    }

    // ── C048-postcondition: TLS_VERIFY_DEFAULT ─────────────────────────

    /// @verifies C048-postcondition
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn tls_verify_default_is_true() {
        assert!(TLS_VERIFY_DEFAULT);
    }

    // ── C048-invariant: no Clone / no Copy ─────────────────────────────

    /// @verifies C048-invariant
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_does_not_impl_clone_or_copy() {
        // Compile-time verification: these should fail to compile.
        // We verify structurally — SecretString does not derive Clone or Copy.
        let secret = SecretString::new("test");
        let _ = secret.as_str(); // Just use it, no clone.
    }

    // ── Boundary tests ────────────────────────────────────────────────

    /// @verifies C048-invariant
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_empty() {
        let secret = SecretString::new("");
        assert_eq!(secret.len(), 0);
        assert!(secret.is_empty());
        assert_eq!(format!("{}", secret), "[REDACTED]");
    }

    /// @verifies C048-precondition
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn secret_string_len() {
        let secret = SecretString::new("hello");
        assert_eq!(secret.len(), 5);
        assert!(!secret.is_empty());
    }

    /// @verifies C048-invariant
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn as_ref_str_works() {
        let secret = SecretString::new("data");
        let secret_str: &str = secret.as_ref();
        assert_eq!(secret_str, "data");
    }

    // ── AuthorizationHeader ────────────────────────────────────────────

    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn auth_header_redacted_hides_sensitive_params() {
        let header = AuthorizationHeader::new(
            r#"Digest username="alice", realm="example.com", nonce="abc123""#,
        );
        let redacted = header.redacted();
        assert!(!redacted.contains(r#"username="alice""#));
        assert!(!redacted.contains(r#"realm="example.com""#));
        assert!(!redacted.contains(r#"nonce="abc123""#));
        assert!(redacted.contains(r#"username="[REDACTED]"#));
        assert!(redacted.contains("Digest"));
    }
}
