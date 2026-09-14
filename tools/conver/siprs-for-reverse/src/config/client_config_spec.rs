
use crate::config::transport_ice_spec::{
    IceConfig, StunServerConfig, TransportConfig, TurnServerConfig,
};
use crate::error::{SipError, SipErrorKind};
use crate::model::{AudioFormat, BitDepth, ChannelLayout, SampleRate};
use std::time::Duration;

/// Logging verbosity level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
    Trace,
}

/// Audio processing configuration for the SIP client.
#[derive(Debug, Clone, PartialEq)]
pub struct ClientAudioConfig {
    /// Default format for audio delivery.
    pub default_delivery_format: AudioFormat,
    /// Pair buffer duration in ms.
    pub pair_buffer_ms: u32,
    /// Jitter buffer duration in ms.
    pub jitter_buffer_ms: u32,
    /// Audio mixer frame duration in ms.
    pub mixer_frame_ms: u32,
    /// Maximum number of audio sources per call.
    pub max_sources_per_call: usize,
    /// Resampler quality setting.
    ///
    /// Stored as a `String` because the `ResamplerQuality` enum from RFC §10 is
    /// not implemented in the tree yet; the value is one of the quality levels
    /// the underlying resampler accepts (e.g. "High").
    pub resampler_quality: String,
}

impl Default for ClientAudioConfig {
    fn default() -> Self {
        Self {
            default_delivery_format: AudioFormat {
                sample_rate: SampleRate::Hz16000,
                bit_depth: BitDepth::I16,
                channel_layout: ChannelLayout::StereoInOut,
                frame_ms: 20,
            },
            pair_buffer_ms: 120,
            jitter_buffer_ms: 60,
            mixer_frame_ms: 20,
            max_sources_per_call: 16,
            resampler_quality: "High".into(),
        }
    }
}

/// Raw SIP event subscription configuration.
#[derive(Debug, Clone, PartialEq)]
pub struct RawSipEventConfig {
    /// Enable raw SIP message events on the `raw_sip` event bus.
    pub enabled: bool,
    /// Include SIP message bodies in raw events.
    pub include_bodies: bool,
    /// Maximum body size in bytes to include.
    pub max_body_bytes: usize,
    /// Redact Authorization header values in raw events.
    pub redact_authorization: bool,
}

impl Default for RawSipEventConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            include_bodies: true,
            max_body_bytes: 64 * 1024,
            redact_authorization: true,
        }
    }
}

/// Timeout configuration for various SIP operations.
#[derive(Debug, Clone, PartialEq)]
pub struct TimeoutConfig {
    /// Timeout for sending commands to the reactor.
    pub command_timeout: Duration,
    /// Timeout for graceful client shutdown.
    pub shutdown_timeout: Duration,
    /// Timeout for SIP registration.
    pub register_timeout: Duration,
    /// Timeout for SIP INVITE (call setup).
    pub invite_timeout: Duration,
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self {
            command_timeout: Duration::from_secs(10),
            shutdown_timeout: Duration::from_secs(15),
            register_timeout: Duration::from_secs(15),
            invite_timeout: Duration::from_secs(90),
        }
    }
}

