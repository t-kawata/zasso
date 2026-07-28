// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.

// [::TICKET::] P0-3: ClientConfig — typed configuration for SipClient.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.

// [::TICKET::] P1-1: Codec auto-mode and SRTP/transport modules.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.

/// M20 explicit codec & auto-mode policy (N0041).
pub mod m20_codec_auto_mode;

/// SRTP policy & transport reconnection (N0042).
pub mod srtp_transport_reconnect;

/// Observability — tracing, metrics & ClientCapabilities (N0046).
pub mod observability_metrics;

/// Semver operations & SIP networking details — versioning policy, TLS, DNS (N0066).
pub mod semver_sip_networking;

use crate::error::SipError;
use crate::error::SipErrorKind;

/// Credentials for SIP authentication.
///
/// The `password` field uses `SecretString` (via `zeroize`) to ensure
/// the password is zeroed in memory on drop.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuthCredentials {
    /// SIP authentication username (e.g., "alice" or "alice@example.com").
    pub username: String,
    /// SIP authentication password, zeroed on drop.
    ///
    /// Uses `SecretString` to prevent accidental leakage via Display/Debug output.
    /// With the `zeroize` feature, memory is zeroed on drop.
    pub password: crate::security::SecretString,
    /// Optional SIP authentication realm.
    pub realm: Option<String>,
}

/// Configuration for STUN or TURN server.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StunServerConfig {
    /// Server hostname or IP address.
    pub host: String,
    /// Server port.
    pub port: u16,
}

// ── Re-exports from api::standalone_server_config ─────────────────────
//
// ServerConfig (siprs-server runtime configuration), AuthConfig, and AuthMode
// are defined in the api module to keep config.rs focused on client config.

pub use crate::api::standalone_server_config::AuthConfig;
pub use crate::api::standalone_server_config::AuthMode;
pub use crate::api::standalone_server_config::ConfigError;
pub use crate::api::standalone_server_config::ServerConfig;

// [::TICKET::] P2-3: Semver/networking types re-export
pub use self::semver_sip_networking::{TlsCertInfo, VERSIONING_POLICY};

/// Logging level for internal diagnostics.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
impl Default for LogLevel {
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::Info
    }
}

/// Configuration for the `SipClient` session.
///
/// Passed to `SipClient::new()` to configure the SIP stack, transports,
/// media codecs, and security settings.
///
/// # Invariant
/// - `sip_proxy_host` must be a non-empty string.
/// - `sip_proxy_port` must be in the range [1, 65535].
/// - `user_agent` must not exceed 256 bytes.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClientConfig {
    /// SIP proxy server hostname or IP address (required).
    pub sip_proxy_host: String,
    /// SIP proxy server port (required, range [1, 65535]).
    pub sip_proxy_port: u16,
    /// Optional SIP authentication credentials.
    pub credentials: Option<AuthCredentials>,
    /// SIP User-Agent header value.
    #[serde(default = "default_user_agent")]
    pub user_agent: String,
    /// Optional STUN server for NAT traversal.
    pub stun_server: Option<String>,
    /// Optional TURN/STUN server configuration.
    pub turn_server: Option<StunServerConfig>,
    /// Enable ICE (Interactive Connectivity Establishment).
    #[serde(default)]
    pub ice_enabled: bool,
    /// Enable SRTP (Secure Real-Time Transport Protocol).
    #[serde(default)]
    pub srtp_enabled: bool,
    /// Enable TLS transport.
    #[serde(default)]
    pub tls_enabled: bool,
    /// Logging verbosity level.
    #[serde(default)]
    pub log_level: LogLevel,
}

// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
fn default_user_agent() -> String {
    format!("siprs/{}", env!("CARGO_PKG_VERSION"))
}

// [::TICKET::] P0-3, P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P0-4) --for-spec --no-implementation-order`.
impl ClientConfig {
    /// Create a new `ClientConfigBuilder` for constructing a config.
    pub fn builder() -> ClientConfigBuilder {
        ClientConfigBuilder::default()
    }

    /// Validate all configuration fields.
    ///
    /// Returns `Ok(())` if all fields are valid, or `Err(SipError)` with
    /// `SipErrorKind::InvalidConfig` and a description of the first validation failure.
    pub fn validate(&self) -> Result<(), SipError> {
        if self.sip_proxy_host.trim().is_empty() {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "sip_proxy_host must not be empty",
            ));
        }
        if self.sip_proxy_port == 0 {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "sip_proxy_port must not be 0",
            ));
        }
        if self.user_agent.len() > 256 {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "user_agent must not exceed 256 bytes",
            ));
        }
        Ok(())
    }
}

// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
impl Default for ClientConfig {
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            sip_proxy_host: String::new(),
            sip_proxy_port: 5060,
            credentials: None,
            user_agent: default_user_agent(),
            stun_server: None,
            turn_server: None,
            ice_enabled: false,
            srtp_enabled: false,
            tls_enabled: false,
            log_level: LogLevel::default(),
        }
    }
}

/// Builder for `ClientConfig`.
///
/// Provides a fluent API for constructing `ClientConfig` with optional fields.
/// Required fields (`sip_proxy_host`, `sip_proxy_port`) have no defaults and
/// must be set explicitly.
#[derive(Debug, Clone, Default)]
pub struct ClientConfigBuilder {
    sip_proxy_host: Option<String>,
    sip_proxy_port: Option<u16>,
    credentials: Option<AuthCredentials>,
    user_agent: Option<String>,
    stun_server: Option<String>,
    turn_server: Option<StunServerConfig>,
    ice_enabled: bool,
    srtp_enabled: bool,
    tls_enabled: bool,
    log_level: Option<LogLevel>,
}

// [::TICKET::] P0-3, P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P2-2) --for-spec --no-implementation-order`.
impl ClientConfigBuilder {
    /// Set the SIP proxy server hostname or IP address (required).
    pub fn sip_proxy_host(mut self, host: impl Into<String>) -> Self {
        self.sip_proxy_host = Some(host.into());
        self
    }

    /// Set the SIP proxy server port (required, default 5060).
    pub fn sip_proxy_port(mut self, port: u16) -> Self {
        self.sip_proxy_port = Some(port);
        self
    }

    /// Set optional SIP authentication credentials.
    pub fn credentials(mut self, creds: AuthCredentials) -> Self {
        self.credentials = Some(creds);
        self
    }

    /// Set a custom User-Agent header.
    pub fn user_agent(mut self, agent: impl Into<String>) -> Self {
        self.user_agent = Some(agent.into());
        self
    }

    /// Set optional STUN server address.
    pub fn stun_server(mut self, server: impl Into<String>) -> Self {
        self.stun_server = Some(server.into());
        self
    }

    /// Set optional TURN/STUN server configuration.
    pub fn turn_server(mut self, config: StunServerConfig) -> Self {
        self.turn_server = Some(config);
        self
    }

    /// Enable ICE negotiation.
    pub fn ice_enabled(mut self, enabled: bool) -> Self {
        self.ice_enabled = enabled;
        self
    }

    /// Enable SRTP encryption.
    pub fn srtp_enabled(mut self, enabled: bool) -> Self {
        self.srtp_enabled = enabled;
        self
    }

    /// Enable TLS transport.
    pub fn tls_enabled(mut self, enabled: bool) -> Self {
        self.tls_enabled = enabled;
        self
    }

    /// Set the logging verbosity level.
    pub fn log_level(mut self, level: LogLevel) -> Self {
        self.log_level = Some(level);
        self
    }

