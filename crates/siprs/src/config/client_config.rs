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
//   - NODE_ID=N0022:  §10 ClientConfig完全仕様
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0022 --hops=2)
//
// Cross-referenced design context:
//   - requirement/§5 機能要求の確定化 [NODE_ID=N0009]
//     (references → src/config/client_config.rs)
//     (references → src/config/account_config.rs)
//     (depends_on ← src/config/client_config.rs)
//     (precedes → src/config/client_config.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0009 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use std::time::Duration;

// ──────────────────────────────────────────────
// LogLevel — severity classification for SIP client logging
// ──────────────────────────────────────────────

/// Log level for SIP client internal logging.
/// Ordered from least to most verbose: Error < Warn < Info < Debug < Trace.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

// ──────────────────────────────────────────────
// ResamplerQuality — audio resampler interpolation quality
// ──────────────────────────────────────────────

/// Quality level for the audio resampler (rubato-based).
///
/// Maps to rubato's interpolation quality:
/// - Low: linear interpolation, lowest CPU
/// - Medium: moderate sinc interpolation
/// - High: high-quality sinc interpolation
///
/// [::STUB::] TODO: refine quality-to-rubato mapping when rubato integration is implemented
/// (see N0076 §26 リサンプラ設計)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResamplerQuality {
    Low,
    Medium,
    High,
}

// ──────────────────────────────────────────────
// TimeoutConfig — SIP operation timeouts (RFC §10)
// ──────────────────────────────────────────────

/// Timeout durations for various SIP operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimeoutConfig {
    /// Maximum time (seconds) to wait for a synchronous command to complete.
    pub command_timeout: Duration,
    /// Maximum time (seconds) to wait for graceful shutdown.
    pub shutdown_timeout: Duration,
    /// Maximum time (seconds) to wait for SIP registration to complete.
    pub register_timeout: Duration,
    /// Maximum time (seconds) to wait for an INVITE response.
    pub invite_timeout: Duration,
}

impl Default for TimeoutConfig {
    /// Returns TimeoutConfig with RFC §10.1 default values.
    fn default() -> Self {
        Self {
            command_timeout: Duration::from_secs(10),
            shutdown_timeout: Duration::from_secs(15),
            register_timeout: Duration::from_secs(15),
            invite_timeout: Duration::from_secs(90),
        }
    }
}

// ──────────────────────────────────────────────
// RawSipEventConfig — raw SIP event delivery configuration (RFC §10)
// ──────────────────────────────────────────────

/// Controls whether raw SIP message events are emitted on the event bus.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawSipEventConfig {
    /// Enable raw SIP event emission. Default: true.
    pub enabled: bool,
    /// Include SIP message body in events. Default: true.
    pub include_bodies: bool,
    /// Maximum body bytes to capture. Default: 65536 (64 KiB).
    pub max_body_bytes: usize,
    /// Redact Authorization header values. Default: true.
    pub redact_authorization: bool,
}

impl Default for RawSipEventConfig {
    /// Returns RawSipEventConfig with RFC §10.1 default values.
    fn default() -> Self {
        Self {
            enabled: true,
            include_bodies: true,
            // 64 KiB = 65536 bytes
            max_body_bytes: 64 * 1024,
            redact_authorization: true,
        }
    }
}

// ──────────────────────────────────────────────
// ClientAudioConfig — audio delivery configuration (RFC §10)
// ──────────────────────────────────────────────
//
// [::STUB::] N0056 — requires AudioFormat / SampleRate / BitDepth / ChannelLayout
// types to be defined (src/model/audio_format_model.rs). Full definition and
// Default impl are documented below and in specs/P0-2.md.
// When N0056 is resolved, uncomment the block below and remove this stub.
//
// pub struct ClientAudioConfig {
//     pub default_delivery_format: AudioFormat,
//     pub pair_buffer_ms: u32,
//     pub jitter_buffer_ms: u32,
//     pub mixer_frame_ms: u32,
//     pub max_sources_per_call: usize,
//     pub resampler_quality: ResamplerQuality,
// }
//
// impl Default for ClientAudioConfig {
//     fn default() -> Self {
//         Self {
//             // RFC §10.1: 16kHz / i16 / StereoInOut(L=IN,R=OUT) / 20ms
//             default_delivery_format: AudioFormat {
//                 sample_rate: SampleRate::Hz16000,
//                 bit_depth: BitDepth::I16,
//                 channel_layout: ChannelLayout::StereoInOut,
//                 frame_ms: 20,
//             },
//             pair_buffer_ms: 120,
//             jitter_buffer_ms: 60,
//             mixer_frame_ms: 20,
//             max_sources_per_call: 16,
//             resampler_quality: ResamplerQuality::High,
//         }
//     }
// }

