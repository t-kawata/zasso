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
//   - NODE_ID=N0014:  §11 AccountConfig Full Specification
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0014 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Account configuration — SIP account settings, codec policy, DTMF, and media config.
//!
//! Defines `AccountConfig` with all 16 RFC-specified fields, sub-types for codec
//! policy (`AccountCodecPolicy`, `OpusConfig`), DTMF (`DtmfPolicy`, `DtmfMethod`),
//! media (`AccountMediaConfig`, `SrtpPolicy`), and transport policy
//! (`AccountTransportPolicy`), plus the `AccountConfigPatch` for partial updates.
//!
//! ## Validation rules (§11.1)
//!
//! - `username`, `domain`, `password` must be non-empty.
//! - `register_on_start == false` with `allow_outbound_without_register == true` is valid.
//! - If `registrar_uri` is `None`, it is auto-derived as `sip:{domain}`.
//! - Codec policy requires at least one of `enable_pcmu` or `enable_opus`.
//! - DTMF send and receive method lists must each contain at least one method.

use std::time::Duration;

use crate::config::transport_ice_spec::SrtpPolicy;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Minimum allowed registration expiry in seconds (per RFC).
const MIN_REGISTRATION_EXPIRY_SECS: u64 = 30;

/// Default registration expiry in seconds.
const DEFAULT_REGISTRATION_EXPIRY_SECS: u64 = 3600;

/// Opus minimum bitrate in bps.
const OPUS_BITRATE_MIN: u32 = 6000;
/// Opus maximum bitrate in bps.
const OPUS_BITRATE_MAX: u32 = 510_000;

/// Opus minimum complexity (0 = fastest, lowest quality).
const OPUS_COMPLEXITY_MIN: u8 = 0;
/// Opus maximum complexity (10 = slowest, highest quality).
const OPUS_COMPLEXITY_MAX: u8 = 10;

/// Default Opus bitrate (medium quality).
const DEFAULT_OPUS_BITRATE: u32 = 64_000;
/// Default Opus complexity (balanced).
const DEFAULT_OPUS_COMPLEXITY: u8 = 5;
/// Default Opus packet time in milliseconds.
const DEFAULT_OPUS_PTIME_MS: u16 = 20;

// ---------------------------------------------------------------------------
// AccountConfig — 16-field root configuration type
// ---------------------------------------------------------------------------

