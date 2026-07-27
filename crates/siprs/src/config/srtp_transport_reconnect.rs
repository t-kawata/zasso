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
//   - NODE_ID=N0042:  §30 SRTP & §31 Transport Reconnection
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0042 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Implements SRTP policy (§30) and transport reconnection strategy (§31).
//!
//! ## SRTP Policy
//!
//! `SrtpPolicy` defines three levels: `Disabled` (always available),
//! `Optional` and `Mandatory` (feature-gated behind `cfg(feature = "srtp")`).
//!
//! ## Reconnection Policy
//!
//! `ReconnectPolicy` and `RetryConfig` define per-protocol (UDP/TCP/TLS)
//! reconnection behavior. These are consumed by the runtime module (P0-7/P0-8)
//! to drive actual reconnection.

use crate::error::error_design_siperror::{SipError, SipErrorKind};

// ---------------------------------------------------------------------------
// SrtpPolicy — SRTP security policy
// ---------------------------------------------------------------------------

/// SRTP security policy for media streams.
///
/// - `Disabled`: SRTP is not used (always available).
/// - `Optional`: SRTP is attempted but not required (requires `srtp` feature).
/// - `Mandatory`: SRTP is required for all media (requires `srtp` feature).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SrtpPolicy {
    /// SRTP is not used.
    Disabled,
    /// SRTP is optional — SDP negotiation may fall back to unencrypted RTP.
    /// Only available when the `srtp` feature is enabled.
    #[cfg(feature = "srtp")]
    Optional,
    /// SRTP is mandatory — media is rejected if SRTP cannot be established.
    /// Only available when the `srtp` feature is enabled.
    #[cfg(feature = "srtp")]
    Mandatory,
}

// ---------------------------------------------------------------------------
// RetryConfig — reconnection retry parameters
// ---------------------------------------------------------------------------

/// Configuration for reconnection retry behavior on a single transport protocol.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RetryConfig {
    /// Maximum number of reconnection attempts. `0` means no retries.
    pub max_retries: u32,
    /// Base delay in milliseconds between retry attempts.
    /// Actual delay may use backoff (not specified at this policy layer).
    pub base_delay_ms: u64,
}

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
impl RetryConfig {
    /// Creates a new `RetryConfig` with the given parameters.
    pub(crate) fn new(max_retries: u32, base_delay_ms: u64) -> Self {
        RetryConfig {
            max_retries,
            base_delay_ms,
        }
    }
}

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
impl Default for RetryConfig {
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        RetryConfig {
            max_retries: 3,
            base_delay_ms: 1000,
        }
    }
}

// ---------------------------------------------------------------------------
// ReconnectPolicy — per-protocol reconnection strategy
// ---------------------------------------------------------------------------

/// Per-protocol reconnection strategy.
///
/// Each transport protocol (UDP, TCP, TLS) has its own retry configuration,
/// allowing different resilience profiles per protocol.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ReconnectPolicy {
    /// Reconnection strategy for UDP transport.
    pub udp: RetryConfig,
    /// Reconnection strategy for TCP transport.
    pub tcp: RetryConfig,
    /// Reconnection strategy for TLS transport.
    pub tls: RetryConfig,
}

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
impl ReconnectPolicy {
    /// Creates a new `ReconnectPolicy` with per-protocol retry configs.
    pub(crate) fn new(udp: RetryConfig, tcp: RetryConfig, tls: RetryConfig) -> Self {
        ReconnectPolicy { udp, tcp, tls }
    }
}

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
impl Default for ReconnectPolicy {
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        ReconnectPolicy {
            udp: RetryConfig::default(),
            tcp: RetryConfig::default(),
            tls: RetryConfig::default(),
        }
    }
}

// ---------------------------------------------------------------------------
// validation — SRTP policy config validation
// ---------------------------------------------------------------------------

