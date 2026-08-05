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
//   - NODE_ID=N0046:  §34 Observability — Tracing, Metrics & Capabilities
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0046 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Observability module — tracing, metrics & ClientCapabilities.
//!
//! Provides:
//! - `ClientCapabilities` — capability matrix advertised via `ClientInitialized` event.
//! - `MetricsRegistry` — optional counters/gauges (behind `#[cfg(feature = "metrics")]`).
//! - Supporting types: `AudioDeviceCaps`, `SrtpImplementation`, `TransportKind`, `Codec`, `DtmfMethod`.

// The atomics are only referenced by the metrics types (O-003 feature-gated).
#[cfg(feature = "metrics")]
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};

// ── ClientCapabilities ──────────────────────────────────────────────────

/// Capability matrix advertised at client initialization.
///
/// Emitted once in a `ClientInitialized` event after `SipClient::new()`
/// succeeds. Consumers use this to determine which features are available.
///
/// All fields have safe defaults — consumers that don't check a specific
/// field get a fallback value rather than undefined behavior.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct ClientCapabilities {
    // ── Instance limits ──
    /// Maximum number of concurrent calls.
    pub max_calls: u32,
    /// Maximum number of registered accounts.
    pub max_accounts: u32,

    // ── Transport ──
    /// Supported transport types (UDP, TCP, TLS).
    #[serde(default)]
    pub transport_types: Vec<TransportKind>,
    /// Whether TLS is available at compile time.
    pub tls_available: bool,
    /// TLS version string (e.g., "1.2", "1.3"), if available.
    pub tls_version: Option<String>,

    // ── SRTP ──
    /// Whether SRTP is available at compile time.
    pub srtp_available: bool,
    /// Supported SRTP implementations.
    #[serde(default)]
    pub srtp_types: Vec<SrtpImplementation>,

    // ── Media ──
    /// Available audio codecs.
    ///
    /// [::TICKET::] P3-2: ffi::bindings provides type aliases for PJSIP codec system.
// [::STUB::] P4-2: available_codecs and the Codec type are placeholders pending FFI-defined codec types (covers observability_metrics.rs:69,187) -- Replace the placeholder codec list and Codec type with runtime codec enumeration via the pjsua codec API using FFI-defined pjsua_codec_info types once bindgen generates them
    #[serde(default)]
    pub available_codecs: Vec<Codec>,
    /// Whether Opus codec is available.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    pub opus_available: bool,
    /// Audio device capabilities.
    pub audio_devices: AudioDeviceCaps,

    // ── NAT/ICE ──
    /// Whether ICE is supported.
    pub ice_supported: bool,
    /// Whether Trickle ICE is supported.
    pub trickle_ice_supported: bool,
    /// Whether STUN is supported.
    pub stun_supported: bool,
    /// Whether TURN is supported.
    pub turn_supported: bool,

    // ── DTMF ──
    /// Supported DTMF methods.
    #[serde(default)]
    pub dtmf_methods: Vec<DtmfMethod>,

    // ── SIP extensions ──
    /// Whether REFER method is supported.
    pub supports_refer: bool,
    /// Whether session timers are supported.
    pub supports_session_timers: bool,

    // ── Additional features ──
    /// Event bus channel capacity.
    pub event_bus_capacity: usize,
    /// Whether raw SIP event subscription is supported.
    pub raw_sip_events_supported: bool,
    /// Maximum number of mixer sources.
    pub mixer_max_sources: usize,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl ClientCapabilities {
    /// Create a new `ClientCapabilities` with default values.
    ///
    /// All optional features default to `false` or empty.
    /// Compile-time features (`tls`, `srtp`) are set from `cfg!()`.
    pub fn new() -> Self {
        Self {
            // Instance limits: MAX means "no artificial limit"
            max_calls: u32::MAX,
            max_accounts: u32::MAX,

            // Transport
            transport_types: Vec::new(),
            tls_available: cfg!(feature = "tls"),
            tls_version: None,

            // SRTP
            srtp_available: cfg!(feature = "srtp"),
            srtp_types: Vec::new(),

            // Media
            available_codecs: Vec::new(),
            opus_available: false,
            audio_devices: AudioDeviceCaps::default(),

            // NAT/ICE
            ice_supported: false,
            trickle_ice_supported: false,
            stun_supported: false,
            turn_supported: false,

            // DTMF
            dtmf_methods: vec![DtmfMethod::Rfc2833],

            // SIP extensions
            supports_refer: false,
            supports_session_timers: false,

            // Additional
            event_bus_capacity: 2048,
            raw_sip_events_supported: false,
            mixer_max_sources: 16,
        }
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl Default for ClientCapabilities {
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::new()
    }
}

// ── Supporting types ────────────────────────────────────────────────────

/// Transport protocol kind.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum TransportKind {
    /// UDP transport.
    Udp,
    /// TCP transport.
    Tcp,
    /// TLS over TCP transport.
    Tls,
}

