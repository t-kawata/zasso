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

use std::time::Duration;

use crate::error::SipError;
use crate::error::SipErrorKind;

// ---------------------------------------------------------------------------
// SrtpPolicy — SRTP security policy
// ---------------------------------------------------------------------------

/// SRTP (Secure RTP) policy for SIP media sessions.
///
/// Controls whether SRTP is disabled, optional (opportunistic), or mandatory
/// for all media streams. Validation is feature-gated via a runtime boolean,
/// enabling testability without conditional compilation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SrtpPolicy {
    /// SRTP is disabled — media is unencrypted.
    Disabled,
    /// SRTP is used if the remote peer supports it; fallback to unencrypted.
    Optional,
    /// SRTP is required — media negotiation fails if the peer does not support it.
    Mandatory,
}

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
impl SrtpPolicy {
    /// Validate this policy against the SRTP feature flag.
    ///
    /// Returns `Ok(())` when:
    /// - The policy is `Disabled` (always valid, feature state irrelevant)
    /// - The policy is `Mandatory` or `Optional` AND `feature_enabled` is `true`
    ///
    /// Returns `Err(InvalidConfig)` when `Mandatory` or `Optional` is used
    /// with `feature_enabled = false`.
    pub fn validate(&self, feature_enabled: bool) -> Result<(), SipError> {
        match self {
            Self::Disabled => Ok(()),
            Self::Mandatory | Self::Optional => {
                if feature_enabled {
                    Ok(())
                } else {
                    Err(SipError::new(
                        SipErrorKind::InvalidConfig,
                        format!("SRTP {:?} requires srtp feature to be enabled", self),
                    ))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// TransportProtocol — transport protocol classification
// ---------------------------------------------------------------------------

/// Transport protocol for SIP signalling and media.
///
/// Used to determine reconnection strategy:
/// - `Udp`: stateless — no reconnection needed
/// - `Tcp`: connection-oriented — reconnect on disconnect
/// - `Tls`: connection-oriented + encrypted — reconnect on disconnect
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportProtocol {
    /// UDP — stateless, no reconnection.
    Udp,
    /// TCP — connection-oriented, reconnection supported.
    Tcp,
    /// TLS — encrypted connection-oriented, reconnection supported.
    Tls,
}

// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
impl TransportProtocol {
    /// Returns `true` if this protocol requires connection reconnection.
    pub fn needs_reconnect(&self) -> bool {
        match self {
            Self::Udp => false,
            Self::Tcp | Self::Tls => true,
        }
    }
}

// ---------------------------------------------------------------------------
// ReconnectPolicy — exponential backoff with jitter
// ---------------------------------------------------------------------------

/// Golden-ratio hash multiplier used to derive deterministic jitter from the
/// attempt number. Kept as a named constant so the jitter derivation stays a
/// pure computation on the attempt, without importing a random number generator.
const JITTER_HASH_MULTIPLIER: u64 = 0x9E37_79B9;

/// Exponential backoff policy for transport reconnection.
///
/// Computes retry delays using the formula:
/// `delay = min(base_delay * 2^attempt, max_delay) * (1 + jitter)`
///
/// Jitter is deterministic, derived from the attempt number to avoid
/// thundering herd without requiring a random number generator.
///
/// # Invariants
/// - `base_delay` must be > 0
/// - `max_delay` must be >= `base_delay`
/// - `jitter_ratio` must be in [0.0, 1.0]
/// - All fields are immutable after construction
#[derive(Debug, Clone, PartialEq)]
pub struct ReconnectPolicy {
    /// Base delay for the first retry attempt.
    base_delay: Duration,
    /// Maximum delay — backoff is clamped at this value.
    max_delay: Duration,
    /// Jitter ratio in [0.0, 1.0] — fraction of the computed delay to add.
    jitter_ratio: f64,
}

// [::TICKET::] P1-1, P6-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P6-3) --for-spec --no-implementation-order`.
impl ReconnectPolicy {
    /// Create a new `ReconnectPolicy` with the given parameters.
    ///
    /// # Errors
    /// Returns `Err(InvalidConfig)` if:
    /// - `base_delay` is zero (backoff cannot start)
    /// - `max_delay` is less than `base_delay`
    /// - `jitter_ratio` is not in [0.0, 1.0]
    pub fn new(
        base_delay: Duration,
        max_delay: Duration,
        jitter_ratio: f64,
    ) -> Result<Self, SipError> {
        if base_delay.is_zero() {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "ReconnectPolicy: base_delay must be non-zero",
            ));
        }
        if max_delay < base_delay {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                "ReconnectPolicy: max_delay must be >= base_delay",
            ));
        }
        if !(0.0..=1.0).contains(&jitter_ratio) {
            return Err(SipError::new(
                SipErrorKind::InvalidConfig,
                format!("ReconnectPolicy: jitter_ratio {jitter_ratio} is not in [0.0, 1.0]"),
            ));
        }
        Ok(Self {
            base_delay,
            max_delay,
            jitter_ratio,
        })
    }

    /// Compute the delay for the given retry attempt number.
    ///
    /// `attempt` is zero-based (0 = first retry).
    /// Returns `base_delay` for attempt 0, with exponential growth up to
    /// `max_delay`, plus jitter proportional to `jitter_ratio`.
    pub fn next_delay(&self, attempt: u32) -> Duration {
        // Exponential backoff: base_delay * 2^attempt
        let multiplier = 1u32.checked_shl(attempt).unwrap_or(u32::MAX);
        let computed = self.base_delay.saturating_mul(multiplier);
        let clamped = computed.min(self.max_delay);

        // Deterministic jitter based on attempt number.
        // Uses a simple hash-like scramble to distribute jitter values.
        let jitter_factor = if self.jitter_ratio == 0.0 {
            0.0
        } else {
            let hash = (attempt as u64).wrapping_mul(JITTER_HASH_MULTIPLIER) >> 32;
            let fraction = (hash as f64) / (u32::MAX as f64);
            self.jitter_ratio * fraction
        };

        let jitter_ns = (clamped.as_nanos() as f64 * jitter_factor) as u64;
        clamped + Duration::from_nanos(jitter_ns)
    }

    /// Accessor for `base_delay` (immutable).
    pub fn base_delay(&self) -> Duration {
        self.base_delay
    }

    /// Accessor for `max_delay` (immutable).
    pub fn max_delay(&self) -> Duration {
        self.max_delay
    }

    /// Accessor for `jitter_ratio` (immutable).
    pub fn jitter_ratio(&self) -> f64 {
        self.jitter_ratio
    }
}

// ---------------------------------------------------------------------------
// Tests — TDD Red: failing → Green: passing
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::SipError;

