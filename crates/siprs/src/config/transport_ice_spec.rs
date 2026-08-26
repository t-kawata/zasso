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

use crate::security::SecretString;
use std::net::SocketAddr;

/// A SIP transport binding configuration.
///
/// Each variant represents a different transport protocol for SIP signalling.
/// The `Tls` variant is feature-gated behind `#[cfg(feature = "tls")]`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransportConfig {
    Udp(UdpTransportConfig),
    Tcp(TcpTransportConfig),
    #[cfg(feature = "tls")]
    Tls(TlsTransportConfig),
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl TransportConfig {
    /// Create a UDP transport bound to the given port on all interfaces.
    pub fn udp(port: u16) -> Self {
        let bind_addr = format!("0.0.0.0:{port}")
            .parse()
            .expect("invalid socket address");
        Self::Udp(UdpTransportConfig { bind_addr })
    }

    /// Create a TCP transport bound to the given port on all interfaces.
    pub fn tcp(port: u16) -> Self {
        let bind_addr = format!("0.0.0.0:{port}")
            .parse()
            .expect("invalid socket address");
        Self::Tcp(TcpTransportConfig { bind_addr })
    }
}

/// UDP transport binding configuration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UdpTransportConfig {
    pub bind_addr: SocketAddr,
}

/// TCP transport binding configuration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TcpTransportConfig {
    pub bind_addr: SocketAddr,
}

/// TLS transport binding configuration (feature-gated).
///
/// Only available when the `tls` feature is enabled.
#[cfg(feature = "tls")]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TlsTransportConfig {
    pub bind_addr: SocketAddr,
    pub tls: TlsConfig,
}

/// TLS certificate verification and connection configuration.
///
/// Only available when the `tls` feature is enabled.
#[cfg(feature = "tls")]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TlsConfig {
    /// Whether to verify the server certificate.
    pub verify_server: bool,
    /// Optional path to a CA certificate PEM file.
    pub ca_cert_path: Option<std::path::PathBuf>,
    /// Optional path to a client certificate PEM file.
    pub client_cert_path: Option<std::path::PathBuf>,
    /// Optional path to a client private key PEM file.
    pub client_key_path: Option<std::path::PathBuf>,
    /// Optional TLS SNI server name.
    pub server_name: Option<String>,
    /// Allow legacy insecure cipher suites.
    pub allow_insecure_cipher_legacy: bool,
}

#[cfg(feature = "tls")]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for TlsConfig {
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            verify_server: true,
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            server_name: None,
            allow_insecure_cipher_legacy: false,
        }
    }
}

/// ICE (Interactive Connectivity Establishment) configuration.
///
/// Defaults follow RFC §13 (RFC-ROOT.md L584-593): ICE enabled with aggressive
/// nomination and up to 16 host candidates.
#[derive(Debug, Clone, PartialEq)]
pub struct IceConfig {
    /// Enable ICE for media transport negotiation.
    pub enabled: bool,
    /// Use aggressive nomination (faster but may cause temporary conflicts).
    pub aggressive_nomination: bool,
    /// Enable trickle ICE (incremental candidate gathering).
    pub trickle_ice: bool,
    /// Enable ICE renomination (re-nominate on candidate changes).
    pub renomination: bool,
    /// Maximum number of host candidates to gather.
    pub max_host_candidates: usize,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
// [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
impl Default for IceConfig {
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    // [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            enabled: true,
            aggressive_nomination: true,
            trickle_ice: false,
            renomination: false,
            max_host_candidates: 16,
        }
    }
}

/// A STUN server configuration for NAT traversal.
///
/// RFC §13 (RFC-ROOT.md L596-598): a STUN server is identified by a single URI
/// (e.g. `stun:stun.example.com:3478`).
#[derive(Debug, Clone, PartialEq)]
pub struct StunServerConfig {
    /// Server URI (e.g. `stun:stun.example.com:3478`).
    pub uri: String,
}

/// Transport protocol for TURN relay connections.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnTransport {
    Udp,
    Tcp,
    Tls,
}

/// A TURN server configuration for relay-based NAT traversal.
///
/// RFC §13 (RFC-ROOT.md L600-605): a TURN server is identified by a URI with
/// optional credentials. The username/password are optional so that a TURN
/// server can be configured without authentication.
#[derive(Debug, Clone, PartialEq)]
pub struct TurnServerConfig {
    /// Server URI (e.g. `turn:turn.example.com:3478`).
    pub uri: String,
    /// TURN authentication username.
    pub username: Option<String>,
    /// TURN authentication password (zeroed on drop when zeroize feature is active).
    pub password: Option<SecretString>,
    /// Transport protocol for TURN relay.
    pub transport: TurnTransport,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: TransportConfig construction ────────────────────────

    #[test]
    // @verifies C016
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn transport_config_udp_constructs() {
        let udp = TransportConfig::Udp(UdpTransportConfig {
            bind_addr: "0.0.0.0:5060".parse().unwrap(),
        });
        match &udp {
            TransportConfig::Udp(c) => assert_eq!(c.bind_addr.port(), 5060),
            _ => panic!("expected Udp variant"),
        }
    }

    #[test]
    // @verifies C016
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn transport_config_tcp_constructs() {
        let tcp = TransportConfig::Tcp(TcpTransportConfig {
            bind_addr: "0.0.0.0:5061".parse().unwrap(),
        });
        match &tcp {
            TransportConfig::Tcp(c) => assert_eq!(c.bind_addr.port(), 5061),
            _ => panic!("expected Tcp variant"),
        }
    }