/// SRTP implementation type.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SrtpImplementation {
    /// SDES (RFC 4568) SRTP key exchange.
    SdesSrtp,
    /// DTLS-SRTP (RFC 5763) — experimental in PJSIP 2.17.
    DtlsSrtp,
}

/// Audio codec descriptor.
///
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Codec {
    /// Codec identifier (e.g., "PCMU", "opus", "G722").
    pub id: String,
    /// Human-readable codec name.
    pub name: String,
    /// Clock rate in Hz.
    pub clock_rate: u32,
}

/// DTMF signaling method.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum DtmfMethod {
    /// RFC 2833 — RTP event payload.
    Rfc2833,
    /// SIP INFO method.
    Info,
    /// In-band audio tones.
    Inband,
}

/// Audio device capabilities.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct AudioDeviceCaps {
    /// Whether a default input device is available.
    pub has_default_input: bool,
    /// Whether a default output device is available.
    pub has_default_output: bool,
    /// List of available input device names.
    #[serde(default)]
    pub input_devices: Vec<String>,
    /// List of available output device names.
    #[serde(default)]
    pub output_devices: Vec<String>,
}

// ── Metrics ─────────────────────────────────────────────────────────────

/// Error returned when a named metric (counter or gauge) is not found.
#[cfg(feature = "metrics")]
#[derive(Debug, Clone)]
pub struct MetricsLookupError(pub String);

#[cfg(feature = "metrics")]
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
impl std::fmt::Display for MetricsLookupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "metric '{}' not found", self.0)
    }
}

#[cfg(feature = "metrics")]
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
impl std::error::Error for MetricsLookupError {}

/// A counter metric — monotonically increasing `u64` value.
#[cfg(feature = "metrics")]
pub struct MetricsCounter {
    name: String,
    value: AtomicU64,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
#[cfg(feature = "metrics")]
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
impl MetricsCounter {
    /// Create a new counter with the given name and initial value.
    pub fn new(name: impl Into<String>, initial: u64) -> Self {
        Self {
            name: name.into(),
            value: AtomicU64::new(initial),
        }
    }

    /// Get the counter name.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the current counter value.
    pub fn value(&self) -> u64 {
        self.value.load(Ordering::Relaxed)
    }

    /// Increment the counter by 1 (wrapping semantics).
    pub fn increment(&self) {
        self.value.fetch_add(1, Ordering::Relaxed);
    }
}

/// A gauge metric — signed `i64` value that can go up and down.
#[cfg(feature = "metrics")]
pub struct MetricsGauge {
    name: String,
    value: AtomicI64,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
#[cfg(feature = "metrics")]
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
impl MetricsGauge {
    /// Create a new gauge with the given name and initial value.
    pub fn new(name: impl Into<String>, initial: i64) -> Self {
        Self {
            name: name.into(),
            value: AtomicI64::new(initial),
        }
    }

    /// Get the gauge name.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the current gauge value.
    pub fn value(&self) -> i64 {
        self.value.load(Ordering::Relaxed)
    }

    /// Set the gauge to a specific value.
    pub fn set(&self, value: i64) {
        self.value.store(value, Ordering::Relaxed);
    }

    /// Add a delta to the gauge value (wrapping semantics).
    pub fn add(&self, delta: i64) {
        self.value.fetch_add(delta, Ordering::Relaxed);
    }
}

/// Registry for metrics counters and gauges.
///
/// Provides named counters and gauges for monitoring client state.
/// All operations are lock-free via atomic types.
///
/// # Feature gate
/// This type is only available when `#[cfg(feature = "metrics")]` is active.
#[cfg(feature = "metrics")]
pub struct MetricsRegistry {
    counters: Vec<MetricsCounter>,
    gauges: Vec<MetricsGauge>,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
#[cfg(feature = "metrics")]
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
impl MetricsRegistry {
    /// Create a new `MetricsRegistry` with default metrics.
    ///
    /// Initializes the standard set of counters and gauges to zero.
    pub fn new() -> Self {
        Self {
            counters: vec![
                MetricsCounter::new("audio_tap_overflows_total", 0),
                MetricsCounter::new("dtmf_sent_total", 0),
                MetricsCounter::new("dtmf_received_total", 0),
                MetricsCounter::new("ice_failures_total", 0),
                MetricsCounter::new("transport_reconnects_total", 0),
                MetricsCounter::new("raw_sip_messages_total", 0),
            ],
            gauges: vec![
                MetricsGauge::new("active_calls", 0),
                MetricsGauge::new("registered_accounts", 0),
            ],
        }
    }