/// Complete SIP account configuration.
///
/// Specifies the SIP credentials, registrar, transport preference, codec
/// policy, DTMF settings, and media parameters for a single SIP account.
/// All validation rules from §11.1 are enforced at construction time.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AccountConfig {
    /// Optional human-readable display name sent in SIP `From` headers.
    pub display_name: Option<String>,
    /// SIP authentication username (required, non-empty).
    pub username: String,
    /// Optional alternative username for authentication
    /// (if different from `username`).
    pub auth_username: Option<String>,
    /// SIP account password.
    // [::STUB::] P1-2: Replace String with SecretString once security module is declared.
    pub password: String,
    /// SIP domain / realm (required, non-empty).
    pub domain: String,
    /// SIP registrar URI. If `None`, auto-derived as `sip:{domain}`.
    pub registrar_uri: Option<String>,
    /// Ordered list of outbound proxy URIs.
    pub outbound_proxy: Vec<String>,
    /// SIP Contact header parameters (e.g. `+sip.instance`, `+org.3gpp.imei`).
    pub contact_params: Vec<(String, String)>,
    /// Preferred transport protocol for this account.
    pub transport: AccountTransportPolicy,
    /// Whether to register with the SIP provider on start.
    pub register_on_start: bool,
    /// Allow sending out-of-dialog requests (including calls) without
    /// an active registration.
    pub allow_outbound_without_register: bool,
    /// Registration expiry interval. Minimum: 30 seconds.
    pub registration_expires: Duration,
    /// Audio codec policy (PCMU, Opus).
    pub codecs: AccountCodecPolicy,
    /// DTMF (touch-tone) signalling policy.
    pub dtmf: DtmfPolicy,
    /// Media stream configuration (SRTP, ICE, VAD, echo cancellation, gain).
    pub media: AccountMediaConfig,
    /// Custom SIP headers to include in registration requests.
    pub headers: Vec<(String, String)>,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl AccountConfig {
    /// Creates a new `AccountConfig` with minimal required fields.
    ///
    /// Returns `Err(SipError::InvalidConfig)` if any required field is empty
    /// or if validation rules are violated.
    pub fn new(
        username: impl Into<String>,
        domain: impl Into<String>,
        password: impl Into<String>,
    ) -> Result<Self, crate::error::SipError> {
        let config = AccountConfig {
            display_name: None,
            username: username.into(),
            auth_username: None,
            password: password.into(),
            domain: domain.into(),
            registrar_uri: None,
            outbound_proxy: vec![],
            contact_params: vec![],
            transport: AccountTransportPolicy::default(),
            register_on_start: true,
            allow_outbound_without_register: false,
            registration_expires: Duration::from_secs(DEFAULT_REGISTRATION_EXPIRY_SECS),
            codecs: AccountCodecPolicy::default(),
            dtmf: DtmfPolicy::default(),
            media: AccountMediaConfig::default(),
            headers: vec![],
        };
        config.validate()?;
        Ok(config)
    }

    /// Validates all fields according to §11.1 rules.
    ///
    /// Returns `Ok(())` if all rules pass, or `Err(SipError::InvalidConfig)`
    /// with a descriptive message on the first violation found.
    pub fn validate(&self) -> Result<(), crate::error::SipError> {
        // All three required fields must be non-empty
        if self.username.is_empty() {
            return Err(crate::error::SipError::invalid_config(
                "AccountConfig: username must not be empty",
            ));
        }
        if self.domain.is_empty() {
            return Err(crate::error::SipError::invalid_config(
                "AccountConfig: domain must not be empty",
            ));
        }
        if self.password.is_empty() {
            return Err(crate::error::SipError::invalid_config(
                "AccountConfig: password must not be empty",
            ));
        }
        // Codec policy: at least one codec must be enabled
        if !self.codecs.enable_pcmu && !self.codecs.enable_opus {
            return Err(crate::error::SipError::invalid_config(
                "AccountConfig: at least one codec (PCMU or Opus) must be enabled in codec policy",
            ));
        }
        // DTMF policy: at least one send and one receive method required
        if self.dtmf.send_methods.is_empty() {
            return Err(crate::error::SipError::invalid_config(
                "AccountConfig: at least one DTMF send method is required",
            ));
        }
        if self.dtmf.receive_methods.is_empty() {
            return Err(crate::error::SipError::invalid_config(
                "AccountConfig: at least one DTMF receive method is required",
            ));
        }
        // Registration expiry minimum
        if self.registration_expires < Duration::from_secs(MIN_REGISTRATION_EXPIRY_SECS) {
            return Err(crate::error::SipError::invalid_config(
                "AccountConfig: registration_expires must be at least 30 seconds",
            ));
        }
        Ok(())
    }

    /// Returns the effective registrar URI, auto-deriving `sip:{domain}`
    /// when `registrar_uri` is `None`.
    pub fn effective_registrar_uri(&self) -> String {
        self.registrar_uri
            .clone()
            .unwrap_or_else(|| format!("sip:{}", self.domain))
    }
}

// ---------------------------------------------------------------------------
// Default implementations
// ---------------------------------------------------------------------------

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for AccountConfig {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn default() -> Self {
        // Minimal valid default: username, domain, password required.
        AccountConfig {
            display_name: None,
            username: String::new(),
            auth_username: None,
            password: String::new(),
            domain: String::new(),
            registrar_uri: None,
            outbound_proxy: vec![],
            contact_params: vec![],
            transport: AccountTransportPolicy::default(),
            register_on_start: true,
            allow_outbound_without_register: false,
            registration_expires: Duration::from_secs(DEFAULT_REGISTRATION_EXPIRY_SECS),
            codecs: AccountCodecPolicy::default(),
            dtmf: DtmfPolicy::default(),
            media: AccountMediaConfig::default(),
            headers: vec![],
        }
    }
}

