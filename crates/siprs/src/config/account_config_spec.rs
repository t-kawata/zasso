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

use crate::api::incoming_call_refer::IncomingCallConfig;
use crate::security::SecretString;
use std::time::Duration;

/// Policy for selecting which transport protocol to use for this account.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AccountTransportPolicy {
    #[default]
    Udp,
    Tcp,
    Tls,
}

/// Method used to send or receive DTMF digits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DtmfMethod {
    Rfc2833,
    Rfc4733,
    Info,
    Inband,
}

/// SRTP (Secure RTP) policy for media encryption.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SrtpPolicy {
    #[default]
    Disabled,
    Optional,
    Mandatory,
}

/// Configuration for the Opus audio codec.
#[derive(Debug, Clone, PartialEq)]
pub struct OpusConfig {
    /// Bitrate in bps (range: 500–512000). Default: 32000.
    pub bitrate: u32,
    /// Encoding complexity (0–10). Default: 5.
    pub complexity: u8,
    /// Constant bitrate mode. Default: false.
    pub cbr: bool,
    /// In-band forward error correction. Default: true.
    pub inband_fec: bool,
    /// Discontinuous transmission (silence suppression). Default: false.
    pub dtx: bool,
    /// Packet time in ms (must be 10, 20, 40, or 60). Default: 20.
    pub ptime_ms: u16,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for OpusConfig {
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            bitrate: 32000,
            complexity: 5,
            cbr: false,
            inband_fec: true,
            dtx: false,
            ptime_ms: 20,
        }
    }
}

/// Codec policy for a SIP account — enables PCMU and/or Opus.
#[derive(Debug, Clone, PartialEq)]
pub struct AccountCodecPolicy {
    pub enable_pcmu: bool,
    pub enable_opus: bool,
    pub opus: OpusConfig,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for AccountCodecPolicy {
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            enable_pcmu: true,
            enable_opus: true,
            opus: OpusConfig::default(),
        }
    }
}

/// DTMF (Dual-Tone Multi-Frequency) signalling policy.
#[derive(Debug, Clone, PartialEq)]
pub struct DtmfPolicy {
    /// Allowed DTMF send methods. Must contain at least one entry.
    pub send_methods: Vec<DtmfMethod>,
    /// Allowed DTMF receive methods. Must contain at least one entry.
    pub receive_methods: Vec<DtmfMethod>,
    /// Default method for sending DTMF digits.
    pub default_send_method: DtmfMethod,
}

/// Media-related configuration for a SIP account.
#[derive(Debug, Clone, PartialEq)]
pub struct AccountMediaConfig {
    /// SRTP encryption policy.
    pub srtp: SrtpPolicy,
    /// Enable ICE for media transport.
    pub ice: bool,
    /// Enable Voice Activity Detection.
    pub vad: bool,
    /// Acoustic echo canceller tail length in ms.
    pub ec_tail_ms: u16,
    /// Input gain in dB.
    pub input_gain_db: f32,
    /// Output gain in dB.
    pub output_gain_db: f32,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for AccountMediaConfig {
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            srtp: SrtpPolicy::default(),
            ice: false,
            vad: true,
            ec_tail_ms: 256,
            input_gain_db: 0.0,
            output_gain_db: 0.0,
        }
    }
}