/// Complete configuration for the SIP client.
///
/// This struct defines all runtime parameters for a `SipClient` session,
/// including transport bindings, media settings, STUN/TURN servers, ICE
/// configuration, event bus capacities, and timeouts.
#[derive(Debug, Clone, PartialEq)]
pub struct ClientConfig {
    /// SIP User-Agent header value.
    pub user_agent: String,
    /// Logging verbosity.
    pub log_level: LogLevel,
    /// Maximum number of concurrent calls.
    pub max_calls: u32,
    /// Capacity of the control event bus channel.
    pub event_bus_capacity: usize,
    /// Capacity of the raw SIP event bus channel.
    pub raw_sip_event_capacity: usize,
    /// Audio processing configuration.
    pub audio: ClientAudioConfig,
    /// List of transport bindings.
    pub transports: Vec<TransportConfig>,
    /// List of STUN servers for NAT traversal.
    pub stun_servers: Vec<StunServerConfig>,
    /// List of TURN servers for relay-based NAT traversal.
    pub turn_servers: Vec<TurnServerConfig>,
    /// ICE negotiation configuration.
    pub ice: IceConfig,
    /// Raw SIP event subscription configuration.
    pub raw_sip_events: RawSipEventConfig,
    /// Timeout configuration.
    pub timeouts: TimeoutConfig,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            user_agent: "tauri-siprs/0.1".into(),
            log_level: LogLevel::Info,
            max_calls: 32,
            event_bus_capacity: 2048,
            raw_sip_event_capacity: 4096,
            audio: ClientAudioConfig::default(),
            transports: vec![TransportConfig::udp(5060), TransportConfig::tcp(5060)],
            stun_servers: vec![],
            turn_servers: vec![],
            ice: IceConfig::default(),
            raw_sip_events: RawSipEventConfig::default(),
            timeouts: TimeoutConfig::default(),
        }
    }
}