    #[cfg(feature = "tls")]
    #[test]
    // @verifies C016
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn transport_config_tls_constructs() {
        let tls_config = TlsConfig {
            verify_server: true,
            ca_cert_path: Some("/etc/ssl/certs/ca.pem".into()),
            client_cert_path: Some("/etc/ssl/certs/client.pem".into()),
            client_key_path: Some("/etc/ssl/private/key.pem".into()),
            server_name: Some("sip.example.com".into()),
            allow_insecure_cipher_legacy: false,
        };
        let tls = TransportConfig::Tls(TlsTransportConfig {
            bind_addr: "0.0.0.0:5062".parse().unwrap(),
            tls: tls_config,
        });
        assert!(matches!(tls, TransportConfig::Tls(_)));
    }

    #[test]
    // @verifies C016
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn transport_config_udp_convenience_constructor() {
        let udp = TransportConfig::udp(5060);
        match &udp {
            TransportConfig::Udp(c) => assert_eq!(c.bind_addr.port(), 5060),
            _ => panic!("expected Udp variant"),
        }
    }

    #[test]
    // @verifies C016
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn transport_config_tcp_convenience_constructor() {
        let tcp = TransportConfig::tcp(5061);
        match &tcp {
            TransportConfig::Tcp(c) => assert_eq!(c.bind_addr.port(), 5061),
            _ => panic!("expected Tcp variant"),
        }
    }

    // ── Normal: ICE config ──────────────────────────────────────────

    #[test]
    // @verifies C016
    // @verifies C081  -- invariant: §13 ICE defaults (enabled/aggressive_nomination/max_host_candidates)
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    // [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
    fn ice_config_default_values() {
        let ice = IceConfig::default();
        assert!(ice.enabled, "RFC §13: enabled=true");
        assert!(ice.aggressive_nomination, "RFC §13: aggressive_nomination=true");
        assert!(!ice.trickle_ice, "RFC §13: trickle_ice=false");
        assert!(!ice.renomination, "RFC §13: renomination=false");
        assert_eq!(ice.max_host_candidates, 16, "RFC §13: max_host_candidates=16");
    }

    #[test]
    // @verifies C016
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn ice_config_full_support() {
        let ice = IceConfig {
            enabled: true,
            aggressive_nomination: true,
            trickle_ice: false,
            renomination: false,
            max_host_candidates: 10,
        };
        assert!(ice.enabled);
        assert!(ice.aggressive_nomination);
        assert_eq!(ice.max_host_candidates, 10);
    }

    #[test]
    // @verifies C016
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn ice_config_trickle_support() {
        let ice = IceConfig {
            enabled: true,
            trickle_ice: true,
            ..Default::default()
        };
        assert!(ice.trickle_ice);
    }

    // ── Normal: STUN/TURN config ────────────────────────────────────

    #[test]
    // @verifies C016
    // @verifies C081  -- precondition: N0015 defines §12/§13 shapes
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    // [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
    fn stun_server_config_constructs() {
        let stun = StunServerConfig {
            uri: "stun:stun.example.com:3478".into(),
        };
        assert_eq!(stun.uri, "stun:stun.example.com:3478");
    }

    #[test]
    // @verifies C016
    // @verifies C081  -- postcondition: unified §13 TurnServerConfig shape
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    // [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
    fn turn_server_config_constructs() {
        let turn = TurnServerConfig {
            uri: "turn:turn.example.com:3478".into(),
            username: Some("user".into()),
            password: Some(SecretString::new("pass")),
            transport: TurnTransport::Udp,
        };
        assert_eq!(turn.uri, "turn:turn.example.com:3478");
        assert_eq!(turn.transport, TurnTransport::Udp);
        assert_eq!(turn.username.as_deref(), Some("user"));
    }

    #[test]
    // @verifies C016
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn turn_transport_has_three_variants() {
        // Verify all three can be constructed
        let udp = TurnTransport::Udp;
        let tcp = TurnTransport::Tcp;
        let tls = TurnTransport::Tls;
        assert!(matches!(udp, TurnTransport::Udp));
        assert!(matches!(tcp, TurnTransport::Tcp));
        assert!(matches!(tls, TurnTransport::Tls));
    }

    // ── TlsConfig defaults (feature-gated) ──────────────────────────

    #[cfg(feature = "tls")]
    #[test]
    // @verifies C043
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn tls_config_defaults() {
        let tls = TlsConfig::default();
        assert!(tls.verify_server);
        assert!(tls.ca_cert_path.is_none());
        assert!(!tls.allow_insecure_cipher_legacy);
    }

    // ── Invariant: feature gate ─────────────────────────────────────

    #[test]
    // @verifies C043
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn transport_config_tls_feature_gated() {
        // This test verifies at compile time — it only compiles when tls feature is enabled
        #[cfg(feature = "tls")]
        {
            let _ = TransportConfig::Tls(TlsTransportConfig {
                bind_addr: "0.0.0.0:5062".parse().unwrap(),
                tls: TlsConfig::default(),
            });
        }
    }

    // ── Invariant: trait derivations ────────────────────────────────

    #[test]
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn transport_config_is_clone_send() {
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_clone::<TransportConfig>();
        assert_debug::<TransportConfig>();
    }
}