// ---------------------------------------------------------------------------
// AccountConfigPatch — partial update for SipAccountHandle::update_config
// ---------------------------------------------------------------------------

/// Partial account configuration update, applied by
/// `SipAccountHandle::update_config()`.
///
/// Each `Option` field uses `Some(value)` to change a value and `None` to
/// leave it unchanged. This allows updating a subset of fields without
/// re-sending the entire account configuration.
#[derive(Debug, Clone, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AccountConfigPatch {
    pub display_name: Option<Option<String>>,
    pub auth_username: Option<Option<String>>,
    // [::STUB::] P1-2: Replace String with SecretString
    pub password: Option<String>,
    pub registrar_uri: Option<Option<String>>,
    pub outbound_proxy: Option<Vec<String>>,
    pub contact_params: Option<Vec<(String, String)>>,
    pub transport: Option<AccountTransportPolicy>,
    pub register_on_start: Option<bool>,
    pub allow_outbound_without_register: Option<bool>,
    pub registration_expires: Option<Duration>,
    pub codecs: Option<AccountCodecPolicy>,
    pub dtmf: Option<DtmfPolicy>,
    pub media: Option<AccountMediaConfig>,
    pub headers: Option<Vec<(String, String)>>,
}

// ---------------------------------------------------------------------------
// AccountTransportPolicy
// ---------------------------------------------------------------------------

/// Transport protocol preference for a single account.
///
/// This is the per-account transport setting (as opposed to the global
/// `TransportConfig` which binds listener ports). The account will use
/// this protocol for outbound signalling to the chosen transport.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum AccountTransportPolicy {
    /// Use UDP for SIP signalling.
    Udp,
    /// Use TCP for SIP signalling.
    Tcp,
    /// Use TLS for SIP signalling (requires matching transport listener).
    Tls,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for AccountTransportPolicy {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn default() -> Self {
        AccountTransportPolicy::Udp
    }
}

// ---------------------------------------------------------------------------
// AccountCodecPolicy & OpusConfig
// ---------------------------------------------------------------------------

/// Audio codec enable/disable policy for an account.
///
/// At least one of `enable_pcmu` or `enable_opus` must be `true`.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AccountCodecPolicy {
    /// Enable PCMU (G.711 μ-law) — universally supported, low complexity.
    pub enable_pcmu: bool,
    /// Enable Opus — high quality, variable bitrate, recommended.
    pub enable_opus: bool,
    /// Opus-specific encoder configuration.
    pub opus: OpusConfig,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for AccountCodecPolicy {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn default() -> Self {
        AccountCodecPolicy {
            enable_pcmu: true,
            enable_opus: true,
            opus: OpusConfig::default(),
        }
    }
}

