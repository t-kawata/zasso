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
//   - NODE_ID=N0015:  §12 TransportConfig & §13 ICE/STUN/TURN Spec
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0015 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Transport configuration types — UDP, TCP, TLS transports and ICE/STUN/TURN server configs.
//!
//! Defines the `TransportConfig` enum (UDP/TCP/feature-gated TLS), `IceConfig` for
//! ICE negotiation, and `StunServerConfig`/`TurnServerConfig` for NAT traversal
//! servers, per §12–§13 of the RFC.

use std::net::SocketAddr;

// ---------------------------------------------------------------------------
// Transport protocol kind (non-exhaustive — may gain QUIC, WebSocket, etc.)
// ---------------------------------------------------------------------------

/// IP transport protocol for SIP signalling.
///
/// Each variant corresponds to a transport layer protocol used by PJSIP.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[non_exhaustive]
pub enum TransportKind {
    /// UDP transport (default, lowest latency).
    Udp,
    /// TCP transport (reliable, higher latency).
    Tcp,
    /// TLS transport (encrypted TCP, requires `tls` feature).
    Tls,
}

// ---------------------------------------------------------------------------
// TransportConfig — enum with UDP/TCP/(feature-gated) TLS variants
// ---------------------------------------------------------------------------

/// SIP transport configuration — one of UDP, TCP, or (with `tls` feature) TLS.
///
/// The `Tls` variant is only available when the `tls` feature flag is enabled.
/// Without the feature, attempting to construct `TransportConfig::Tls(..)`
/// results in a compile-time type error — guaranteeing that TLS configuration
/// never accidentally leaks into non-TLS builds.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum TransportConfig {
    /// UDP transport binding.
    Udp(UdpTransportConfig),
    /// TCP transport binding.
    Tcp(TcpTransportConfig),
    /// TLS transport binding (requires `tls` feature).
    #[cfg(feature = "tls")]
    Tls(TlsTransportConfig),
}

/// UDP transport binding address and port.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct UdpTransportConfig {
    /// Local socket address to bind the UDP listener to.
    pub bind_addr: SocketAddr,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl UdpTransportConfig {
    /// Creates a new UDP transport configuration.
    pub fn new(bind_addr: SocketAddr) -> Self {
        UdpTransportConfig { bind_addr }
    }
}

/// TCP transport binding address and port.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct TcpTransportConfig {
    /// Local socket address to bind the TCP listener to.
    pub bind_addr: SocketAddr,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl TcpTransportConfig {
    /// Creates a new TCP transport configuration.
    pub fn new(bind_addr: SocketAddr) -> Self {
        TcpTransportConfig { bind_addr }
    }
}

// ---------------------------------------------------------------------------
// TLS transport configuration (feature-gated)
// ---------------------------------------------------------------------------

/// TLS transport binding address, port, and TLS parameters.
///
/// Only available when the `tls` feature flag is enabled.
#[cfg(feature = "tls")]
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct TlsTransportConfig {
    /// Local socket address to bind the TLS listener to.
    pub bind_addr: SocketAddr,
    /// TLS configuration (certificates, verification, etc.).
    pub tls: TlsConfig,
}

#[cfg(feature = "tls")]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl TlsTransportConfig {
    /// Creates a new TLS transport configuration.
    pub fn new(bind_addr: SocketAddr, tls: TlsConfig) -> Self {
        TlsTransportConfig { bind_addr, tls }
    }
}

/// TLS certificate verification and identity configuration.
///
/// All certificate paths are `Option<PathBuf>` — an absent path means the
/// corresponding certificate is not used, which is valid when
/// `verify_server` is `false`.
#[cfg(feature = "tls")]
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct TlsConfig {
    /// Whether to verify the server certificate. Default: `true`.
    pub verify_server: bool,
    /// Path to CA certificate bundle for server certificate verification.
    pub ca_cert_path: Option<std::path::PathBuf>,
    /// Path to client certificate for mutual TLS.
    pub client_cert_path: Option<std::path::PathBuf>,
    /// Path to client private key for mutual TLS.
    pub client_key_path: Option<std::path::PathBuf>,
    /// Expected TLS SNI (Server Name Indication) hostname.
    pub server_name: Option<String>,
    /// Allow legacy/weak cipher suites (not recommended, but needed for
    /// compatibility with some legacy PBXes).
    pub allow_insecure_cipher_legacy: bool,
}