/// Validates that the given `SrtpPolicy` is valid for the current feature set.
///
/// - `SrtpPolicy::Disabled` is always valid.
/// - `SrtpPolicy::Optional` and `SrtpPolicy::Mandatory` are valid only when
///   the `srtp` feature is enabled.
///
/// When the `srtp` feature is disabled, `Optional` and `Mandatory` are
/// compile-time unavailable and this function always returns `Ok(())`.
#[allow(unused_variables)]
pub(crate) fn validate_srtp_policy(policy: SrtpPolicy) -> Result<(), SipError> {
    match policy {
        SrtpPolicy::Disabled => Ok(()),
        #[cfg(feature = "srtp")]
        SrtpPolicy::Optional
        | SrtpPolicy::Mandatory => {
            // These variants require the srtp feature, which is enabled.
            // Validation passes; the runtime module (P0-7/P0-8) is responsible
            // for verifying that the PJSIP build actually supports SRTP.
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — Red Phase (TDD)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C043-precondition: enum and struct definitions ─────────────────
    // -----------------------------------------------------------------------

    /// @verifies C043-precondition
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn srtp_policy_disabled_always_constructable() {
        let _disabled = SrtpPolicy::Disabled;
    }

    /// @verifies C043-precondition
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn retry_config_constructable_with_new() {
        let config = RetryConfig::new(5, 2000);
        assert_eq!(config.max_retries, 5);
        assert_eq!(config.base_delay_ms, 2000);
    }

    /// @verifies C043-precondition
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_constructable_with_named_fields() {
        let policy = ReconnectPolicy {
            udp: RetryConfig::new(3, 1000),
            tcp: RetryConfig::new(2, 2000),
            tls: RetryConfig::new(1, 5000),
        };
        assert_eq!(policy.udp.max_retries, 3);
        assert_eq!(policy.tcp.max_retries, 2);
        assert_eq!(policy.tls.max_retries, 1);
    }

    // -----------------------------------------------------------------------
    // ── C043-postcondition: trait bounds ───────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C043-postcondition
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn srtp_policy_has_required_trait_bounds() {
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}

        assert_debug::<SrtpPolicy>();
        assert_clone::<SrtpPolicy>();
        assert_copy::<SrtpPolicy>();
        assert_partial_eq::<SrtpPolicy>();
        assert_eq_trait::<SrtpPolicy>();
    }

    /// @verifies C043-postcondition
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn retry_config_has_required_trait_bounds() {
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}

        assert_debug::<RetryConfig>();
        assert_clone::<RetryConfig>();
        assert_partial_eq::<RetryConfig>();
    }

    /// @verifies C043-postcondition
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_has_required_trait_bounds() {
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}

        assert_debug::<ReconnectPolicy>();
        assert_clone::<ReconnectPolicy>();
        assert_partial_eq::<ReconnectPolicy>();
    }

    // -----------------------------------------------------------------------
    // ── C043-invariant: cfg(feature = "srtp") gate ─────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C043-invariant
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn srtp_feature_gate_compile_time() {
        #[cfg(not(feature = "srtp"))]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_srtp_disabled_variants() {
            // When srtp feature is disabled, Optional and Mandatory are
            // compile-time unavailable. Only Disabled can be mentioned.
            let _d = SrtpPolicy::Disabled;
            // The following would not compile:
            // let _o = SrtpPolicy::Optional;
            // let _m = SrtpPolicy::Mandatory;
        }
        #[cfg(feature = "srtp")]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
        fn assert_srtp_enabled_variants() {
            let _d = SrtpPolicy::Disabled;
            let _o = SrtpPolicy::Optional;
            let _m = SrtpPolicy::Mandatory;
        }
    }

    /// @verifies C043-invariant
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn validate_srtp_policy_accepts_disabled_always() {
        let result = validate_srtp_policy(SrtpPolicy::Disabled);
        assert!(result.is_ok());
    }

    /// @verifies C043-invariant
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn srtp_policy_equality_works() {
        assert_eq!(SrtpPolicy::Disabled, SrtpPolicy::Disabled);
        #[cfg(feature = "srtp")]
        {
            assert_ne!(SrtpPolicy::Disabled, SrtpPolicy::Optional);
            assert_ne!(SrtpPolicy::Optional, SrtpPolicy::Mandatory);
        }
    }

    // -----------------------------------------------------------------------
    // ── C043-boundary: retry config values ─────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C043-invariant
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn retry_config_zero_retries_is_valid() {
        let config = RetryConfig::new(0, 0);
        assert_eq!(config.max_retries, 0);
        assert_eq!(config.base_delay_ms, 0);
    }

    /// @verifies C043-invariant
    #[test]
// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_default_uses_sensible_values() {
        let default = ReconnectPolicy::default();
        assert_eq!(default.udp.max_retries, 3);
        assert_eq!(default.tcp.base_delay_ms, 1000);
        assert_eq!(default.tls.max_retries, 3);
    }
}
