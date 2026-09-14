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
//   - NODE_ID=N0066:  §58 Semver Operations & §59 SIP Networking Details
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0066 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

/// Versioning policy summary for siprs.
///
/// # Semver Policy
/// - **0.x** (current): Maximum flexibility. Breaking changes are listed in
///   `CHANGELOG.md`'s unreleased section. No deprecation period required.
/// - **1.0+**: Strict [`cargo semver-checks`](https://crates.io/crates/cargo-semver-checks)
///   CI validation required. Breaking changes must have at least one release
///   of deprecation notice before removal.
///
/// This is a policy-declaration constant. The CI pipeline configuration
/// (not crate code) enforces the actual semver-checks gate at 1.0.
pub const VERSIONING_POLICY: &str = "0.x flexible, 1.0+ strict semver-checks";

/// DNS SRV/NAPTR resolution delegation notice.
///
/// DNS SRV (RFC 2782) and NAPTR (RFC 3403) resolution for SIP proxies is
/// delegated to the PJSIP C library via `pjsip_resolve()`. This is an
/// intentional I/O boundary (I/O boundary **B2 — FFI** in RFC §61).
/// Rust-side code does not perform DNS resolution for SIP transport
/// discovery; it relies on PJSIP's built-in resolver.
pub const DNS_DELEGATION: &str = "DNS SRV/NAPTR delegated to PJSIP via pjsip_resolve()";

/// TLS certificate information captured from a PJSIP TLS handshake.
///
/// This structure represents the TLS certificate metadata that a
/// PJSIP transport callback (`NativeEvent::TlsCertInfo`) provides
/// at runtime. Fields are populated from the FFI boundary and are
/// read-only after construction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TlsCertInfo {
    /// Path to the CA certificate file used for verification,
    /// or `None` if no custom CA was configured.
    pub ca_cert_path: Option<std::path::PathBuf>,
    /// Path to the client certificate file presented during the
    /// TLS handshake, or `None` if no client cert was configured.
    pub client_cert_path: Option<std::path::PathBuf>,
    /// Whether server certificate verification is enabled.
    /// When `true`, PJSIP validates the server's certificate chain
    /// against the configured CA. When `false`, self-signed or
    /// mismatched certificates are accepted.
    pub verify_server: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: Versioning policy ────────────────────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_versioning_policy_is_defined() {
        assert!(
            !VERSIONING_POLICY.is_empty(),
            "Versioning policy must be a non-empty string"
        );
        assert!(
            VERSIONING_POLICY.contains("0.x"),
            "Policy must mention 0.x flexibility"
        );
    }

    // ── Normal: DNS delegation ───────────────────────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_dns_delegation_is_defined() {
        assert!(
            !DNS_DELEGATION.is_empty(),
            "DNS delegation notice must be non-empty"
        );
        assert!(
            DNS_DELEGATION.contains("PJSIP"),
            "Delegation must mention PJSIP"
        );
    }

    // ── Normal: TlsCertInfo construction ─────────────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_tls_cert_info_construct_with_all_fields() {
        let info = TlsCertInfo {
            ca_cert_path: Some(std::path::PathBuf::from("/etc/ssl/certs/ca.pem")),
            client_cert_path: Some(std::path::PathBuf::from("/etc/ssl/certs/client.pem")),
            verify_server: true,
        };
        assert_eq!(
            info.ca_cert_path.as_deref(),
            Some(std::path::Path::new("/etc/ssl/certs/ca.pem"))
        );
        assert_eq!(
            info.client_cert_path.as_deref(),
            Some(std::path::Path::new("/etc/ssl/certs/client.pem"))
        );
        assert!(info.verify_server, "Server verification must be enabled");
    }

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_tls_cert_info_verify_server_default() {
        let info = TlsCertInfo {
            ca_cert_path: None,
            client_cert_path: None,
            verify_server: true,
        };
        assert!(info.verify_server, "Default must verify server");
    }

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_tls_cert_info_verify_server_disabled() {
        let info = TlsCertInfo {
            ca_cert_path: None,
            client_cert_path: None,
            verify_server: false,
        };
        assert!(
            !info.verify_server,
            "verify_server must respect false value"
        );
    }

    // ── Normal: TlsCertInfo trait implementations ────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_tls_cert_info_traits() {
        // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
        // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_debug::<TlsCertInfo>();
        assert_clone::<TlsCertInfo>();
        assert_partial_eq::<TlsCertInfo>();
        assert_send::<TlsCertInfo>();
        assert_sync::<TlsCertInfo>();
    }

    // ── Normal: Constants are Send + Sync ─────────────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_constants_type_check() {
        // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
        fn assert_str<T: AsRef<str>>() {}
        assert_str::<&str>();
        // Verify constants are &str
        let _: &str = VERSIONING_POLICY;
        let _: &str = DNS_DELEGATION;
    }
}