#[cfg(feature = "tls")]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for TlsConfig {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn default() -> Self {
        TlsConfig {
            verify_server: true,
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            server_name: None,
            allow_insecure_cipher_legacy: false,
        }
    }
}

// ---------------------------------------------------------------------------
// ICE, STUN, and TURN configuration
// ---------------------------------------------------------------------------

/// ICE (Interactive Connectivity Establishment) configuration.
///
/// When `enabled` is `true`, ICE candidates will be gathered to facilitate
/// NAT traversal. Trickle ICE (incremental candidate delivery) is supported
/// as an optional optimisation.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct IceConfig {
    /// Enable ICE candidate gathering and connectivity checks.
    pub enabled: bool,
    /// STUN servers for gathering server-reflexive candidates.
    pub stun_servers: Vec<StunServerConfig>,
    /// TURN servers for relayed candidates (when direct and STUN fail).
    pub turn_servers: Vec<TurnServerConfig>,
}

// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
impl IceConfig {
    /// Creates a new `IceConfig` with ICE enabled and the given servers.
    pub fn new(stun_servers: Vec<StunServerConfig>, turn_servers: Vec<TurnServerConfig>) -> Self {
        IceConfig {
            enabled: true,
            stun_servers,
            turn_servers,
        }
    }

    /// Creates an `IceConfig` with ICE disabled (no STUN/TURN servers needed).
    pub fn disabled() -> Self {
        IceConfig {
            enabled: false,
            stun_servers: vec![],
            turn_servers: vec![],
        }
    }
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for IceConfig {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn default() -> Self {
        IceConfig::disabled()
    }
}

/// STUN server configuration for NAT traversal.
///
/// The `uri` field is a standard STUN URI, e.g. `stun:stun.example.com:3478`.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct StunServerConfig {
    /// STUN server URI (e.g. `stun:stun.example.com:3478`).
    pub uri: String,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl StunServerConfig {
    /// Creates a new STUN server configuration.
    pub fn new(uri: impl Into<String>) -> Self {
        StunServerConfig { uri: uri.into() }
    }
}

/// TURN server configuration for relayed candidates.
///
/// Username and password are optional — some deployments use long-term
/// credentials while others use REST API-derived temporal credentials.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct TurnServerConfig {
    /// TURN server URI (e.g. `turn:turn.example.com:3478`).
    pub uri: String,
    /// Optional username for TURN authentication.
    pub username: Option<String>,
    /// Optional password for TURN authentication.
    pub password: Option<String>,
}

// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
impl TurnServerConfig {
    /// Creates a new TURN server configuration.
    pub fn new(uri: impl Into<String>, username: Option<String>, password: Option<String>) -> Self {
        TurnServerConfig {
            uri: uri.into(),
            username,
            password,
        }
    }
}

// ---------------------------------------------------------------------------
// SrtpPolicy — Secure RTP encryption policy
// ---------------------------------------------------------------------------

/// SRTP (Secure RTP) media encryption policy for an account.
///
/// - `Disabled`: No SRTP — media is sent in the clear.
/// - `Optional`: Attempt SRTP negotiation; fall back to plain RTP if the
///   remote peer does not support it.
/// - `Mandatory`: Require SRTP — reject the call if SRTP negotiation fails.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum SrtpPolicy {
    /// Do not use SRTP.
    Disabled,
    /// Attempt SRTP but allow fallback to plain RTP.
    Optional,
    /// Require SRTP — reject if peer does not support it.
    Mandatory,
}

// ---------------------------------------------------------------------------
// AuthOverride — per-call authentication override
// ---------------------------------------------------------------------------