impl ClientConfig {
    /// Validate all configuration fields.
    ///
    /// Returns `Ok(())` on success, or `Err(SipError)` with `SipErrorKind::InvalidConfig`
    /// describing the first validation failure.
    ///
    pub fn validate(&self) -> Result<(), SipError> {
        // event_bus_capacity must be >= 16
        if self.event_bus_capacity < 16 {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "event_bus_capacity must be >= 16",
            ));
        }
        // raw_sip_event_capacity must be >= event_bus_capacity when raw_sip enabled
        if self.raw_sip_events.enabled && self.raw_sip_event_capacity < self.event_bus_capacity {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "raw_sip_event_capacity must be >= event_bus_capacity when raw_sip events are enabled",
            ));
        }
        // max_calls must be > 0
        if self.max_calls == 0 {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "max_calls must be > 0",
            ));
        }
        // At least one transport is required
        if self.transports.is_empty() {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "at least one transport is required",
            ));
        }
        // §42: the default delivery sample rate must be one of 8/16/24/48 kHz.
        // SampleRate is a closed enum whose only variants are the four valid
        // rates, so this check is defensive (unreachable in practice).
        if !matches!(
            self.audio.default_delivery_format.sample_rate,
            SampleRate::Hz8000 | SampleRate::Hz16000 | SampleRate::Hz24000 | SampleRate::Hz48000
        ) {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "unsupported sample rate",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: Construction ────────────────────────────────────────

    #[test]
    fn client_config_default_constructs() {
        let config = ClientConfig::default();
        assert_eq!(config.user_agent, "tauri-siprs/0.1");
        assert_eq!(config.log_level, LogLevel::Info);
        assert_eq!(config.max_calls, 32);
        assert!(config.event_bus_capacity >= 16);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn client_config_accepts_custom_values() {
        let config = ClientConfig {
            user_agent: "MyApp/1.0".into(),
            log_level: LogLevel::Debug,
            max_calls: 10,
            event_bus_capacity: 1024,
            raw_sip_event_capacity: 2048,
            transports: vec![TransportConfig::udp(5060)],
            ..Default::default()
        };
        assert_eq!(config.user_agent, "MyApp/1.0");
        assert_eq!(config.log_level, LogLevel::Debug);
        assert_eq!(config.max_calls, 10);
        assert_eq!(config.transports.len(), 1);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn client_config_default_transports_include_udp_and_tcp() {
        let config = ClientConfig::default();
        assert_eq!(config.transports.len(), 2);
        assert!(matches!(config.transports[0], TransportConfig::Udp(_)));
        assert!(matches!(config.transports[1], TransportConfig::Tcp(_)));
    }

    #[test]
    fn client_config_raw_sip_event_defaults() {
        let raw = RawSipEventConfig::default();
        assert!(raw.enabled);
        assert!(raw.include_bodies);
        assert_eq!(raw.max_body_bytes, 65536);
        assert!(raw.redact_authorization);
    }

    #[test]
    fn client_config_timeout_defaults() {
        let timeouts = TimeoutConfig::default();
        assert_eq!(timeouts.command_timeout, Duration::from_secs(10));
        assert_eq!(timeouts.shutdown_timeout, Duration::from_secs(15));
        assert_eq!(timeouts.register_timeout, Duration::from_secs(15));
        assert_eq!(timeouts.invite_timeout, Duration::from_secs(90));
    }

    #[test]
    fn client_audio_config_defaults() {
        let audio = ClientAudioConfig::default();
        assert_eq!(
            audio.default_delivery_format,
            AudioFormat {
                sample_rate: SampleRate::Hz16000,
                bit_depth: BitDepth::I16,
                channel_layout: ChannelLayout::StereoInOut,
                frame_ms: 20,
            },
            "§10.1 default delivery format is 16kHz / i16 / stereo-in-out / 20ms"
        );
        assert_eq!(audio.pair_buffer_ms, 120);
        assert_eq!(audio.jitter_buffer_ms, 60);
        assert_eq!(audio.mixer_frame_ms, 20);
        assert_eq!(audio.max_sources_per_call, 16);
    }

    #[test]
    fn client_config_accepts_all_sample_rates() {
        // §42 requires the delivery sample rate to be one of 8/16/24/48 kHz.
        // SampleRate is a closed enum with exactly these four variants, so every
        // representable rate must pass validation.
        for rate in [
            SampleRate::Hz8000,
            SampleRate::Hz16000,
            SampleRate::Hz24000,
            SampleRate::Hz48000,
        ] {
            let config = ClientConfig {
                audio: ClientAudioConfig {
                    default_delivery_format: AudioFormat {
                        sample_rate: rate,
                        bit_depth: BitDepth::I16,
                        channel_layout: ChannelLayout::StereoInOut,
                        frame_ms: 20,
                    },
                    ..Default::default()
                },
                ..Default::default()
            };
            assert!(
                config.validate().is_ok(),
                "sample rate {rate:?} must pass §42 validation"
            );
        }
    }

    // ── Error: Validation ───────────────────────────────────────────

    #[test]
    fn client_config_rejects_small_event_bus_capacity() {
        let config = ClientConfig {
            event_bus_capacity: 8,
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("event_bus_capacity"));
    }

    #[test]
    fn client_config_rejects_raw_sip_capacity_less_than_event_bus() {
        let config = ClientConfig {
            event_bus_capacity: 1024,
            raw_sip_event_capacity: 512,
            raw_sip_events: RawSipEventConfig {
                enabled: true,
                ..Default::default()
            },
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(
            err.message.contains("raw_sip_event_capacity")
                || err.message.contains("event_bus_capacity")
        );
    }

    #[test]
    fn client_config_accepts_raw_sip_capacity_equal_to_event_bus() {
        let config = ClientConfig {
            event_bus_capacity: 1024,
            raw_sip_event_capacity: 1024,
            raw_sip_events: RawSipEventConfig {
                enabled: true,
                ..Default::default()
            },
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    fn client_config_rejects_zero_max_calls() {
        let config = ClientConfig {
            max_calls: 0,
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("max_calls"));
    }

    #[test]
    fn client_config_rejects_empty_transports() {
        let config = ClientConfig {
            transports: vec![],
            ..Default::default()
        };
        let err = config.validate().unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("transport"));
    }

    // ── Boundary ────────────────────────────────────────────────────

    #[test]
    fn client_config_accepts_minimum_event_bus_capacity() {
        let config = ClientConfig {
            event_bus_capacity: 16,
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    fn client_config_accepts_large_event_bus_capacity() {
        let config = ClientConfig {
            event_bus_capacity: 65536,
            raw_sip_event_capacity: 65536,
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }
}