/// Opus audio codec encoder configuration.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct OpusConfig {
    /// Encoder bitrate in bps (6,000–510,000). Default: 64,000.
    pub bitrate: u32,
    /// Encoder complexity (0–10). Default: 5.
    pub complexity: u8,
    /// Enable constant bitrate mode (vs variable bitrate).
    pub cbr: bool,
    /// Enable in-band forward error correction (FEC).
    pub inband_fec: bool,
    /// Enable discontinuous transmission (silence suppression).
    pub dtx: bool,
    /// Packetisation time in milliseconds (20, 40, 60 — 20 recommended).
    pub ptime_ms: u16,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl OpusConfig {
    /// Validates the Opus config fields, returning an error if any value
    /// is out of range.
    pub fn validate(&self) -> Result<(), crate::error::SipError> {
        if self.bitrate < OPUS_BITRATE_MIN || self.bitrate > OPUS_BITRATE_MAX {
            return Err(crate::error::SipError::invalid_config(
                "OpusConfig: bitrate must be between 6000 and 510000",
            ));
        }
        if self.complexity < OPUS_COMPLEXITY_MIN || self.complexity > OPUS_COMPLEXITY_MAX {
            return Err(crate::error::SipError::invalid_config(
                "OpusConfig: complexity must be between 0 and 10",
            ));
        }
        Ok(())
    }
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for OpusConfig {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn default() -> Self {
        OpusConfig {
            bitrate: DEFAULT_OPUS_BITRATE,
            complexity: DEFAULT_OPUS_COMPLEXITY,
            cbr: false,
            inband_fec: true,
            dtx: false,
            ptime_ms: DEFAULT_OPUS_PTIME_MS,
        }
    }
}

// ---------------------------------------------------------------------------
// DtmfPolicy & DtmfMethod
// ---------------------------------------------------------------------------

/// DTMF (touch-tone) signalling policy for a SIP account.
///
/// Defines which methods are accepted for sending and receiving DTMF digits.
/// Both the send and receive method lists must be non-empty.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct DtmfPolicy {
    /// Allowed DTMF send methods (priority-ordered — first is preferred).
    pub send_methods: Vec<DtmfMethod>,
    /// Allowed DTMF receive methods (accepted from remote).
    pub receive_methods: Vec<DtmfMethod>,
    /// Default DTMF send method when none is specified per-call.
    pub default_send_method: DtmfMethod,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for DtmfPolicy {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn default() -> Self {
        DtmfPolicy {
            send_methods: vec![DtmfMethod::Rfc2833, DtmfMethod::Info],
            receive_methods: vec![DtmfMethod::Rfc2833, DtmfMethod::Info, DtmfMethod::Inband],
            default_send_method: DtmfMethod::Rfc2833,
        }
    }
}

/// DTMF digit signalling method.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum DtmfMethod {
    /// RFC 2833 — DTMF digits carried in RTP payload (recommended).
    Rfc2833,
    /// SIP INFO — DTMF digits carried in SIP INFO messages.
    Info,
    /// In-band — DTMF digits encoded in the audio stream (unreliable
    /// with lossy codecs).
    Inband,
}

// ---------------------------------------------------------------------------
// AccountMediaConfig & SrtpPolicy
// ---------------------------------------------------------------------------

/// Media stream configuration for a SIP account.
///
/// Controls SRTP, ICE, VAD, echo cancellation, and input/output gain.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AccountMediaConfig {
    /// SRTP (Secure RTP) policy for media encryption.
    pub srtp: SrtpPolicy,
    /// Enable ICE (Interactive Connectivity Establishment) for NAT traversal.
    pub ice: bool,
    /// Enable Voice Activity Detection (silence suppression).
    pub vad: bool,
    /// Acoustic echo cancellation tail length in milliseconds.
    /// 0 disables AEC. Typical values: 100–500.
    pub ec_tail_ms: u16,
    /// Input (microphone) gain in decibels. 0.0 = no change.
    pub input_gain_db: f32,
    /// Output (speaker) gain in decibels. 0.0 = no change.
    pub output_gain_db: f32,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for AccountMediaConfig {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn default() -> Self {
        AccountMediaConfig {
            srtp: SrtpPolicy::Disabled,
            ice: true,
            vad: true,
            ec_tail_ms: 200,
            input_gain_db: 0.0,
            output_gain_db: 0.0,
        }
    }
}