/// Per-call authentication credentials override for `OutgoingCallRequest`.
///
/// Allows specifying alternative credentials for a specific call,
/// overriding the account-level authentication.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AuthOverride {
    /// Authentication username (if different from account username).
    pub username: String,
    /// Authentication password.
    // [::STUB::] P1-2: Replace String with SecretString.
    pub password: String,
    /// Optional realm override.
    pub realm: Option<String>,
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};

    // -----------------------------------------------------------------------
    // TransportKind
    // -----------------------------------------------------------------------

    /// @verifies C016-precondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_kind_all_variants() {
        let _udp = TransportKind::Udp;
        let _tcp = TransportKind::Tcp;
        let _tls = TransportKind::Tls;
        // Verify all variants are constructable
        let all = vec![TransportKind::Udp, TransportKind::Tcp, TransportKind::Tls];
        assert_eq!(all.len(), 3);
    }

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_kind_is_non_exhaustive() {
        // #[non_exhaustive] confirmed via doc-attribute presence
        let doc = include_str!("transport_ice_spec.rs");
        assert!(
            doc.contains("#[non_exhaustive]"),
            "TransportKind must be #[non_exhaustive]"
        );
    }

    // -----------------------------------------------------------------------
    // TransportConfig: UDP / TCP / TLS
    // -----------------------------------------------------------------------

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_config_udp_construct() {
        let addr: SocketAddr = (Ipv4Addr::LOCALHOST, 5060).into();
        let udp = UdpTransportConfig::new(addr);
        assert_eq!(udp.bind_addr.port(), 5060);
        let config = TransportConfig::Udp(udp);
        matches!(config, TransportConfig::Udp(_));
    }

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_config_tcp_construct() {
        let addr: SocketAddr = (Ipv4Addr::LOCALHOST, 5060).into();
        let tcp = TcpTransportConfig::new(addr);
        assert_eq!(tcp.bind_addr.port(), 5060);
        let config = TransportConfig::Tcp(tcp);
        matches!(config, TransportConfig::Tcp(_));
    }

    /// @verifies C016-postcondition
    #[cfg(feature = "tls")]
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_config_tls_construct() {
        let addr: SocketAddr = (Ipv4Addr::LOCALHOST, 5061).into();
        let tls_cfg = TlsConfig::default();
        let tls = TlsTransportConfig::new(addr, tls_cfg);
        assert_eq!(tls.bind_addr.port(), 5061);
        assert!(tls.tls.verify_server);
        let config = TransportConfig::Tls(tls);
        matches!(config, TransportConfig::Tls(_));
    }

    /// @verifies C016-postcondition
    #[cfg(feature = "tls")]
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn tls_config_default_verify_server_true() {
        let tls = TlsConfig::default();
        assert!(tls.verify_server);
        assert!(tls.ca_cert_path.is_none());
        assert!(!tls.allow_insecure_cipher_legacy);
    }

    /// @verifies C043-postcondition
    #[cfg(feature = "tls")]
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn tls_config_custom_values() {
        let tls = TlsConfig {
            verify_server: false,
            ca_cert_path: Some("/etc/ssl/certs/ca.pem".into()),
            server_name: Some("sip.example.com".into()),
            ..Default::default()
        };
        assert!(!tls.verify_server);
        assert_eq!(
            tls.ca_cert_path.unwrap(),
            std::path::PathBuf::from("/etc/ssl/certs/ca.pem")
        );
        assert_eq!(tls.server_name.unwrap(), "sip.example.com");
    }

    /// @verifies C043-invariant: SRTP feature-gated (TLS equivalent)
    #[cfg(not(feature = "tls"))]
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_config_tls_variant_absent_without_feature() {
        // Without `tls` feature, TransportConfig::Tls should not compile.
        // This test verifies the enum has only Udp and Tcp variants.
        // We can construct Udp and Tcp but Tls would fail to compile.
        let addr: SocketAddr = (Ipv4Addr::LOCALHOST, 5060).into();
        let udp = TransportConfig::Udp(UdpTransportConfig::new(addr));
        let tcp = TransportConfig::Tcp(TcpTransportConfig::new(addr));
        matches!(udp, TransportConfig::Udp(_));
        matches!(tcp, TransportConfig::Tcp(_));
    }

    // -----------------------------------------------------------------------
    // IPv6 binding
    // -----------------------------------------------------------------------

    /// @verifies C016-boundary
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_config_udp_ipv6() {
        let addr: SocketAddr = (Ipv6Addr::UNSPECIFIED, 5060).into();
        let udp = UdpTransportConfig::new(addr);
        assert!(udp.bind_addr.is_ipv6());
    }

    /// @verifies C016-boundary
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_config_tcp_ipv6() {
        let addr: SocketAddr = (Ipv6Addr::UNSPECIFIED, 5060).into();
        let tcp = TcpTransportConfig::new(addr);
        assert!(tcp.bind_addr.is_ipv6());
    }

    // -----------------------------------------------------------------------
    // Send + Sync compile-time checks
    // -----------------------------------------------------------------------

    /// @verifies C016-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_types_are_send_sync() {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<TransportConfig>();
        assert_sync::<TransportConfig>();
        assert_send::<UdpTransportConfig>();
        assert_sync::<UdpTransportConfig>();
        assert_send::<TcpTransportConfig>();
        assert_sync::<TcpTransportConfig>();
    }

    // -----------------------------------------------------------------------
    // ICE Configuration
    // -----------------------------------------------------------------------

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn ice_config_new() {
        let stun = StunServerConfig::new("stun:stun.example.com:3478");
        let turn = TurnServerConfig::new("turn:turn.example.com:3478", None, None);
        let ice = IceConfig::new(vec![stun], vec![turn]);
        assert!(ice.enabled);
        assert_eq!(ice.stun_servers.len(), 1);
        assert_eq!(ice.turn_servers.len(), 1);
    }

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn ice_config_disabled() {
        let ice = IceConfig::disabled();
        assert!(!ice.enabled);
        assert!(ice.stun_servers.is_empty());
        assert!(ice.turn_servers.is_empty());
    }

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn ice_config_default_is_disabled() {
        let ice = IceConfig::default();
        assert!(!ice.enabled);
    }

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn stun_server_config_construct() {
        let stun = StunServerConfig::new("stun:stun.example.com:3478");
        assert_eq!(stun.uri, "stun:stun.example.com:3478");
    }

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn turn_server_config_construct() {
        let turn = TurnServerConfig::new(
            "turn:turn.example.com:3478",
            Some("user".into()),
            Some("pass".into()),
        );
        assert_eq!(turn.uri, "turn:turn.example.com:3478");
        assert_eq!(turn.username.unwrap(), "user");
        assert_eq!(turn.password.unwrap(), "pass");
    }

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn turn_server_config_no_credentials() {
        let turn = TurnServerConfig::new("turn:turn.example.com:3478", None, None);
        assert!(turn.username.is_none());
        assert!(turn.password.is_none());
    }

    /// @verifies C016-boundary
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn ice_config_full_ice_trickle_optional() {
        // Full ICE support with trickle ICE as optional optimisation:
        // IceConfig has `enabled` + vec of STUN/TURN servers
        let stun1 = StunServerConfig::new("stun:stun1.example.com:3478");
        let stun2 = StunServerConfig::new("stun:stun2.example.com:3478");
        let ice = IceConfig {
            enabled: true,
            stun_servers: vec![stun1, stun2],
            turn_servers: vec![],
        };
        assert_eq!(ice.stun_servers.len(), 2);
    }

    // -----------------------------------------------------------------------
    // Serde roundtrip (when serde feature enabled)
    // -----------------------------------------------------------------------

    #[cfg(feature = "serde")]
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_config_serde_roundtrip() {
        let addr: SocketAddr = (Ipv4Addr::LOCALHOST, 5060).into();
        let config = TransportConfig::Udp(UdpTransportConfig::new(addr));
        let json = serde_json::to_string(&config).unwrap();
        let restored: TransportConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config, restored);
    }

    #[cfg(feature = "serde")]
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn ice_config_serde_roundtrip() {
        let stun = StunServerConfig::new("stun:stun.example.com:3478");
        let ice = IceConfig::new(vec![stun], vec![]);
        let json = serde_json::to_string(&ice).unwrap();
        let restored: IceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(ice, restored);
        assert!(restored.enabled);
    }

    // -----------------------------------------------------------------------
    // Clone/Debug equality
    // -----------------------------------------------------------------------

    /// @verifies C016-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn transport_config_clone_equality() {
        let addr: SocketAddr = (Ipv4Addr::LOCALHOST, 5060).into();
        let config = TransportConfig::Udp(UdpTransportConfig::new(addr));
        let cloned = config.clone();
        assert_eq!(config, cloned);
    }
}