    /// Get a counter by name.
    pub fn get_counter(&self, name: &str) -> Option<&MetricsCounter> {
        self.counters.iter().find(|c| c.name() == name)
    }

    /// Get a gauge by name.
    pub fn get_gauge(&self, name: &str) -> Option<&MetricsGauge> {
        self.gauges.iter().find(|g| g.name() == name)
    }

    /// Number of counters in the registry.
    ///
    /// Added for the O-005 closure — lets the default-metrics test assert the
    /// exact registry shape rather than a sampled subset.
    pub fn counters_len(&self) -> usize {
        self.counters.len()
    }

    /// Number of gauges in the registry.
    ///
    /// Added for the O-005 closure — pairs with `counters_len`.
    pub fn gauges_len(&self) -> usize {
        self.gauges.len()
    }

    /// Increment a counter by name.
    ///
    /// Returns `Ok(())` if the counter exists, `Err(MetricsLookupError)` if not found.
    pub fn increment_counter(&self, name: &str) -> Result<(), MetricsLookupError> {
        self.counters
            .iter()
            .find(|c| c.name() == name)
            .map(|c| c.increment())
            .ok_or(MetricsLookupError(name.to_string()))
    }

    /// Set a gauge by name.
    ///
    /// Returns `Ok(())` if the gauge exists, `Err(MetricsLookupError)` if not found.
    pub fn set_gauge(&self, name: &str, value: i64) -> Result<(), MetricsLookupError> {
        self.gauges
            .iter()
            .find(|g| g.name() == name)
            .map(|g| g.set(value))
            .ok_or(MetricsLookupError(name.to_string()))
    }
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
#[cfg(feature = "metrics")]
// [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
impl Default for MetricsRegistry {
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── ClientCapabilities ─────────────────────────────────────────────

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_new_has_defaults() {
        let caps = ClientCapabilities::new();
        assert_eq!(caps.max_calls, u32::MAX, "max_calls defaults to MAX");
        assert_eq!(caps.max_accounts, u32::MAX, "max_accounts defaults to MAX");
        assert_eq!(
            caps.tls_available,
            cfg!(feature = "tls"),
            "tls_available matches feature flag"
        );
        assert!(!caps.srtp_available || cfg!(feature = "srtp"));
        assert!(!caps.ice_supported, "ice_supported defaults to false");
        assert!(caps.srtp_types.is_empty(), "srtp_types defaults to empty");
        assert_eq!(
            caps.event_bus_capacity, 2048,
            "event_bus_capacity defaults to 2048"
        );
        assert_eq!(caps.mixer_max_sources, 16);
        assert_eq!(caps.dtmf_methods, vec![DtmfMethod::Rfc2833]);
    }

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_default_trait() {
        let caps = ClientCapabilities::default();
        assert_eq!(caps.max_calls, u32::MAX);
    }

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_serde_roundtrip() {
        let caps = ClientCapabilities::new();
        let json = serde_json::to_string(&caps).unwrap();
        let deserialized: ClientCapabilities = serde_json::from_str(&json).unwrap();
        assert_eq!(caps.max_calls, deserialized.max_calls);
        assert_eq!(caps.max_accounts, deserialized.max_accounts);
        assert_eq!(caps.tls_available, deserialized.tls_available);
        assert_eq!(caps.event_bus_capacity, deserialized.event_bus_capacity);
    }

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_clone() {
        let caps = ClientCapabilities::new();
        let cloned = caps.clone();
        assert_eq!(caps.max_calls, cloned.max_calls);
        assert_eq!(caps.max_accounts, cloned.max_accounts);
    }

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_debug_does_not_panic() {
        let caps = ClientCapabilities::new();
        let debug = format!("{:?}", caps);
        assert!(!debug.is_empty());
    }