// ---------------------------------------------------------------------------
// SrtpPolicy is re-exported from transport_ice_spec.rs (imported at top)
// Definition is there to keep all transport/ICE types together.
// ---------------------------------------------------------------------------

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // AccountConfig normal construction
    // -----------------------------------------------------------------------

    /// @verifies C015-precondition
    /// @verifies C015-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_new_valid() -> Result<(), crate::error::SipError> {
        let config = AccountConfig::new("alice", "sip.example.com", "secret")?;
        assert_eq!(config.username, "alice");
        assert_eq!(config.domain, "sip.example.com");
        assert_eq!(config.password, "secret");
        assert!(config.register_on_start);
        assert_eq!(
            config.registration_expires,
            Duration::from_secs(DEFAULT_REGISTRATION_EXPIRY_SECS)
        );
        Ok(())
    }

    /// @verifies C015-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_valid_full() -> Result<(), crate::error::SipError> {
        let config = AccountConfig {
            display_name: Some("Alice SIP".into()),
            username: "alice".into(),
            auth_username: Some("alice_auth".into()),
            password: "secret".into(),
            domain: "sip.example.com".into(),
            registrar_uri: Some("sip:registrar.example.com:5060".into()),
            outbound_proxy: vec!["sip:proxy1.example.com".into()],
            contact_params: vec![("+sip.instance".into(), "\"<urn:uuid:...>\"".into())],
            transport: AccountTransportPolicy::Tcp,
            register_on_start: true,
            allow_outbound_without_register: false,
            registration_expires: Duration::from_secs(600),
            codecs: AccountCodecPolicy::default(),
            dtmf: DtmfPolicy::default(),
            media: AccountMediaConfig::default(),
            headers: vec![("X-Custom".into(), "value".into())],
        };
        config.validate()?;
        Ok(())
    }

    /// @verifies C015-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_registrar_auto_derived() -> Result<(), crate::error::SipError> {
        let config = AccountConfig::new("bob", "sip.bob.com", "pass")?;
        assert_eq!(config.effective_registrar_uri(), "sip:sip.bob.com");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // AccountConfig validation errors
    // -----------------------------------------------------------------------

    /// @verifies C015-postcondition
    /// @verifies C015-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_empty_username_rejected() {
        let result = AccountConfig::new("", "domain", "pass");
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().kind,
            crate::error::SipErrorKind::InvalidConfig
        );
    }

    /// @verifies C015-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_empty_domain_rejected() {
        let result = AccountConfig::new("user", "", "pass");
        assert!(result.is_err());
    }

    /// @verifies C015-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_empty_password_rejected() {
        let result = AccountConfig::new("user", "domain", "");
        assert!(result.is_err());
    }

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_both_codecs_disabled_rejected() {
        let config = AccountConfig {
            codecs: AccountCodecPolicy {
                enable_pcmu: false,
                enable_opus: false,
                ..Default::default()
            },
            ..Default::default()
        };
        let result = config.validate();
        assert!(result.is_err());
    }

    /// @verifies C041-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_pcmu_only_valid() -> Result<(), crate::error::SipError> {
        let mut config = AccountConfig::new("user", "domain", "pass")?;
        config.codecs = AccountCodecPolicy {
            enable_pcmu: true,
            enable_opus: false,
            ..Default::default()
        };
        config.validate()?;
        Ok(())
    }

    /// @verifies C041-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_opus_only_valid() -> Result<(), crate::error::SipError> {
        let mut config = AccountConfig::new("user", "domain", "pass")?;
        config.codecs = AccountCodecPolicy {
            enable_pcmu: false,
            enable_opus: true,
            ..Default::default()
        };
        config.validate()?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // DTMF policy validation
    // -----------------------------------------------------------------------

    /// @verifies C015-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_empty_dtmf_send_rejected() {
        let config = AccountConfig {
            dtmf: DtmfPolicy {
                send_methods: vec![],
                ..Default::default()
            },
            ..Default::default()
        };
        let result = config.validate();
        assert!(result.is_err());
    }

    /// @verifies C015-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_empty_dtmf_receive_rejected() {
        let config = AccountConfig {
            dtmf: DtmfPolicy {
                receive_methods: vec![],
                ..Default::default()
            },
            ..Default::default()
        };
        let result = config.validate();
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Boundary conditions
    // -----------------------------------------------------------------------

    /// @verifies C015-boundary
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_register_on_start_false_outbound_true() -> Result<(), crate::error::SipError>
    {
        let mut config = AccountConfig::new("user", "domain", "pass")?;
        config.register_on_start = false;
        config.allow_outbound_without_register = true;
        config.validate()?;
        Ok(())
    }

    /// @verifies C015-boundary
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_registration_expires_minimum() -> Result<(), crate::error::SipError> {
        let mut config = AccountConfig::new("user", "domain", "pass")?;
        config.registration_expires = Duration::from_secs(MIN_REGISTRATION_EXPIRY_SECS);
        config.validate()?;
        Ok(())
    }

    /// @verifies C015-boundary
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_registration_expires_below_minimum_rejected() {
        let config = AccountConfig {
            registration_expires: Duration::from_secs(10),
            ..Default::default()
        };
        let result = config.validate();
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // OpusConfig validation
    // -----------------------------------------------------------------------

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn opus_config_default_valid() -> Result<(), crate::error::SipError> {
        let opus = OpusConfig::default();
        opus.validate()?;
        Ok(())
    }

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn opus_config_bitrate_limits() -> Result<(), crate::error::SipError> {
        let low = OpusConfig {
            bitrate: OPUS_BITRATE_MIN,
            ..Default::default()
        };
        low.validate()?;
        let high = OpusConfig {
            bitrate: OPUS_BITRATE_MAX,
            ..Default::default()
        };
        high.validate()?;
        Ok(())
    }

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn opus_config_bitrate_out_of_range_rejected() {
        let low = OpusConfig {
            bitrate: OPUS_BITRATE_MIN - 1,
            ..Default::default()
        };
        assert!(low.validate().is_err());
        let high = OpusConfig {
            bitrate: OPUS_BITRATE_MAX + 1,
            ..Default::default()
        };
        assert!(high.validate().is_err());
    }

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn opus_config_complexity_bounds() -> Result<(), crate::error::SipError> {
        let min = OpusConfig {
            complexity: OPUS_COMPLEXITY_MIN,
            ..Default::default()
        };
        min.validate()?;
        let max = OpusConfig {
            complexity: OPUS_COMPLEXITY_MAX,
            ..Default::default()
        };
        max.validate()?;
        Ok(())
    }

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn opus_config_complexity_out_of_range_rejected() {
        let high = OpusConfig {
            complexity: OPUS_COMPLEXITY_MAX + 1,
            ..Default::default()
        };
        assert!(high.validate().is_err());
    }

    // -----------------------------------------------------------------------
    // AccountMediaConfig defaults
    // -----------------------------------------------------------------------

    /// @verifies C043-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_media_config_defaults() {
        let media = AccountMediaConfig::default();
        assert_eq!(media.srtp, SrtpPolicy::Disabled);
        assert!(media.ice);
        assert!(media.vad);
        assert_eq!(media.ec_tail_ms, 200);
        assert_eq!(media.input_gain_db, 0.0);
        assert_eq!(media.output_gain_db, 0.0);
    }

    // -----------------------------------------------------------------------
    // AccountTransportPolicy
    // -----------------------------------------------------------------------

    /// @verifies C016-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_transport_policy_default_is_udp() {
        assert_eq!(
            AccountTransportPolicy::default(),
            AccountTransportPolicy::Udp
        );
    }

    // -----------------------------------------------------------------------
    // AccountConfigPatch
    // -----------------------------------------------------------------------

    /// @verifies C027-postcondition
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_patch_default_all_none() {
        let patch = AccountConfigPatch::default();
        assert!(patch.password.is_none());
        assert!(patch.register_on_start.is_none());
        assert!(patch.transport.is_none());
    }

    // -----------------------------------------------------------------------
    // Clone/Debug
    // -----------------------------------------------------------------------

    /// @verifies C015-invariant
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_implements_debug_clone() {
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_debug::<AccountConfig>();
        assert_clone::<AccountConfig>();
        assert_debug::<AccountCodecPolicy>();
        assert_clone::<AccountCodecPolicy>();
        assert_debug::<OpusConfig>();
        assert_clone::<OpusConfig>();
        assert_debug::<DtmfPolicy>();
        assert_clone::<DtmfPolicy>();
        assert_debug::<AccountMediaConfig>();
        assert_clone::<AccountMediaConfig>();
    }

    // -----------------------------------------------------------------------
    // Serde roundtrip (when serde feature enabled)
    // -----------------------------------------------------------------------

    #[cfg(feature = "serde")]
    #[test]
// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
    fn account_config_serde_roundtrip() -> Result<(), crate::error::SipError> {
        let config = AccountConfig::new("alice", "sip.example.com", "secret")?;
        let json = serde_json::to_string(&config).unwrap();
        let restored: AccountConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config.username, restored.username);
        assert_eq!(config.password, restored.password);
        Ok(())
    }
}