    /// Build the `ClientConfig`, applying defaults for unset optional fields.
    ///
    /// # Panics
    /// Panics if `sip_proxy_host` is not set. Use `build()` for a fallible version.
    pub fn build(self) -> ClientConfig {
        ClientConfig {
            sip_proxy_host: self
                .sip_proxy_host
                .expect("sip_proxy_host is required"),
            sip_proxy_port: self.sip_proxy_port.unwrap_or(5060),
            credentials: self.credentials,
            user_agent: self.user_agent.unwrap_or_else(default_user_agent),
            stun_server: self.stun_server,
            turn_server: self.turn_server,
            ice_enabled: self.ice_enabled,
            srtp_enabled: self.srtp_enabled,
            tls_enabled: self.tls_enabled,
            log_level: self.log_level.unwrap_or(LogLevel::Info),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal ──────────────────────────────────────────────────────

    #[test]
    // @verifies C001, C002
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn client_config_builder_accepts_valid_config() {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .sip_proxy_port(5060)
            .build();
        assert_eq!(config.sip_proxy_host, "sip.example.com");
        assert_eq!(config.sip_proxy_port, 5060);
        assert!(config.validate().is_ok());
    }

    #[test]
    // @verifies C001
// [::TICKET::] P0-3, P1-2, P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P1-2|P2-2) --for-spec --no-implementation-order`.
    fn client_config_builder_sets_optional_fields() {
        let creds = AuthCredentials {
            username: "alice".into(),
            password: crate::security::SecretString::new("secret"),
            realm: Some("example.com".into()),
        };
        let _stun = StunServerConfig {
            host: "stun.example.com".into(),
            port: 3478,
        };
        let turn = StunServerConfig {
            host: "turn.example.com".into(),
            port: 3478,
        };
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .sip_proxy_port(5060)
            .credentials(creds.clone())
            .user_agent("MyApp/1.0")
            .stun_server("stun.example.com")
            .turn_server(turn.clone())
            .ice_enabled(true)
            .srtp_enabled(true)
            .tls_enabled(true)
            .log_level(LogLevel::Debug)
            .build();
        assert_eq!(config.credentials.unwrap().username, "alice");
        assert_eq!(config.user_agent, "MyApp/1.0");
        assert!(config.ice_enabled);
        assert!(config.srtp_enabled);
        assert!(config.tls_enabled);
    }

    #[test]
    // @verifies C001
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn client_config_default_user_agent_contains_version() {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
        assert!(
            config.user_agent.starts_with("siprs/"),
            "default user agent should start with siprs/"
        );
    }

    // ── Error ───────────────────────────────────────────────────────

    #[test]
    // @verifies C001
// [::TICKET::] P0-3, P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P0-4) --for-spec --no-implementation-order`.
    fn client_config_rejects_empty_host() {
        let config = ClientConfig::builder()
            .sip_proxy_host("")
            .build();
        let err = config.validate().unwrap_err();
        assert_eq!(
            err.kind,
            SipErrorKind::InvalidConfig,
            "expected InvalidConfig for empty host"
        );
        assert!(
            err.message.contains("empty"),
            "message should contain 'empty': {}",
            err.message
        );
    }

    #[test]
    // @verifies C006
// [::TICKET::] P0-3, P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P0-4) --for-spec --no-implementation-order`.
    fn client_config_rejects_zero_port() {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .sip_proxy_port(0)
            .build();
        let err = config.validate().unwrap_err();
        assert_eq!(
            err.kind,
            SipErrorKind::InvalidConfig,
            "expected InvalidConfig for zero port"
        );
        assert!(
            err.message.contains("port"),
            "message should contain 'port': {}",
            err.message
        );
    }

    // ── Boundary ────────────────────────────────────────────────────

    #[test]
    // @verifies C006
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn client_config_accepts_max_port() {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .sip_proxy_port(65535)
            .build();
        assert_eq!(config.sip_proxy_port, 65535);
        assert!(config.validate().is_ok());
    }

    #[test]
    // @verifies C006
// [::TICKET::] P0-3, P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P0-4) --for-spec --no-implementation-order`.
    fn client_config_rejects_long_user_agent() {
        let long_agent = "A".repeat(257);
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .user_agent(long_agent)
            .build();
        let err = config.validate().unwrap_err();
        assert_eq!(
            err.kind,
            SipErrorKind::InvalidConfig,
            "expected InvalidConfig for user_agent > 256 bytes"
        );
        assert!(
            err.message.contains("256"),
            "message should contain '256': {}",
            err.message
        );
    }

    // ── Contract ────────────────────────────────────────────────────

    #[test]
    // @verifies C048
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_config_password_is_secret_string() {
        // C048 invariant: password is zeroized on drop via SecretString.
        let creds = AuthCredentials {
            username: "alice".into(),
            password: crate::security::SecretString::new("s3cret!"),
            realm: None,
        };
        // Password must not be visible in Debug output.
        let debug = format!("{:?}", creds);
        assert!(!debug.contains("s3cret!"), "password must not leak in Debug");
        // Password value must be accessible via SecretString::as_str()
        assert_eq!(creds.password.as_str(), "s3cret!");
    }

    #[test]
    // @verifies C001
// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn client_config_builder_build_panics_without_host() {
        // This is a deliberate panic in the builder when required fields are missing.
        let result = std::panic::catch_unwind(|| {
            let _config = ClientConfig::builder().build();
        });
        assert!(result.is_err(), "builder must panic when sip_proxy_host is missing");
    }
}