    // ── Error cases ───────────────────────────────────────────────────

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_deserialize_empty_json() {
        let json = "{}";
        let caps: ClientCapabilities = serde_json::from_str(json).unwrap();
        // All fields should use their defaults via #[serde(default)]
        assert_eq!(caps.max_calls, u32::MAX);
        assert!(!caps.ice_supported);
        assert!(caps.srtp_types.is_empty());
        // tls_available follows the actual compile-time feature flag
        assert_eq!(caps.tls_available, cfg!(feature = "tls"));
    }

    // ── Boundary ──────────────────────────────────────────────────────

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_max_calls_extreme() {
        let caps = ClientCapabilities {
            max_calls: u32::MAX,
            ..ClientCapabilities::new()
        };
        assert_eq!(caps.max_calls, u32::MAX);
    }

    // ── AudioDeviceCaps ───────────────────────────────────────────────

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn audio_device_caps_default() {
        let caps = AudioDeviceCaps::default();
        assert!(!caps.has_default_input);
        assert!(!caps.has_default_output);
        assert!(caps.input_devices.is_empty());
        assert!(caps.output_devices.is_empty());
    }

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn audio_device_caps_with_devices() {
        let caps = AudioDeviceCaps {
            has_default_input: true,
            has_default_output: true,
            input_devices: vec!["Built-in Microphone".into()],
            output_devices: vec!["Built-in Output".into()],
        };
        assert!(caps.has_default_input);
        assert_eq!(caps.input_devices.len(), 1);
    }

    // ── SrtpImplementation ────────────────────────────────────────────

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn srtp_implementation_variants() {
        assert_ne!(
            SrtpImplementation::SdesSrtp as u8,
            SrtpImplementation::DtlsSrtp as u8
        );
    }

    // ── TransportKind ─────────────────────────────────────────────────

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn transport_kind_variants() {
        assert_ne!(TransportKind::Udp as u8, TransportKind::Tcp as u8);
        assert_ne!(TransportKind::Tcp as u8, TransportKind::Tls as u8);
    }

    // ── Codec ─────────────────────────────────────────────────────────

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn codec_construct() {
        let codec = Codec {
            id: "PCMU".into(),
            name: "G.711 μ-law".into(),
            clock_rate: 8000,
        };
        assert_eq!(codec.id, "PCMU");
    }

    // ── DtmfMethod ────────────────────────────────────────────────────

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn dtmf_method_variants() {
        assert_ne!(DtmfMethod::Rfc2833 as u8, DtmfMethod::Info as u8);
        assert_ne!(DtmfMethod::Info as u8, DtmfMethod::Inband as u8);
    }

    // ── Metrics (feature-gated) ───────────────────────────────────────

    /// @verifies C047
    #[cfg(feature = "metrics")]
    #[test]
    // [::TICKET::] P1-2, P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P8-2) --for-spec --no-implementation-order`.
    fn metrics_registry_starts_at_zero() {
        // O-005 closure: assert ALL 8 default metrics start at zero, plus the
        // exact registry shape (6 counters + 2 gauges). The prior version only
        // checked 4, so a mis-initialized dtmf_received_total/ice_failures_total/
        // transport_reconnects_total/raw_sip_messages_total would pass.
        let registry = MetricsRegistry::new();
        for name in [
            "audio_tap_overflows_total",
            "dtmf_sent_total",
            "dtmf_received_total",
            "ice_failures_total",
            "transport_reconnects_total",
            "raw_sip_messages_total",
        ] {
            assert_eq!(
                registry.get_counter(name).expect(name).value(),
                0,
                "{name} must start at 0"
            );
        }
        for name in ["active_calls", "registered_accounts"] {
            assert_eq!(
                registry.get_gauge(name).expect(name).value(),
                0,
                "{name} must start at 0"
            );
        }
        assert_eq!(registry.counters_len(), 6, "exactly 6 counters");
        assert_eq!(registry.gauges_len(), 2, "exactly 2 gauges");
    }

    /// @verifies C047
    #[cfg(feature = "metrics")]
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn metrics_counter_increment() {
        let registry = MetricsRegistry::new();
        registry.increment_counter("dtmf_sent_total").unwrap();
        assert_eq!(registry.get_counter("dtmf_sent_total").unwrap().value(), 1);
    }