    // [::TICKET::] P1-1, P6-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-1|P6-3) --for-spec --no-implementation-order`.
    type TestResult = Result<(), SipError>;

    // ── C043-Pre: Precondition — SrtpPolicy value set, feature flag available

    #[test]
    // @verifies C043
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn srtp_disabled_always_valid() {
        assert!(SrtpPolicy::Disabled.validate(false).is_ok());
        assert!(SrtpPolicy::Disabled.validate(true).is_ok());
    }

    #[test]
    // @verifies C043
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn srtp_mandatory_requires_feature_enabled() {
        assert!(SrtpPolicy::Mandatory.validate(true).is_ok());
        let err = SrtpPolicy::Mandatory.validate(false).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
    }

    #[test]
    // @verifies C043
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn srtp_optional_requires_feature_enabled() {
        assert!(SrtpPolicy::Optional.validate(true).is_ok());
        let err = SrtpPolicy::Optional.validate(false).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
    }

    // ── C043-Inv: Invariant — Disabled universally valid

    #[test]
    // @verifies C043
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn srtp_disabled_invariant_universally_valid() {
        for flag in [true, false] {
            assert!(
                SrtpPolicy::Disabled.validate(flag).is_ok(),
                "Disabled must be valid with feature_enabled={flag}"
            );
        }
    }

    // ── ReconnectPolicy: Normal — use Result<(), SipError> to avoid unwrap

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_new_succeeds_with_valid_params() -> TestResult {
        let policy = ReconnectPolicy::new(Duration::from_secs(1), Duration::from_secs(60), 0.1)?;
        assert_eq!(policy.base_delay(), Duration::from_secs(1));
        assert_eq!(policy.max_delay(), Duration::from_secs(60));
        assert!((policy.jitter_ratio() - 0.1).abs() < f64::EPSILON);
        Ok(())
    }

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_next_delay_base_for_attempt_zero() -> TestResult {
        let policy = ReconnectPolicy::new(Duration::from_secs(1), Duration::from_secs(60), 0.0)?;
        let delay = policy.next_delay(0);
        assert_eq!(delay, Duration::from_secs(1), "attempt 0 = base_delay");
        Ok(())
    }

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_next_delay_doubles_each_attempt() -> TestResult {
        let policy = ReconnectPolicy::new(Duration::from_secs(1), Duration::from_secs(60), 0.0)?;
        let d0 = policy.next_delay(0);
        let d1 = policy.next_delay(1);
        let d2 = policy.next_delay(2);
        assert_eq!(d0, Duration::from_secs(1));
        assert_eq!(d1, Duration::from_secs(2));
        assert_eq!(d2, Duration::from_secs(4));
        Ok(())
    }

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_next_delay_clamped_at_max_delay() -> TestResult {
        let policy = ReconnectPolicy::new(Duration::from_secs(1), Duration::from_secs(5), 0.0)?;
        let delay = policy.next_delay(10);
        assert!(delay <= Duration::from_secs(5), "clamped at max_delay");
        Ok(())
    }

