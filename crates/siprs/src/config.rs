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

/// §4.1 Versioning Policy — semver phase classification and CHANGELOG policy (N0006).
pub mod versioning_policy;
// [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.

/// AccountConfig, AccountCodecPolicy, OpusConfig, DtmfPolicy, AccountMediaConfig (N0014).
pub mod account_config_spec;

/// TransportConfig, TlsConfig, IceConfig, StunServerConfig, TurnServerConfig (N0015).
pub mod transport_ice_spec;

/// Full ClientConfig with audio, timeouts, raw_sip_events (N0013).
pub mod client_config_spec;

/// §62.1 ConfigUnification — RFC §10 ClientConfig promotion (N0070).
pub mod client_config_unify;

/// Codec policy & fallback rules — NegotiatedCodec, CodecSelectionPolicy (N0040).
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
pub mod codec_policy_fallback;

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

/// Configuration for DTMF transmission behavior (N0029).
///
/// [::TICKET::] P7-2: O-002 — `sent_timeout_ms` drives the DtmfSent two-phase
/// fallback timer: when no PJSIP send-complete callback is available, this
/// window elapses and a `DtmfSent { Ok(()) }` event is published, treating the
/// send as complete (§62.15 Q5).
// [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
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

// ── RFC §10 / §12 / §13 configuration types (P15-2 ConfigUnification) ──
//
// The legacy `ClientConfig` / `StunServerConfig` / `ClientConfigBuilder`
// definitions in this file were removed by P15-2 (§62.1). The only public
// configuration types are the RFC §10 types in `client_config_spec` and the
// RFC §12/§13 transport/ICE/STUN/TURN types in `transport_ice_spec`. They are
// re-exported here so that `crate::config::ClientConfig` (and the internal
// references in `client.rs`, `runtime/*`, `api/*`) resolve to the RFC types.
//
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.

// [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
pub use client_config_spec::{
    ClientAudioConfig, ClientConfig, LogLevel, RawSipEventConfig, TimeoutConfig,
};
// [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
pub use transport_ice_spec::{
    IceConfig, StunServerConfig, TcpTransportConfig, TransportConfig, TurnServerConfig,
    TurnTransport, UdpTransportConfig,
};
#[cfg(feature = "tls")]
// [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
pub use transport_ice_spec::TlsConfig;

#[cfg(test)]
mod tests {
    use super::*;

    // ── AuthCredentials (kept: public type no longer referenced by ClientConfig) ──

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

    // ── DtmfConfig (kept: reactor boot parameter source) ─────────────

    #[test]
    // @verifies C030
    // [::TICKET::] P7-2: O-002 — default DtmfConfig::sent_timeout_ms is the module default
// [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
    fn dtmf_config_default_sent_timeout() {
        assert_eq!(
            DtmfConfig::default().sent_timeout_ms,
            crate::api::m20_dtmfsent_twophase::DEFAULT_DTMF_SENT_TIMEOUT_MS
        );
    }
}
