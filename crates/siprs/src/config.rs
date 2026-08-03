// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.

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

/// AccountConfig, AccountCodecPolicy, OpusConfig, DtmfPolicy, AccountMediaConfig (N0014).
pub mod account_config_spec;

/// TransportConfig, TlsConfig, IceConfig, StunServerConfig, TurnServerConfig (N0015).
pub mod transport_ice_spec;

/// Full ClientConfig with audio, timeouts, raw_sip_events (N0013).
pub mod client_config_spec;

/// Codec policy & fallback rules — NegotiatedCodec, CodecSelectionPolicy (N0040).
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
pub mod codec_policy_fallback;

use crate::error::SipError;
use crate::error::SipErrorKind;

/// Minimum acceptable SIP proxy port (inclusive lower bound of the valid range).
pub const MIN_SIP_PORT: u16 = 1;
/// Maximum acceptable SIP proxy port — the `u16` type makes values above this unrepresentable.
pub const MAX_SIP_PORT: u16 = 65535;
/// Maximum length of the `user_agent` header value in bytes.
pub const MAX_USER_AGENT_BYTES: usize = 256;

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
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
    Trace,
}

/// Configuration for DTMF transmission behavior (N0029).
///
/// [::TICKET::] P7-2: O-002 — `sent_timeout_ms` drives the DtmfSent two-phase
/// fallback timer: if PJSIP does not fire the send-complete callback within
/// this window, a `DtmfSent { Err(Timeout) }` event is published.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct DtmfConfig {
    /// Timeout in milliseconds for the DtmfSent fallback when the PJSIP
    /// send-complete callback does not arrive. Defaults to 500ms.
    #[serde(default = "default_dtmf_sent_timeout_ms")]
    pub sent_timeout_ms: u64,
}

/// The default DtmfSent fallback timeout in milliseconds.
// [::TICKET::] P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-2 --for-spec --no-implementation-order`.
fn default_dtmf_sent_timeout_ms() -> u64 {
    crate::api::m20_dtmfsent_twophase::DEFAULT_DTMF_SENT_TIMEOUT_MS
}

// [::TICKET::] P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-2 --for-spec --no-implementation-order`.
impl Default for DtmfConfig {
// [::TICKET::] P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-2 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            sent_timeout_ms: default_dtmf_sent_timeout_ms(),
        }
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
    /// DTMF transmission configuration (DtmfSent timeout fallback).
    #[serde(default)]
    pub dtmf: DtmfConfig,
}

// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
fn default_user_agent() -> String {
    format!("siprs/{}", env!("CARGO_PKG_VERSION"))
}

// [::TICKET::] P0-3, P0-4, P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P0-4|P6-1) --for-spec --no-implementation-order`.
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
        // The `u16` type already bounds the port to [0, MAX_SIP_PORT]; validation
        // only needs the lower bound because port 0 is never a valid SIP port.
        if self.sip_proxy_port < MIN_SIP_PORT {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "sip_proxy_port must be in the range [1, 65535]",
            ));
        }
        if self.user_agent.len() > MAX_USER_AGENT_BYTES {
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
// [::TICKET::] P0-3, P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P7-2) --for-spec --no-implementation-order`.
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
            dtmf: DtmfConfig::default(),
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
    dtmf_sent_timeout_ms: Option<u64>,
}

// [::TICKET::] P0-3, P2-2, P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P2-2|P7-2) --for-spec --no-implementation-order`.
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

    /// Set the DtmfSent fallback timeout in milliseconds (O-002).
    pub fn dtmf_sent_timeout_ms(mut self, ms: u64) -> Self {
        self.dtmf_sent_timeout_ms = Some(ms);
        self
    }

    /// Build the `ClientConfig`, applying defaults for unset optional fields.
    ///
    /// # Panics
    /// Panics if `sip_proxy_host` is not set. Use `build()` for a fallible version.
    pub fn build(self) -> ClientConfig {
        ClientConfig {
            sip_proxy_host: self.sip_proxy_host.expect("sip_proxy_host is required"),
            sip_proxy_port: self.sip_proxy_port.unwrap_or(5060),
            credentials: self.credentials,
            user_agent: self.user_agent.unwrap_or_else(default_user_agent),
            stun_server: self.stun_server,
            turn_server: self.turn_server,
            ice_enabled: self.ice_enabled,
            srtp_enabled: self.srtp_enabled,
            tls_enabled: self.tls_enabled,
            log_level: self.log_level.unwrap_or(LogLevel::Info),
            dtmf: DtmfConfig {
                sent_timeout_ms: self
                    .dtmf_sent_timeout_ms
                    .unwrap_or_else(default_dtmf_sent_timeout_ms),
            },
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
        let config = ClientConfig::builder().sip_proxy_host("").build();
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
    // [::TICKET::] P0-3, P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P6-1) --for-spec --no-implementation-order`.
    fn client_config_accepts_max_port() {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .sip_proxy_port(MAX_SIP_PORT)
            .build();
        assert_eq!(config.sip_proxy_port, MAX_SIP_PORT);
        assert!(config.validate().is_ok());
    }

    #[test]
    // @verifies C006
    // [::TICKET::] P0-3, P0-4, P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P0-4|P6-1) --for-spec --no-implementation-order`.
    fn client_config_user_agent_256_bytes_boundary() {
        // C006 boundary: exactly MAX_USER_AGENT_BYTES passes, one more fails.
        let ok_config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .user_agent("A".repeat(MAX_USER_AGENT_BYTES))
            .build();
        assert!(
            ok_config.validate().is_ok(),
            "a {MAX_USER_AGENT_BYTES}-byte user_agent must pass validation"
        );

        let bad_config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .user_agent("A".repeat(MAX_USER_AGENT_BYTES + 1))
            .build();
        assert!(
            bad_config.validate().is_err(),
            "a {}-byte user_agent must fail validation",
            MAX_USER_AGENT_BYTES + 1
        );
    }

    #[test]
    // @verifies C006
    // [::TICKET::] P0-3, P0-4, P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P0-4|P6-1) --for-spec --no-implementation-order`.
    fn client_config_rejects_long_user_agent() {
        let long_agent = "A".repeat(MAX_USER_AGENT_BYTES + 1);
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

    // ── O-002: DtmfConfig::sent_timeout_ms ────────────────────────────

    /// @verifies C030
    #[test]
    // [::TICKET::] P7-2: O-002 — default DtmfConfig::sent_timeout_ms is 500ms
// [::TICKET::] P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-2 --for-spec --no-implementation-order`.
    fn client_config_dtmf_sent_timeout_default_500() {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
        assert_eq!(
            config.dtmf.sent_timeout_ms,
            crate::api::m20_dtmfsent_twophase::DEFAULT_DTMF_SENT_TIMEOUT_MS
        );
    }

    /// @verifies C030
    #[test]
    // [::TICKET::] P7-2: O-002 — dtmf_sent_timeout_ms builder overrides the default
// [::TICKET::] P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-2 --for-spec --no-implementation-order`.
    fn client_config_dtmf_sent_timeout_configurable() {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .dtmf_sent_timeout_ms(250)
            .build();
        assert_eq!(config.dtmf.sent_timeout_ms, 250);
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
        assert!(
            !debug.contains("s3cret!"),
            "password must not leak in Debug"
        );
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
        assert!(
            result.is_err(),
            "builder must panic when sip_proxy_host is missing"
        );
    }
}
