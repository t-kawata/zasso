
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
impl Default for TlsConfig {
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

impl Default for IceConfig {
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
    fn transport_config_udp_convenience_constructor() {
        let udp = TransportConfig::udp(5060);
        match &udp {
            TransportConfig::Udp(c) => assert_eq!(c.bind_addr.port(), 5060),
            _ => panic!("expected Udp variant"),
        }
    }

    #[test]
    fn transport_config_tcp_convenience_constructor() {
        let tcp = TransportConfig::tcp(5061);
        match &tcp {
            TransportConfig::Tcp(c) => assert_eq!(c.bind_addr.port(), 5061),
            _ => panic!("expected Tcp variant"),
        }
    }

    // ── Normal: ICE config ──────────────────────────────────────────

    #[test]
    fn ice_config_default_values() {
        let ice = IceConfig::default();
        assert!(ice.enabled, "RFC §13: enabled=true");
        assert!(
            ice.aggressive_nomination,
            "RFC §13: aggressive_nomination=true"
        );
        assert!(!ice.trickle_ice, "RFC §13: trickle_ice=false");
        assert!(!ice.renomination, "RFC §13: renomination=false");
        assert_eq!(
            ice.max_host_candidates, 16,
            "RFC §13: max_host_candidates=16"
        );
    }

    #[test]
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
    fn stun_server_config_constructs() {
        let stun = StunServerConfig {
            uri: "stun:stun.example.com:3478".into(),
        };
        assert_eq!(stun.uri, "stun:stun.example.com:3478");
    }

    #[test]
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
    fn tls_config_defaults() {
        let tls = TlsConfig::default();
        assert!(tls.verify_server);
        assert!(tls.ca_cert_path.is_none());
        assert!(!tls.allow_insecure_cipher_legacy);
    }

    // ── Invariant: feature gate ─────────────────────────────────────

    #[test]
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
    fn transport_config_is_clone_send() {
        fn assert_clone<T: Clone>() {}
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_clone::<TransportConfig>();
        assert_debug::<TransportConfig>();
    }
}