    /// @verifies C047
    #[cfg(feature = "metrics")]
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn metrics_gauge_set() {
        let registry = MetricsRegistry::new();
        registry.set_gauge("active_calls", 3).unwrap();
        assert_eq!(registry.get_gauge("active_calls").unwrap().value(), 3);
    }

    /// @verifies C047
    #[cfg(feature = "metrics")]
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn metrics_gauge_add() {
        let registry = MetricsRegistry::new();
        registry.set_gauge("active_calls", 1).unwrap();
        registry.get_gauge("active_calls").unwrap().add(2);
        assert_eq!(registry.get_gauge("active_calls").unwrap().value(), 3);
    }

    /// @verifies C047
    #[cfg(feature = "metrics")]
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn metrics_counter_unknown_returns_err() {
        let registry = MetricsRegistry::new();
        assert!(registry.increment_counter("nonexistent").is_err());
    }

    /// @verifies C047
    #[cfg(feature = "metrics")]
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn metrics_gauge_unknown_returns_err() {
        let registry = MetricsRegistry::new();
        assert!(registry.set_gauge("nonexistent", 5).is_err());
    }

    /// @verifies C047
    #[cfg(feature = "metrics")]
    #[test]
    // [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn metrics_counter_wrapping_overflow() {
        let counter = MetricsCounter::new("test", u64::MAX);
        counter.increment();
        // Wrapping semantics: MAX + 1 = 0
        assert_eq!(counter.value(), 0);
    }

    // ── Metrics compile check (invariant) ──────────────────────────────

    /// @verifies C047
    #[test]
    // [::TICKET::] P1-2, P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P8-2) --for-spec --no-implementation-order`.
    fn metrics_types_are_feature_gated() {
        // O-003 closure: C047 invariant — metrics optional via feature flag.
        // The prior `metrics_types_not_available_without_feature` was an empty
        // no-op; this source-inspection test asserts the `#[cfg(feature =
        // "metrics")]` attribute structurally precedes each metrics type.
        let src = std::fs::read_to_string("src/config/observability_metrics.rs")
            .expect("source file must exist");
        for ty in [
            "MetricsLookupError",
            "MetricsCounter",
            "MetricsGauge",
            "MetricsRegistry",
        ] {
            let needle = format!("pub struct {ty}");
            let (idx, _) = src
                .lines()
                .enumerate()
                .find(|(_, l)| l.contains(&needle))
                .unwrap_or_else(|| panic!("{ty} struct must exist in observability_metrics.rs"));
            // The `#[cfg(feature = "metrics")]` attribute may be separated from
            // the struct by derives (e.g. #[derive(Debug, Clone)]), so scan the
            // up-to-4 lines preceding the struct definition.
            let context: Vec<&str> = src
                .lines()
                .skip(idx.saturating_sub(4))
                .take(4)
                .map(str::trim)
                .collect();
            assert!(
                context.contains(&"#[cfg(feature = \"metrics\")]"),
                "{ty} (line {}) must be feature-gated with #[cfg(feature = \"metrics\")]; context: {context:?}",
                idx + 1
            );
        }
    }

    /// @verifies C001, C047
    #[test]
    // [::TICKET::] P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-2 --for-spec --no-implementation-order`.
    fn no_video_fields_in_client_capabilities() {
        // C001/C047 invariant: audio-only scope — ClientCapabilities must not
        // expose any video capability fields. Extends the no_video_types_in_public_exports
        // pattern to the capability matrix.
        let src = std::fs::read_to_string("src/config/observability_metrics.rs")
            .expect("source file must exist");
        // Only inspect the production portion — the test module below necessarily
        // names "video" in its own assertions.
        let production = src.split("#[cfg(test)]").next().unwrap_or(&src);
        assert!(
            !production.to_lowercase().contains("video"),
            "observability_metrics.rs must not define video capability fields"
        );
    }

    /// @verifies C047
    #[cfg(feature = "metrics")]
    #[test]
    // [::TICKET::] P1-2, P8-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-2|P8-2) --for-spec --no-implementation-order`.
    fn metrics_counter_independent_construction() {
        // MetricsCounter and MetricsGauge can be constructed independently
        // even without the full MetricsRegistry (for standalone use).
        let counter = MetricsCounter::new("standalone", 42);
        assert_eq!(counter.value(), 42);
        assert_eq!(counter.name(), "standalone");

        let gauge = MetricsGauge::new("standalone_gauge", -5);
        assert_eq!(gauge.value(), -5);
        assert_eq!(gauge.name(), "standalone_gauge");
    }
}