/// Complete configuration for a SIP account.
///
/// Each `SipAccount` requires an `AccountConfig` describing its SIP identity
/// (AOR), authentication credentials, codec preferences, and media settings.
#[derive(Debug, Clone, PartialEq)]
pub struct AccountConfig {
    /// Optional human-readable display name.
    pub display_name: Option<String>,
    /// SIP authentication username (required).
    pub username: String,
    /// Optional override for the SIP authentication username.
    pub auth_username: Option<String>,
    /// SIP password (zeroed on drop when zeroize feature is active).
    pub password: SecretString,
    /// SIP domain or AOR host (required).
    pub domain: String,
    /// Optional registrar URI. Defaults to `sip:{domain}` if unset.
    pub registrar_uri: Option<String>,
    /// Ordered list of outbound proxy URIs.
    pub outbound_proxy: Vec<String>,
    /// Additional Contact header parameters.
    pub contact_params: Vec<(String, String)>,
    /// Preferred transport protocol for this account.
    pub transport: AccountTransportPolicy,
    /// Automatically register with the SIP proxy on startup.
    pub register_on_start: bool,
    /// Allow outgoing calls even when not registered.
    pub allow_outbound_without_register: bool,
    /// Registration expiry interval.
    pub registration_expires: Duration,
    /// Codec selection policy.
    pub codecs: AccountCodecPolicy,
    /// DTMF signalling policy.
    pub dtmf: DtmfPolicy,
    /// Media configuration.
    pub media: AccountMediaConfig,
    /// Optional auto-reject timer for unanswered incoming calls.
    ///
    /// When `Some(config)` and `config.auto_reject_enabled` is `true`, the
    /// call is automatically rejected if not answered within
    /// `config.reject_timeout_ms`. `None` disables the timer.
    pub auto_reject_timer: Option<IncomingCallConfig>,
    /// Additional SIP headers to include.
    pub headers: Vec<(String, String)>,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl AccountConfig {
    /// Validate that all required fields are set and policy constraints are met.
    ///
    /// Returns `Ok(())` on success, or `Err(SipError)` with `SipErrorKind::InvalidConfig`
    /// describing the first validation failure.
    pub fn validate(&self) -> Result<(), crate::error::SipError> {
        if self.username.trim().is_empty() {
            return Err(crate::error::SipError::new(
                crate::error::SipErrorKind::InvalidConfig,
                "username must not be empty",
            ));
        }
        if self.domain.trim().is_empty() {
            return Err(crate::error::SipError::new(
                crate::error::SipErrorKind::InvalidConfig,
                "domain must not be empty",
            ));
        }
        if self.password.as_str().is_empty() {
            return Err(crate::error::SipError::new(
                crate::error::SipErrorKind::InvalidConfig,
                "password must not be empty",
            ));
        }
        if !self.codecs.enable_pcmu && !self.codecs.enable_opus {
            return Err(crate::error::SipError::new(
                crate::error::SipErrorKind::InvalidConfig,
                "at least one codec (PCMU or Opus) must be enabled",
            ));
        }
        if self.dtmf.send_methods.is_empty() {
            return Err(crate::error::SipError::new(
                crate::error::SipErrorKind::InvalidConfig,
                "at least one DTMF send method is required",
            ));
        }
        if self.dtmf.receive_methods.is_empty() {
            return Err(crate::error::SipError::new(
                crate::error::SipErrorKind::InvalidConfig,
                "at least one DTMF receive method is required",
            ));
        }
        if self.registration_expires.as_secs() == 0 {
            return Err(crate::error::SipError::new(
                crate::error::SipErrorKind::InvalidConfig,
                "registration_expires must be greater than zero",
            ));
        }
        // Validate OpusConfig ranges when Opus is enabled
        if self.codecs.enable_opus {
            let opus = &self.codecs.opus;
            if opus.bitrate < 500 || opus.bitrate > 512000 {
                return Err(crate::error::SipError::new(
                    crate::error::SipErrorKind::InvalidConfig,
                    "opus bitrate must be between 500 and 512000",
                ));
            }
            if opus.complexity > 10 {
                return Err(crate::error::SipError::new(
                    crate::error::SipErrorKind::InvalidConfig,
                    "opus complexity must be between 0 and 10",
                ));
            }
            if ![10, 20, 40, 60].contains(&opus.ptime_ms) {
                return Err(crate::error::SipError::new(
                    crate::error::SipErrorKind::InvalidConfig,
                    "opus ptime_ms must be 10, 20, 40, or 60",
                ));
            }
        }
        Ok(())
    }
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for AccountConfig {
    // [::TICKET::] P3-1, P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P5-2) --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            display_name: None,
            username: String::new(),
            auth_username: None,
            password: SecretString::new(""),
            domain: String::new(),
            registrar_uri: None,
            outbound_proxy: Vec::new(),
            contact_params: Vec::new(),
            transport: AccountTransportPolicy::default(),
            register_on_start: true,
            allow_outbound_without_register: false,
            registration_expires: Duration::from_secs(3600),
            codecs: AccountCodecPolicy::default(),
            dtmf: DtmfPolicy {
                send_methods: vec![DtmfMethod::Rfc2833],
                receive_methods: vec![DtmfMethod::Rfc2833],
                default_send_method: DtmfMethod::Rfc2833,
            },
            auto_reject_timer: None,
            media: AccountMediaConfig::default(),
            headers: Vec::new(),
        }
    }
}

