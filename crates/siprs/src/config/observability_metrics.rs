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

//! Observability types: [`ClientCapabilities`], [`MetricsCounter`],
//! [`MetricsGauge`], and supporting enums.
//!
//! ## Feature gates
//!
//! `MetricsCounter` and `MetricsGauge` are only available when the `metrics`
//! Cargo feature is enabled. `ClientCapabilities` is always available.
//!
//! ## Tracing
//!
//! The `#[tracing::instrument]` attribute is applied to selected public async
//! functions to provide structured span context. See `lib.rs` for instrumented
//! entry points.

#[cfg(feature = "metrics")]
use std::sync::atomic::{AtomicU64, Ordering};

// ---------------------------------------------------------------------------
// Transport and DTMF kinds (provisional — will migrate to canonical types)
// ---------------------------------------------------------------------------

/// SIP transport protocol kind.
///
/// **Note**: This is a provisional definition for P1-2. It will be replaced by
/// the canonical `TransportKind` from the transport config module (N0015) once
/// that module is implemented.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum TransportKind {
    /// UDP transport.
    Udp,
    /// TCP transport.
    Tcp,
    /// TLS-encrypted TCP transport.
    Tls,
}

/// DTMF signalling method.
///
/// **Note**: This is a provisional definition for P1-2. It will be replaced by
/// the canonical `DtmfMethod` from the DTMF spec module (N0028) once that
/// module is implemented.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum DtmfMethod {
    /// RFC 2833 / RFC 4733 — DTMF as RTP event payloads.
    Rfc2833,
    /// SIP INFO with application/dtmf-relay body.
    Info,
    /// SIP INFO with application/dtmf body (older approach).
    InfoSipInfo,
}

// ---------------------------------------------------------------------------
// Metrics types (behind `#[cfg(feature = "metrics")]`)
// ---------------------------------------------------------------------------

cfg_if::cfg_if! {
    if #[cfg(feature = "metrics")] {
        /// An atomic counter for runtime metrics.
        ///
        /// Wraps `AtomicU64` and provides saturating arithmetic:
        /// incrementing beyond `u64::MAX` is a no-op.
        ///
        /// Only available when the `metrics` feature is enabled.
        #[derive(Debug)]
        pub struct MetricsCounter {
            value: AtomicU64,
        }

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        impl MetricsCounter {
            /// Creates a new counter initialised to zero.
            pub fn new() -> Self {
                MetricsCounter {
                    value: AtomicU64::new(0),
                }
            }

            /// Increments the counter by 1 (saturating).
            pub fn increment(&self) {
                self.value.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |v| {
                    v.checked_add(1)
                }).ok();
            }

            /// Increments the counter by `delta` (saturating).
            pub fn increment_by(&self, delta: u64) {
                if delta == 0 {
                    return;
                }
                self.value.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |v| {
                    v.checked_add(delta)
                }).ok();
            }

            /// Returns the current value of the counter.
            pub fn get(&self) -> u64 {
                self.value.load(Ordering::Relaxed)
            }
        }

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        impl Default for MetricsCounter {
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
            fn default() -> Self {
                MetricsCounter::new()
            }
        }

        /// An atomic gauge for runtime metrics.
        ///
        /// Wraps `AtomicU64` and can be set to arbitrary values.
        ///
        /// Only available when the `metrics` feature is enabled.
        #[derive(Debug)]
        pub struct MetricsGauge {
            value: AtomicU64,
        }

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        impl MetricsGauge {
            /// Creates a new gauge with the given initial value.
            pub fn new(initial: u64) -> Self {
                MetricsGauge {
                    value: AtomicU64::new(initial),
                }
            }

            /// Sets the gauge to a new value.
            pub fn set(&self, value: u64) {
                self.value.store(value, Ordering::Relaxed);
            }

            /// Returns the current value of the gauge.
            pub fn get(&self) -> u64 {
                self.value.load(Ordering::Relaxed)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// ClientCapabilities
// ---------------------------------------------------------------------------

/// Capabilities of the SIP client, advertised via `ClientInitialized`.
///
/// Populated from PJSIP build-time features and runtime detection results.
/// Consumers use this to determine which features are available and avoid
/// calling unsupported operations.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ClientCapabilities {
    /// Maximum number of simultaneous calls.
    pub max_calls: u32,
    /// Maximum number of registered accounts.
    pub max_accounts: u32,
    /// Supported transport protocols.
    pub transport_types: Vec<TransportKind>,
    /// Whether TLS transport is available.
    pub tls_available: bool,
    /// TLS version string, if TLS is available.
    pub tls_version: Option<String>,
    /// Whether SRTP is available.
    pub srtp_available: bool,
    /// Supported DTMF signalling methods.
    pub dtmf_methods: Vec<DtmfMethod>,
    /// Whether ICE is supported.
    pub ice_supported: bool,
    /// Whether STUN is supported.
    pub stun_supported: bool,
    /// Whether TURN is supported.
    pub turn_supported: bool,
    /// Capacity of the internal event bus channel.
    pub event_bus_capacity: usize,
    /// Whether raw SIP message events are supported.
    pub raw_sip_events_supported: bool,
}

// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
impl ClientCapabilities {
    /// Creates a new `ClientCapabilities` with all fields set.
    ///
    /// Prefer using struct literal syntax directly; this constructor exists
    /// to make it convenient to create a value in tests and FFI boundaries.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        max_calls: u32,
        max_accounts: u32,
        transport_types: Vec<TransportKind>,
        tls_available: bool,
        tls_version: Option<String>,
        srtp_available: bool,
        dtmf_methods: Vec<DtmfMethod>,
        ice_supported: bool,
        stun_supported: bool,
        turn_supported: bool,
        event_bus_capacity: usize,
        raw_sip_events_supported: bool,
    ) -> Self {
        ClientCapabilities {
            max_calls,
            max_accounts,
            transport_types,
            tls_available,
            tls_version,
            srtp_available,
            dtmf_methods,
            ice_supported,
            stun_supported,
            turn_supported,
            event_bus_capacity,
            raw_sip_events_supported,
        }
    }
}