    // ── ReconnectPolicy: Error

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_rejects_zero_base_delay() {
        let err = ReconnectPolicy::new(Duration::ZERO, Duration::from_secs(60), 0.1).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("base_delay"));
    }

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_rejects_negative_jitter_ratio() {
        let err = ReconnectPolicy::new(Duration::from_secs(1), Duration::from_secs(60), -0.1)
            .unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("jitter_ratio"));
    }

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_rejects_jitter_ratio_above_one() {
        let err =
            ReconnectPolicy::new(Duration::from_secs(1), Duration::from_secs(60), 1.5).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
    }

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_rejects_max_delay_less_than_base() {
        let err =
            ReconnectPolicy::new(Duration::from_secs(10), Duration::from_secs(5), 0.1).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(err.message.contains("max_delay"));
    }

    // ── ReconnectPolicy: Boundary

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_jitter_ratio_zero_produces_deterministic_delay() -> TestResult {
        let policy = ReconnectPolicy::new(Duration::from_secs(1), Duration::from_secs(60), 0.0)?;
        let d_a = policy.next_delay(3);
        let d_b = policy.next_delay(3);
        assert_eq!(d_a, d_b, "zero jitter => deterministic");
        Ok(())
    }

    #[test]
    // O-001 FIX (ABC violation B): determinism must hold for jitter_ratio > 0.
    // The zero-jitter test above short-circuits to 0.0, so an RNG in the
    // jitter>0 branch would have gone undetected. This test asserts the same
    // (attempt, policy) pair always yields the same delay (constraint #4:
    // deterministic seed based on attempt number).
    // [::TICKET::] P6-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-3 --for-spec --no-implementation-order`.
    fn reconnect_policy_jitter_ratio_positive_is_deterministic() -> TestResult {
        let policy = ReconnectPolicy::new(Duration::from_secs(1), Duration::from_secs(60), 0.5)?;
        let d_a = policy.next_delay(3);
        let d_b = policy.next_delay(3);
        assert_eq!(
            d_a, d_b,
            "jitter>0 must be deterministic per attempt (constraint #4)"
        );
        Ok(())
    }

    #[test]
    // O-002 FIX (ABC violation C): the jitter=1.0 delay bound is [computed, 2*computed]
    // where computed = min(base_delay * 2^attempt, max_delay). The bound must be
    // derived from the inputs, not a loose 2*max_delay (which accepts violations).
    // [::TICKET::] P6-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-3 --for-spec --no-implementation-order`.
    fn reconnect_policy_jitter_ratio_one_produces_variable_delay() -> TestResult {
        let policy = ReconnectPolicy::new(Duration::from_secs(1), Duration::from_secs(60), 1.0)?;
        let attempt = 5;
        let computed = Duration::from_secs(1)
            .saturating_mul(1u32 << attempt)
            .min(Duration::from_secs(60)); // min(1s * 2^5, 60s) = 32s
        let delay = policy.next_delay(attempt);
        assert!(
            delay >= computed,
            "jitter adds non-negative delay; lower bound is computed"
        );
        assert!(
            delay <= computed * 2,
            "jitter=1.0 upper bound is 2*computed (64s), NOT 2*max_delay (120s)"
        );
        Ok(())
    }

    // ── TransportProtocol

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn transport_protocol_needs_reconnect() {
        assert!(!TransportProtocol::Udp.needs_reconnect());
        assert!(TransportProtocol::Tcp.needs_reconnect());
        assert!(TransportProtocol::Tls.needs_reconnect());
    }

    // ── Invariant: fields immutable after construction

    #[test]
    // [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
    fn reconnect_policy_fields_immutable() -> TestResult {
        let policy = ReconnectPolicy::new(Duration::from_secs(2), Duration::from_secs(30), 0.2)?;
        assert_eq!(policy.base_delay(), Duration::from_secs(2));
        assert_eq!(policy.base_delay(), Duration::from_secs(2));
        assert_eq!(policy.max_delay(), Duration::from_secs(30));
        assert_eq!(policy.max_delay(), Duration::from_secs(30));
        Ok(())
    }
}