/// Partial update for an `AccountConfig`.
///
/// Each `Some(field)` overrides the corresponding field of the stored config
/// when applied via [`AccountConfigPatch::apply`]; `None` leaves it unchanged.
/// `Option<T>` fields of the config are represented as `Option<Option<T>>` so a
/// caller can distinguish "leave unchanged" (`None`) from "clear" (`Some(None)`).
/// Applying a patch yields a full config that must pass [`AccountConfig::validate`]
/// (C052 fail-fast — the merged config is never dispatched unvalidated).
// [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct AccountConfigPatch {
    pub display_name: Option<Option<String>>,
    pub username: Option<String>,
    pub auth_username: Option<Option<String>>,
    pub password: Option<SecretString>,
    pub domain: Option<String>,
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
    pub auto_reject_timer: Option<Option<IncomingCallConfig>>,
    pub headers: Option<Vec<(String, String)>>,
}

// [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
impl AccountConfigPatch {
    /// Merge this patch into `base`, then validate the merged result.
    ///
    /// Returns `Err(SipErrorKind::InvalidConfig)` with a rule-specific message when
    /// the merged config violates any `AccountConfig::validate()` rule (C015/C052).
    pub fn apply(&self, base: &AccountConfig) -> Result<AccountConfig, crate::error::SipError> {
        let mut merged = base.clone();
        if let Some(v) = &self.display_name {
            merged.display_name = v.clone();
        }
        if let Some(v) = &self.username {
            merged.username = v.clone();
        }
        if let Some(v) = &self.auth_username {
            merged.auth_username = v.clone();
        }
        if let Some(v) = &self.password {
            merged.password = v.clone();
        }
        if let Some(v) = &self.domain {
            merged.domain = v.clone();
        }
        if let Some(v) = &self.registrar_uri {
            merged.registrar_uri = v.clone();
        }
        if let Some(v) = &self.outbound_proxy {
            merged.outbound_proxy = v.clone();
        }
        if let Some(v) = &self.contact_params {
            merged.contact_params = v.clone();
        }
        if let Some(v) = &self.transport {
            merged.transport = *v;
        }
        if let Some(v) = &self.register_on_start {
            merged.register_on_start = *v;
        }
        if let Some(v) = &self.allow_outbound_without_register {
            merged.allow_outbound_without_register = *v;
        }
        if let Some(v) = &self.registration_expires {
            merged.registration_expires = *v;
        }
        if let Some(v) = &self.codecs {
            merged.codecs = v.clone();
        }
        if let Some(v) = &self.dtmf {
            merged.dtmf = v.clone();
        }
        if let Some(v) = &self.media {
            merged.media = v.clone();
        }
        if let Some(v) = &self.auto_reject_timer {
            merged.auto_reject_timer = v.clone();
        }
        if let Some(v) = &self.headers {
            merged.headers = v.clone();
        }
        merged.validate()?;
        Ok(merged)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::{SipError, SipErrorKind};

    // ── Normal: AccountConfig construction ─────────────────────────

    #[test]
    // @verifies C015
    // [::TICKET::] P3-1, P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P5-2) --for-spec --no-implementation-order`.
    fn account_config_accepts_valid_fields() {
        let config = AccountConfig {
            display_name: Some("Alice".into()),
            username: "alice".into(),
            auth_username: Some("alice".into()),
            password: SecretString::new("pass123"),
            domain: "sip.example.com".into(),
            registrar_uri: Some("sip:sip.example.com".into()),
            outbound_proxy: vec![],
            contact_params: vec![],
            transport: AccountTransportPolicy::Udp,
            register_on_start: true,
            allow_outbound_without_register: false,
            registration_expires: Duration::from_secs(3600),
            codecs: AccountCodecPolicy {
                enable_pcmu: true,
                enable_opus: true,
                opus: OpusConfig::default(),
            },
            dtmf: DtmfPolicy {
                send_methods: vec![DtmfMethod::Rfc2833],
                receive_methods: vec![DtmfMethod::Rfc2833],
                default_send_method: DtmfMethod::Rfc2833,
            },
            media: AccountMediaConfig::default(),
            auto_reject_timer: None,
            headers: vec![],
        };
        assert_eq!(config.username, "alice");
        assert_eq!(config.domain, "sip.example.com");
        assert_eq!(config.transport, AccountTransportPolicy::Udp);
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_validate_passes_for_valid_config() {
        let config = AccountConfig {
            username: "bob".into(),
            domain: "pbx.example.com".into(),
            password: SecretString::new("abc"),
            codecs: AccountCodecPolicy {
                enable_pcmu: true,
                enable_opus: false,
                opus: OpusConfig::default(),
            },
            dtmf: DtmfPolicy {
                send_methods: vec![DtmfMethod::Rfc2833, DtmfMethod::Info],
                receive_methods: vec![DtmfMethod::Rfc2833],
                default_send_method: DtmfMethod::Rfc2833,
            },
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_default_has_valid_codec_policy() {
        let config = AccountConfig::default();
        assert!(config.codecs.enable_pcmu || config.codecs.enable_opus);
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_codec_policy_with_both_codecs_passes() {
        let policy = AccountCodecPolicy {
            enable_pcmu: true,
            enable_opus: true,
            opus: OpusConfig::default(),
        };
        // No validation on AccountCodecPolicy itself — validated via AccountConfig::validate()
        let config = AccountConfig {
            username: "a".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            codecs: policy,
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn dtmf_policy_with_single_method_passes() {
        let config = AccountConfig {
            username: "a".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            dtmf: DtmfPolicy {
                send_methods: vec![DtmfMethod::Rfc2833],
                receive_methods: vec![DtmfMethod::Info],
                default_send_method: DtmfMethod::Rfc2833,
            },
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_transport_policy_default_is_udp() {
        assert_eq!(
            AccountTransportPolicy::default(),
            AccountTransportPolicy::Udp
        );
    }

    #[test]
    // @verifies C043
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn srtp_policy_default_is_disabled() {
        assert_eq!(SrtpPolicy::default(), SrtpPolicy::Disabled);
    }

    // ── Error: Validation failures ──────────────────────────────────

    #[test]
    // @verifies C013, C015
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_rejects_empty_username() {
        let config = AccountConfig {
            username: "".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("username"));
    }

    #[test]
    // @verifies C015, C052
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_rejects_empty_domain() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "".into(),
            password: SecretString::new("p"),
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(
            err.message.contains("domain") || err.message.contains("username"),
            "error message must mention domain or username: {}",
            err.message
        );
    }

    #[test]
    // @verifies C015, C052
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_rejects_empty_password() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new(""),
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("password"));
    }

    #[test]
    // @verifies C041, C052
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_rejects_no_codecs() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            codecs: AccountCodecPolicy {
                enable_pcmu: false,
                enable_opus: false,
                opus: OpusConfig::default(),
            },
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("codec"));
    }

    #[test]
    // @verifies C041, C052
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_rejects_empty_dtmf_send_methods() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            dtmf: DtmfPolicy {
                send_methods: vec![],
                receive_methods: vec![DtmfMethod::Rfc2833],
                default_send_method: DtmfMethod::Rfc2833,
            },
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("DTMF"));
    }

    #[test]
    // @verifies C041, C052
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_rejects_empty_dtmf_receive_methods() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            dtmf: DtmfPolicy {
                send_methods: vec![DtmfMethod::Rfc2833],
                receive_methods: vec![],
                default_send_method: DtmfMethod::Rfc2833,
            },
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("DTMF"));
    }