/// Demonstrates `#[tracing::instrument]` on a public async function.
///
/// This function exists to verify that the `tracing` crate and its
/// `#[tracing::instrument]` attribute compile correctly. Real public API
/// functions (e.g. `make_call`, `register_account`) will carry their own
/// `#[tracing::instrument]` annotations with span fields.
#[tracing::instrument]
pub async fn demonstrate_instrumentation() -> Result<(), ()> {
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests — §34 Observability (N0046)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ── C047-precondition: ClientCapabilities constructable ────────────

    /// @verifies C047-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_constructable_with_all_fields() {
        let caps = ClientCapabilities {
            max_calls: 10,
            max_accounts: 3,
            transport_types: vec![TransportKind::Udp, TransportKind::Tls],
            tls_available: true,
            tls_version: Some("1.3".into()),
            srtp_available: false,
            dtmf_methods: vec![DtmfMethod::Rfc2833],
            ice_supported: true,
            stun_supported: false,
            turn_supported: true,
            event_bus_capacity: 128,
            raw_sip_events_supported: true,
        };
        assert_eq!(caps.max_calls, 10);
        assert_eq!(caps.max_accounts, 3);
        assert_eq!(caps.transport_types.len(), 2);
        assert!(caps.tls_available);
        assert_eq!(caps.tls_version, Some("1.3".into()));
        assert!(!caps.srtp_available);
        assert_eq!(caps.dtmf_methods, vec![DtmfMethod::Rfc2833]);
        assert!(caps.ice_supported);
        assert!(!caps.stun_supported);
        assert!(caps.turn_supported);
        assert_eq!(caps.event_bus_capacity, 128);
        assert!(caps.raw_sip_events_supported);
    }

    // ── C047-postcondition: new() constructor ──────────────────────────

    /// @verifies C047-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_new_constructor() {
        let caps = ClientCapabilities::new(
            5, 1,
            vec![TransportKind::Tcp],
            false, None, false,
            vec![DtmfMethod::Info],
            false, false, false,
            64, false,
        );
        assert_eq!(caps.max_calls, 5);
        assert_eq!(caps.max_accounts, 1);
        assert!(caps.transport_types.contains(&TransportKind::Tcp));
        assert!(!caps.tls_available);
        assert_eq!(caps.event_bus_capacity, 64);
    }

    // ── C047-postcondition: TransportKind / DtmfMethod enums ───────────

    /// @verifies C047-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn transport_kind_variants() {
        assert_eq!(format!("{:?}", TransportKind::Udp), "Udp");
        assert_eq!(format!("{:?}", TransportKind::Tcp), "Tcp");
        assert_eq!(format!("{:?}", TransportKind::Tls), "Tls");
    }

    /// @verifies C047-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn dtmf_method_variants() {
        assert_eq!(format!("{:?}", DtmfMethod::Rfc2833), "Rfc2833");
        assert_eq!(format!("{:?}", DtmfMethod::Info), "Info");
        assert_eq!(format!("{:?}", DtmfMethod::InfoSipInfo), "InfoSipInfo");
    }

    // ── C047-postcondition: MetricsCounter (when metrics feature on) ────

    #[cfg(feature = "metrics")]
    mod metrics_tests {
        use super::*;

        /// @verifies C047-postcondition
        #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        fn metrics_counter_new_is_zero() {
            let counter = MetricsCounter::new();
            assert_eq!(counter.get(), 0);
        }

        /// @verifies C047-postcondition
        #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        fn metrics_counter_increment() {
            let counter = MetricsCounter::new();
            counter.increment();
            assert_eq!(counter.get(), 1);
            counter.increment();
            assert_eq!(counter.get(), 2);
        }

        /// @verifies C047-postcondition
        #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        fn metrics_counter_increment_by() {
            let counter = MetricsCounter::new();
            counter.increment_by(5);
            assert_eq!(counter.get(), 5);
        }

        /// @verifies C047-invariant
        #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        fn metrics_counter_saturates_at_max() {
            let counter = MetricsCounter::new();
            counter.increment_by(u64::MAX);
            counter.increment(); // saturates
            assert_eq!(counter.get(), u64::MAX);
        }

        /// @verifies C047-postcondition
        #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        fn metrics_counter_increment_by_zero() {
            let counter = MetricsCounter::new();
            counter.increment_by(0); // no-op
            assert_eq!(counter.get(), 0);
        }

        /// @verifies C047-postcondition
        #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        fn metrics_counter_default() {
            let counter = MetricsCounter::default();
            assert_eq!(counter.get(), 0);
        }

        /// @verifies C047-postcondition
        #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        fn metrics_gauge_new_and_get() {
            let gauge = MetricsGauge::new(42);
            assert_eq!(gauge.get(), 42);
        }

        /// @verifies C047-postcondition
        #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
        fn metrics_gauge_set() {
            let gauge = MetricsGauge::new(0);
            gauge.set(100);
            assert_eq!(gauge.get(), 100);
        }
    }

    // ── C047-invariant: serde gate ─────────────────────────────────────

    #[cfg(feature = "serde")]
    /// @verifies C047-invariant
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_serde_roundtrip() {
        let caps = ClientCapabilities {
            max_calls: 3,
            max_accounts: 1,
            transport_types: vec![TransportKind::Tls],
            tls_available: true,
            tls_version: Some("1.2".into()),
            srtp_available: false,
            dtmf_methods: vec![DtmfMethod::Rfc2833],
            ice_supported: false,
            stun_supported: false,
            turn_supported: false,
            event_bus_capacity: 256,
            raw_sip_events_supported: true,
        };
        let json = serde_json::to_string(&caps).expect("serialize");
        let deserialized: ClientCapabilities = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(caps.max_calls, deserialized.max_calls);
        assert_eq!(caps.transport_types, deserialized.transport_types);
        assert_eq!(caps.tls_version, deserialized.tls_version);
    }

    // ── Boundary tests ─────────────────────────────────────────────────

    /// @verifies C047-invariant
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_zero_calls() {
        let caps = ClientCapabilities {
            max_calls: 0,
            max_accounts: 0,
            transport_types: vec![],
            tls_available: false,
            tls_version: None,
            srtp_available: false,
            dtmf_methods: vec![],
            ice_supported: false,
            stun_supported: false,
            turn_supported: false,
            event_bus_capacity: 0,
            raw_sip_events_supported: false,
        };
        assert_eq!(caps.max_calls, 0);
        assert!(caps.transport_types.is_empty());
    }

    /// @verifies C047-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn client_capabilities_clone() {
        let caps_a = ClientCapabilities {
            max_calls: 10,
            max_accounts: 3,
            transport_types: vec![TransportKind::Udp],
            tls_available: true,
            tls_version: Some("1.3".into()),
            srtp_available: false,
            dtmf_methods: vec![DtmfMethod::Rfc2833],
            ice_supported: true,
            stun_supported: false,
            turn_supported: false,
            event_bus_capacity: 128,
            raw_sip_events_supported: false,
        };
        let caps_b = caps_a.clone();
        assert_eq!(caps_a.max_calls, caps_b.max_calls);
    }

    /// @verifies C047-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn tracing_instrument_attribute_present_in_source() {
        let source = include_str!("../config/observability_metrics.rs");
        assert!(
            source.contains("#[tracing::instrument]"),
            "Source must contain #[tracing::instrument] on a public fn"
        );
    }
}