// ──────────────────────────────────────────────
// ClientConfig — top-level SIP client configuration (RFC §10)
// ──────────────────────────────────────────────
//
// [::STUB::] P0-5 — requires TransportConfig (src/config/transport_config.rs).
// [::STUB::] P1-1 — requires IceConfig / StunServerConfig / TurnServerConfig
// (src/config/ice_stun_turn.rs).
//
// Full definition and Default impl are documented below and in specs/P0-2.md.
// When P0-5 and P1-1 are resolved, uncomment the block below and remove this stub.
//
// /// Complete SIP client configuration.
// /// Sole argument to SipClient::new(). Aggregates all operational settings.
// #[derive(Debug, Clone, PartialEq)]
// pub struct ClientConfig {
//     /// SIP User-Agent header string. Default: "tauri-siprs/0.1".
//     pub user_agent: String,
//     /// Log level for internal SIP stack logging. Default: Info.
//     pub log_level: LogLevel,
//     /// Maximum number of simultaneous calls. Default: 32.
//     pub max_calls: u32,
//     /// Event bus channel capacity. Default: 2048.
//     pub event_bus_capacity: usize,
//     /// Raw SIP event channel capacity. Default: 4096.
//     pub raw_sip_event_capacity: usize,
//     /// Audio delivery configuration.
//     pub audio: ClientAudioConfig,
//     /// SIP transport configurations (UDP, TCP, optionally TLS).
//     pub transports: Vec<TransportConfig>,
//     /// STUN server list. Default: empty.
//     pub stun_servers: Vec<StunServerConfig>,
//     /// TURN server list. Default: empty.
//     pub turn_servers: Vec<TurnServerConfig>,
//     /// ICE configuration.
//     pub ice: IceConfig,
//     /// Raw SIP event emission configuration.
//     pub raw_sip_events: RawSipEventConfig,
//     /// SIP operation timeout configuration.
//     pub timeouts: TimeoutConfig,
// }
//
// impl Default for ClientConfig {
//     /// Returns ClientConfig with RFC §10.1 default values.
//     fn default() -> Self {
//         Self {
//             user_agent: "tauri-siprs/0.1".into(),
//             log_level: LogLevel::Info,
//             max_calls: 32,
//             event_bus_capacity: 2048,
//             raw_sip_event_capacity: 4096,
//             audio: ClientAudioConfig::default(),
//             // RFC §10.1: UDP 5060 + TCP 5060
//             transports: vec![
//                 TransportConfig::udp(5060),
//                 TransportConfig::tcp(5060),
//             ],
//             stun_servers: vec![],
//             turn_servers: vec![],
//             ice: IceConfig::default(),
//             raw_sip_events: RawSipEventConfig::default(),
//             timeouts: TimeoutConfig::default(),
//         }
//     }
// }

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    // ── LogLevel ──────────────────────────────

    #[test]
    fn log_level_has_five_variants() {
        assert_ne!(LogLevel::Error, LogLevel::Warn);
        assert_ne!(LogLevel::Warn, LogLevel::Info);
        assert_ne!(LogLevel::Info, LogLevel::Debug);
        assert_ne!(LogLevel::Debug, LogLevel::Trace);
    }

    #[test]
    fn log_level_ordering_error_lt_warn_lt_info_lt_debug_lt_trace() {
        assert!(LogLevel::Error < LogLevel::Warn);
        assert!(LogLevel::Warn < LogLevel::Info);
        assert!(LogLevel::Info < LogLevel::Debug);
        assert!(LogLevel::Debug < LogLevel::Trace);
    }

    #[test]
    fn log_level_info_is_midpoint() {
        assert!(LogLevel::Error < LogLevel::Info);
        assert!(LogLevel::Trace > LogLevel::Info);
    }

    // ── ResamplerQuality ──────────────────────

    #[test]
    fn resampler_quality_variants_are_distinct() {
        assert_ne!(ResamplerQuality::Low, ResamplerQuality::Medium);
        assert_ne!(ResamplerQuality::Medium, ResamplerQuality::High);
    }

    // ── TimeoutConfig ─────────────────────────

    #[test]
    fn timeout_config_defaults_match_rfc_section_10_1() {
        let timeout_cfg = TimeoutConfig::default();
        assert_eq!(timeout_cfg.command_timeout, Duration::from_secs(10));
        assert_eq!(timeout_cfg.shutdown_timeout, Duration::from_secs(15));
        assert_eq!(timeout_cfg.register_timeout, Duration::from_secs(15));
        assert_eq!(timeout_cfg.invite_timeout, Duration::from_secs(90));
    }

    #[test]
    fn timeout_config_custom_values_round_trip_through_secs() {
        let timeout_cfg = TimeoutConfig {
            command_timeout: Duration::from_secs(5),
            shutdown_timeout: Duration::from_secs(30),
            register_timeout: Duration::from_secs(60),
            invite_timeout: Duration::from_secs(120),
        };
        assert_eq!(timeout_cfg.command_timeout.as_secs(), 5);
        assert_eq!(timeout_cfg.shutdown_timeout.as_secs(), 30);
        assert_eq!(timeout_cfg.register_timeout.as_secs(), 60);
        assert_eq!(timeout_cfg.invite_timeout.as_secs(), 120);
    }

    // ── RawSipEventConfig ─────────────────────

    #[test]
    fn raw_sip_event_config_defaults_match_rfc_section_10_1() {
        let raw_config = RawSipEventConfig::default();
        assert!(raw_config.enabled, "raw SIP events should be enabled by default");
        assert!(raw_config.include_bodies, "body inclusion should be enabled by default");
        assert_eq!(raw_config.max_body_bytes, 65536, "default max body is 64 KiB");
        assert!(raw_config.redact_authorization, "authorization should be redacted by default");
    }

    #[test]
    fn raw_sip_event_config_custom_values_override_defaults() {
        let raw_config = RawSipEventConfig {
            enabled: false,
            include_bodies: false,
            max_body_bytes: 1024,
            redact_authorization: false,
        };
        assert!(!raw_config.enabled);
        assert!(!raw_config.include_bodies);
        assert_eq!(raw_config.max_body_bytes, 1024);
        assert!(!raw_config.redact_authorization);
    }

    // ── ClientAudioConfig / ClientConfig ───────
    //
    // [::STUB::] N0056 / P0-5 / P1-1 — tests requiring external types are
    // deferred. When the dependency tickets are resolved, the commented
    // test blocks in specs/P0-2.md should be activated.

    #[test]
    #[ignore = "[::STUB::] N0056: AudioFormat must be defined before this test can compile"]
    fn client_audio_config_default_delivery_format_matches_rfc() {
        // let a = ClientAudioConfig::default();
        // assert_eq!(a.default_delivery_format.sample_rate, SampleRate::Hz16000);
        // assert_eq!(a.default_delivery_format.bit_depth, BitDepth::I16);
        // assert_eq!(a.default_delivery_format.frame_ms, 20);
    }

    #[test]
    #[ignore = "[::STUB::] P0-5+P1-1: TransportConfig and IceConfig must be defined"]
    fn client_config_defaults_match_rfc_section_10_1() {
        // let c = ClientConfig::default();
        // assert_eq!(c.user_agent, "tauri-siprs/0.1");
        // assert_eq!(c.log_level, LogLevel::Info);
        // assert_eq!(c.max_calls, 32);
        // assert_eq!(c.event_bus_capacity, 2048);
        // assert_eq!(c.raw_sip_event_capacity, 4096);
        // assert_eq!(c.transports.len(), 2);
        // assert!(c.stun_servers.is_empty());
        // assert!(c.turn_servers.is_empty());
    }
}