    #[test]
    // @verifies C015, C052
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_rejects_zero_registration_expires() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            registration_expires: Duration::from_secs(0),
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("registration_expires"));
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_rejects_invalid_opus_bitrate() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            codecs: AccountCodecPolicy {
                enable_opus: true,
                opus: OpusConfig {
                    bitrate: 100, // < 500
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("bitrate"));
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_rejects_invalid_opus_ptime() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            codecs: AccountCodecPolicy {
                enable_opus: true,
                opus: OpusConfig {
                    ptime_ms: 30, // invalid — must be 10, 20, 40, or 60
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("ptime_ms"));
    }

    // ── Boundary ────────────────────────────────────────────────────

    #[test]
    // @verifies C015
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_accepts_empty_display_name() {
        let config = AccountConfig {
            display_name: None,
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_accepts_optional_fields_unset() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            auth_username: None,
            registrar_uri: None,
            outbound_proxy: vec![],
            contact_params: vec![],
            headers: vec![],
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_accepts_max_registration_expires() {
        let config = AccountConfig {
            username: "u".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            registration_expires: Duration::from_secs(86400 * 365), // 1 year
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    // @verifies C041
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_accepts_opus_complexity_boundaries() {
        for complexity in [0u8, 5u8, 10u8] {
            let config = AccountConfig {
                username: "u".into(),
                domain: "d".into(),
                password: SecretString::new("p"),
                codecs: AccountCodecPolicy {
                    enable_opus: true,
                    opus: OpusConfig {
                        complexity,
                        ..Default::default()
                    },
                    ..Default::default()
                },
                ..Default::default()
            };
            assert!(
                config.validate().is_ok(),
                "complexity={} should be valid",
                complexity
            );
        }
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_config_empty_username_rejected_secure() {
        // Whitespace-only username
        let config = AccountConfig {
            username: "   ".into(),
            domain: "d".into(),
            password: SecretString::new("p"),
            ..Default::default()
        };
        assert!(config.validate().is_err());
    }

    // ── OpusConfig defaults ─────────────────────────────────────────

    #[test]
    // @verifies C041
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn opus_config_default_values() {
        let opus = OpusConfig::default();
        assert_eq!(opus.bitrate, 32000);
        assert_eq!(opus.complexity, 5);
        assert!(!opus.cbr);
        assert!(opus.inband_fec);
        assert!(!opus.dtx);
        assert_eq!(opus.ptime_ms, 20);
    }

    // ── AccountMediaConfig defaults ─────────────────────────────────

    #[test]
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_media_config_default_values() {
        let media = AccountMediaConfig::default();
        assert_eq!(media.srtp, SrtpPolicy::Disabled);
        assert!(!media.ice);
        assert!(media.vad);
        assert_eq!(media.ec_tail_ms, 256);
        assert_eq!(media.input_gain_db, 0.0);
        assert_eq!(media.output_gain_db, 0.0);
    }

    // ── AccountCodecPolicy defaults ─────────────────────────────────

    #[test]
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_codec_policy_default_enables_both() {
        let policy = AccountCodecPolicy::default();
        assert!(policy.enable_pcmu);
        assert!(policy.enable_opus);
    }

    // ── Invariant: Enum derives ─────────────────────────────────────

    #[test]
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn account_transport_policy_derives_required_traits() {
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_clone::<AccountTransportPolicy>();
        assert_copy::<AccountTransportPolicy>();
        assert_partial_eq::<AccountTransportPolicy>();
        assert_eq_trait::<AccountTransportPolicy>();
        assert_debug::<AccountTransportPolicy>();
    }

    #[test]
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn srtp_policy_derives_required_traits() {
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_clone::<SrtpPolicy>();
        assert_copy::<SrtpPolicy>();
        assert_debug::<SrtpPolicy>();
    }

    #[test]
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn dtmf_method_derives_required_traits() {
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P3-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P10-3) --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_clone::<DtmfMethod>();
        assert_copy::<DtmfMethod>();
        assert_debug::<DtmfMethod>();
    }

    // ── P10-3: AccountConfigPatch (partial update for update_config) ───

    #[test]
    // @verifies C015
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn account_config_patch_default_is_empty() {
        let patch = AccountConfigPatch::default();
        assert!(patch.display_name.is_none());
        assert!(patch.username.is_none());
        assert!(patch.auth_username.is_none());
        assert!(patch.password.is_none());
        assert!(patch.domain.is_none());
        assert!(patch.registrar_uri.is_none());
        assert!(patch.outbound_proxy.is_none());
        assert!(patch.contact_params.is_none());
        assert!(patch.transport.is_none());
        assert!(patch.register_on_start.is_none());
        assert!(patch.allow_outbound_without_register.is_none());
        assert!(patch.registration_expires.is_none());
        assert!(patch.codecs.is_none());
        assert!(patch.dtmf.is_none());
        assert!(patch.media.is_none());
        assert!(patch.auto_reject_timer.is_none());
        assert!(patch.headers.is_none());
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn account_config_patch_apply_overrides_only_some_fields() -> Result<(), SipError> {
        let base = AccountConfig {
            username: "alice".into(),
            domain: "sip.example.com".into(),
            password: SecretString::new("pass123"),
            registrar_uri: Some("sip:sip.example.com".into()),
            ..Default::default()
        };
        let patch = AccountConfigPatch {
            username: Some("bob".into()),
            ..Default::default()
        };
        let merged = patch.apply(&base)?;
        assert_eq!(merged.username, "bob");
        assert_eq!(merged.domain, "sip.example.com", "unpatched field must be preserved");
        assert_eq!(merged.registrar_uri, Some("sip:sip.example.com".into()));
        assert_eq!(merged.password.as_str(), "pass123");
        Ok(())
    }

    #[test]
    // @verifies C052
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn account_config_patch_apply_validates_merged_config() -> Result<(), SipError> {
        let base = AccountConfig {
            username: "alice".into(),
            domain: "sip.example.com".into(),
            password: SecretString::new("pass123"),
            ..Default::default()
        };
        let patch = AccountConfigPatch {
            username: Some(String::new()),
            ..Default::default()
        };
        let err = match patch.apply(&base) {
            Err(e) => e,
            Ok(_) => {
                return Err(SipError::new(
                    SipErrorKind::InvalidConfig,
                    "empty username must fail merged validation",
                ))
            }
        };
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("username"));
        Ok(())
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn account_config_patch_apply_handles_option_fields() -> Result<(), SipError> {
        let base = AccountConfig {
            username: "alice".into(),
            domain: "sip.example.com".into(),
            password: SecretString::new("pass123"),
            ..Default::default()
        };
        let set = AccountConfigPatch {
            display_name: Some(Some("Alice".into())),
            ..Default::default()
        };
        assert_eq!(
            set.apply(&base)?.display_name,
            Some("Alice".into())
        );
        let clear = AccountConfigPatch {
            display_name: Some(None),
            ..Default::default()
        };
        assert_eq!(clear.apply(&base)?.display_name, None);
        Ok(())
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn account_config_patch_apply_updates_scalar_fields() -> Result<(), SipError> {
        let base = AccountConfig {
            username: "alice".into(),
            domain: "sip.example.com".into(),
            password: SecretString::new("pass123"),
            ..Default::default()
        };
        let patch = AccountConfigPatch {
            register_on_start: Some(false),
            allow_outbound_without_register: Some(true),
            registration_expires: Some(Duration::from_secs(1800)),
            transport: Some(AccountTransportPolicy::Tcp),
            ..Default::default()
        };
        let merged = patch.apply(&base)?;
        assert!(!merged.register_on_start);
        assert!(merged.allow_outbound_without_register);
        assert_eq!(merged.registration_expires, Duration::from_secs(1800));
        assert_eq!(merged.transport, AccountTransportPolicy::Tcp);
        Ok(())
    }
}
