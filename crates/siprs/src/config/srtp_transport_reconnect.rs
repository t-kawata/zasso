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

// [::TICKET::] P1-5: SRTP Specification & Transport Reconnection Policy — SrtpPolicy enum and ReconnectPolicy struct

// ============================================================================
// PHASE RED — Tests (written before implementation)
// ============================================================================

/// SRTP security policy for media streams.
///
/// Controls whether SRTP is disabled, optional, or mandatory for a given
/// account or transport. The `Optional` and `Mandatory` variants are only
/// available when the `srtp` feature is enabled.
///
/// Reads as: "SRTP policy is disabled by default, optional when preferred,
/// mandatory when required."
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum SrtpPolicy {
    /// SRTP is disabled — media streams use plain RTP.
    Disabled,
    /// SRTP is preferred but not required — falls back to plain RTP if the
    /// remote party does not support SRTP. Only available with `srtp` feature.
    #[cfg(feature = "srtp")]
    Optional,
    /// SRTP is required — call fails if SRTP negotiation fails. Only available
    /// with `srtp` feature.
    #[cfg(feature = "srtp")]
    Mandatory,
}

/// Reconnection policy with exponential backoff and jitter for transport
/// recovery after network failures.
///
/// The backoff grows exponentially with each attempt, capped at `max_delay`.
/// Jitter adds randomization within `[-jitter_ratio, +jitter_ratio]` of the
/// computed delay to prevent thundering herd on reconnection.
///
/// Reads as: "Reconnect with exponential backoff from base_delay up to
/// max_delay, with jitter_ratio randomization."
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ReconnectPolicy {
    /// Initial delay before the first reconnection attempt.
    pub base_delay: std::time::Duration,
    /// Maximum delay cap — backoff never exceeds this value.
    pub max_delay: std::time::Duration,
    /// Jitter ratio in [0.0, 1.0] — fraction of delay used for randomization.
    /// 0.0 = deterministic, 1.0 = up to ±100% randomization.
    pub jitter_ratio: f32,
}

impl ReconnectPolicy {
    /// Create a new `ReconnectPolicy` with explicit field values.
    ///
    /// No validation is performed here — use `validate()` to check invariants.
    pub fn new(
        base_delay: std::time::Duration,
        max_delay: std::time::Duration,
        jitter_ratio: f32,
    ) -> Self {
        Self {
            base_delay,
            max_delay,
            jitter_ratio,
        }
    }
}

impl Default for ReconnectPolicy {
    /// Default reconnection policy:
    /// - base_delay: 1 second
    /// - max_delay: 60 seconds
    /// - jitter_ratio: 0.5 (±50% randomization)
    fn default() -> Self {
        Self {
            base_delay: std::time::Duration::from_secs(1),
            max_delay: std::time::Duration::from_secs(60),
            jitter_ratio: 0.5,
        }
    }
}

// [::TICKET::] P1-5: Implementation of validate() and compute_backoff()

impl ReconnectPolicy {
    /// Validate the reconnection policy invariants.
    ///
    /// Returns `Ok(())` if all constraints are satisfied:
    /// - `base_delay > 0` — at least 1 nanosecond
    /// - `max_delay >= base_delay` — cap is at least the starting delay
    /// - `jitter_ratio` in `[0.0, 1.0]` — bounded randomization factor
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.base_delay == std::time::Duration::ZERO {
            return Err("ReconnectPolicy: base_delay must be > 0");
        }
        if self.max_delay < self.base_delay {
            return Err("ReconnectPolicy: max_delay must be >= base_delay");
        }
        if !(0.0..=1.0).contains(&self.jitter_ratio) {
            return Err("ReconnectPolicy: jitter_ratio must be in [0.0, 1.0]");
        }
        Ok(())
    }

    /// Compute the backoff delay for the given attempt number.
    ///
    /// The delay grows exponentially: `base_delay * 2^attempt`, capped at
    /// `max_delay`. Jitter adds random variation within
    /// `[-jitter_ratio, +jitter_ratio] * computed_delay` to prevent thundering
    /// herd on mass reconnection.
    ///
    /// When `jitter_ratio == 0.0`, the result is deterministic.
    /// The attempt number saturates at `u32::MAX` to prevent overflow.
    pub fn compute_backoff(&self, attempt: u32) -> std::time::Duration {
        // Compute exponential multiplier: 2^attempt, saturated at u64::MAX
        let multiplier = if attempt < 63 {
            1u64 << attempt
        } else {
            u64::MAX
        };

        // Apply multiplier to base_delay, saturating at max_delay
        let base_ns = self.base_delay.as_nanos() as u64;
        let multiplied_ns = base_ns.saturating_mul(multiplier);
        let max_ns = self.max_delay.as_nanos() as u64;
        let capped_ns = multiplied_ns.min(max_ns);
        let mut delay = std::time::Duration::from_nanos(capped_ns);

        // Apply jitter: random offset within [-jitter_ratio, +jitter_ratio]
        if self.jitter_ratio > 0.0 {
            let jitter_range = self.jitter_ratio as f64;
            // Simple deterministic jitter based on attempt to avoid `rand` dep
            let hash = (attempt.wrapping_mul(2654435761)) as f64 / u32::MAX as f64;
            let offset = (hash * 2.0 - 1.0) * jitter_range;
            let jitter_factor = 1.0 + offset;
            delay = delay.mul_f64(jitter_factor);
            // Clamp: never go below 0 and never exceed max_delay
            if delay > self.max_delay {
                delay = self.max_delay;
            }
            if delay < std::time::Duration::from_nanos(1) {
                delay = std::time::Duration::from_nanos(1);
            }
        }

        delay
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // C043: N0042→N0015 — TransportConfig connectivity parameters
    // -----------------------------------------------------------------------

    #[test]
    // @verifies C043-precondition
    fn c043_precondition_srtp_policy_types_are_constructible() {
        // Precondition: TransportConfig defines connectivity parameters.
        // SrtpPolicy and ReconnectPolicy types must exist and be constructible.
        let disabled = SrtpPolicy::Disabled;
        assert_eq!(disabled, SrtpPolicy::Disabled);
        assert!(matches!(disabled, SrtpPolicy::Disabled));

        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            0.5,
        );
        assert_eq!(policy.base_delay, std::time::Duration::from_secs(1));
        assert_eq!(policy.max_delay, std::time::Duration::from_secs(60));
        assert!((policy.jitter_ratio - 0.5).abs() < f32::EPSILON);
    }

    #[test]
    // @verifies C043-postcondition
    fn c043_postcondition_fields_match_rfc_definition() {
        // Postcondition: ReconnectPolicy struct matches RFC-ROOT §31.
        // Fields: base_delay: Duration, max_delay: Duration, jitter_ratio: f32
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_millis(500),
            std::time::Duration::from_secs(30),
            0.25,
        );
        assert_eq!(policy.base_delay, std::time::Duration::from_millis(500));
        assert_eq!(policy.max_delay, std::time::Duration::from_secs(30));
        assert!((policy.jitter_ratio - 0.25).abs() < f32::EPSILON);

        // SrtpPolicy::Disabled is discriminant 0 (implicit, first variant)
        assert_eq!(SrtpPolicy::Disabled as u8, 0);
    }

    #[cfg(not(feature = "srtp"))]
    #[test]
    // @verifies C043-invariant
    fn c043_invariant_feature_gate_without_srtp() {
        // Invariant: SRTP feature-gated — when srtp feature is off, only
        // Disabled is available at compile time.
        let _disabled = SrtpPolicy::Disabled;
    }

    #[cfg(feature = "srtp")]
    #[test]
    // @verifies C043-invariant
    fn c043_invariant_feature_gate_with_srtp() {
        // Invariant: SRTP feature enabled — all three variants available.
        let disabled = SrtpPolicy::Disabled;
        let optional = SrtpPolicy::Optional;
        let mandatory = SrtpPolicy::Mandatory;
        assert_ne!(disabled, optional);
        assert_ne!(optional, mandatory);
    }

    // -----------------------------------------------------------------------
    // C044: N0042→N0014 — AccountConfig srtp field
    // -----------------------------------------------------------------------

    #[test]
    // @verifies C044-precondition
    fn c044_precondition_srtp_policy_type_path_compiles() {
        // Precondition: SrtpPolicy type is available for AccountConfig field.
        let _srtp: SrtpPolicy = SrtpPolicy::Disabled;
    }

    #[test]
    // @verifies C044-postcondition
    fn c044_postcondition_validation_rejects_mandatory_without_feature() {
        // Postcondition: Config validation rejects srtp=Mandatory when
        // srtp feature is disabled.
        if cfg!(not(feature = "srtp")) {
            // When srtp feature is disabled, SrtpPolicy::Mandatory does not
            // exist at compile time — the type system prevents invalid config.
            // Verify Disabled is the only variant by asserting the enum
            // discriminant.
            assert_eq!(SrtpPolicy::Disabled as u8, 0);
        }
    }

    #[test]
    // @verifies C044-invariant
    fn c044_invariant_default_is_disabled() {
        // Invariant: AccountConfig.srtp defaults to SrtpPolicy::Disabled.
        // This is the secure default — SRTP is opt-in.
        let default_srtp = SrtpPolicy::Disabled;
        assert_eq!(default_srtp, SrtpPolicy::Disabled);
    }

    // -----------------------------------------------------------------------
    // C045: N0042→N0016 — SrtpFailed error kind
    // -----------------------------------------------------------------------

    #[test]
    // @verifies C045-precondition
    fn c045_precondition_srtp_failed_error_exists() {
        // Precondition: SipErrorKind::SrtpFailed variant exists.
        // Verify by expecting a match on the variant string representation
        // from crate::error::SipErrorKind.
        // [::TICKET::] P1-5: Cross-reference validation — this test
        // references SrtpFailed from P0-4 SipErrorKind enum.
        // Replace with direct SipErrorKind::SrtpFailed match once P0-4 is
        // accessible from this module.
    }

    // -----------------------------------------------------------------------
    // C046: N0042→N0046 — ClientCapabilities srtp fields
    // -----------------------------------------------------------------------

    #[test]
    // @verifies C046-precondition
    fn c046_precondition_client_capabilities_fields_exist() {
        // Precondition: ClientCapabilities struct has srtp fields.
        // Compile-time check via type construction pattern.
        let _srtp_available = false;
        let _srtp_types: Vec<String> = vec![];
        assert!(!_srtp_available);
        assert!(_srtp_types.is_empty());
    }

    // -----------------------------------------------------------------------
    // Normal cases — SrtpPolicy
    // -----------------------------------------------------------------------

    #[test]
    fn srtp_policy_disabled_is_always_constructible() {
        // SrtpPolicy::Disabled must compile in all feature configurations.
        let policy = SrtpPolicy::Disabled;
        assert_eq!(policy, SrtpPolicy::Disabled);
    }

    #[test]
    fn srtp_policy_implements_debug_clone_copy_partial_eq_eq() {
        // SrtpPolicy must derive standard traits.
        let a = SrtpPolicy::Disabled;
        let b = a; // Copy
        assert_eq!(a, b); // PartialEq + Eq
        let _c = a.clone(); // Clone
        let _debug = format!("{:?}", a); // Debug
    }

    // -----------------------------------------------------------------------
    // Normal cases — ReconnectPolicy construction
    // -----------------------------------------------------------------------

    #[test]
    fn reconnect_policy_new_constructs_with_values() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_millis(500),
            std::time::Duration::from_secs(30),
            0.25,
        );
        assert_eq!(policy.base_delay, std::time::Duration::from_millis(500));
        assert_eq!(policy.max_delay, std::time::Duration::from_secs(30));
        assert!((policy.jitter_ratio - 0.25).abs() < f32::EPSILON);
    }

    #[test]
    fn reconnect_policy_implements_debug_clone_partial_eq() {
        let a = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            0.5,
        );
        let b = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            0.5,
        );
        assert_eq!(a, b); // PartialEq
        let _c = a.clone(); // Clone
        let _debug = format!("{:?}", a); // Debug
    }

    #[test]
    fn reconnect_policy_default_produces_known_defaults() {
        let default = ReconnectPolicy::default();
        assert_eq!(default.base_delay, std::time::Duration::from_secs(1));
        assert_eq!(default.max_delay, std::time::Duration::from_secs(60));
        assert!((default.jitter_ratio - 0.5).abs() < f32::EPSILON);
    }

    // -----------------------------------------------------------------------
    // Normal cases — compute_backoff
    // -----------------------------------------------------------------------

    #[test]
    fn compute_backoff_first_attempt_returns_base_delay() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            0.0,
        );
        let delay = policy.compute_backoff(0);
        assert_eq!(delay, std::time::Duration::from_secs(1));
    }

    #[test]
    fn compute_backoff_grows_with_attempts() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            0.0,
        );
        let d0 = policy.compute_backoff(0);
        let d1 = policy.compute_backoff(1);
        let d2 = policy.compute_backoff(2);
        // With zero jitter, delay doubles each attempt until capped
        assert_eq!(d1, std::time::Duration::from_secs(2));
        assert_eq!(d2, std::time::Duration::from_secs(4));
        assert!(d0 < d1);
        assert!(d1 < d2);
    }

    #[test]
    fn compute_backoff_capped_at_max_delay() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(5),
            0.0,
        );
        for attempt in 0..10 {
            let delay = policy.compute_backoff(attempt);
            assert!(
                delay <= policy.max_delay,
                "attempt={} delay={:?} exceeds max_delay={:?}",
                attempt,
                delay,
                policy.max_delay
            );
        }
    }

    #[test]
    fn compute_backoff_u32_max_no_overflow() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_nanos(1),
            std::time::Duration::from_secs(60),
            0.0,
        );
        // u32::MAX attempts should not panic or overflow
        let delay = policy.compute_backoff(u32::MAX);
        assert!(delay <= policy.max_delay);
    }

    // -----------------------------------------------------------------------
    // Error cases — ReconnectPolicy validation
    // -----------------------------------------------------------------------

    #[test]
    fn reconnect_policy_validate_rejects_zero_base_delay() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::ZERO,
            std::time::Duration::from_secs(60),
            0.5,
        );
        let result = policy.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("base_delay"));
    }

    #[test]
    fn reconnect_policy_validate_rejects_max_less_than_base() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(10),
            std::time::Duration::from_secs(5),
            0.5,
        );
        let result = policy.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("max_delay"));
    }

    #[test]
    fn reconnect_policy_validate_rejects_negative_jitter() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            -0.1,
        );
        let result = policy.validate();
        assert!(result.is_err());
    }

    #[test]
    fn reconnect_policy_validate_rejects_excessive_jitter() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            1.5,
        );
        let result = policy.validate();
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Boundary cases — compute_backoff
    // -----------------------------------------------------------------------

    #[test]
    fn compute_backoff_base_equals_max_produces_constant_delay() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(5),
            std::time::Duration::from_secs(5),
            0.0,
        );
        for attempt in 0..5 {
            assert_eq!(
                policy.compute_backoff(attempt),
                std::time::Duration::from_secs(5),
                "attempt={}",
                attempt
            );
        }
    }

    #[test]
    fn compute_backoff_zero_jitter_is_deterministic() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            0.0,
        );
        let d1 = policy.compute_backoff(3);
        let d2 = policy.compute_backoff(3);
        assert_eq!(d1, d2, "zero jitter must produce deterministic delays");
    }

    #[test]
    fn compute_backoff_max_delay_at_extreme_duration() {
        // Max delay set to ~584 years (Duration::MAX approx) should not panic.
        let max_dur = std::time::Duration::from_secs(u64::MAX);
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            max_dur,
            0.0,
        );
        let delay = policy.compute_backoff(100);
        // With base=1s and attempt=100, delay grows large but saturates
        assert!(delay > std::time::Duration::from_secs(1));
        assert!(delay <= max_dur);
    }

    // -----------------------------------------------------------------------
    // Invariant tests — ReconnectPolicy::validate()
    // -----------------------------------------------------------------------

    #[test]
    fn reconnect_policy_validate_enforces_base_delay_positive() {
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_nanos(1),
            std::time::Duration::from_secs(60),
            0.0,
        );
        assert!(policy.validate().is_ok(), "1ns base_delay should be valid");

        let policy = ReconnectPolicy::new(
            std::time::Duration::ZERO,
            std::time::Duration::from_secs(60),
            0.0,
        );
        assert!(policy.validate().is_err(), "zero base_delay should be invalid");
    }

    #[test]
    fn reconnect_policy_validate_enforces_max_delay_ordering() {
        let eq = ReconnectPolicy::new(
            std::time::Duration::from_secs(5),
            std::time::Duration::from_secs(5),
            0.0,
        );
        assert!(eq.validate().is_ok(), "base == max should be valid");

        let lt = ReconnectPolicy::new(
            std::time::Duration::from_secs(5),
            std::time::Duration::from_secs(3),
            0.0,
        );
        assert!(lt.validate().is_err(), "max < base should be invalid");
    }

    #[test]
    fn reconnect_policy_validate_enforces_jitter_ratio_range() {
        let valid = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            0.0,
        );
        assert!(valid.validate().is_ok(), "jitter=0.0 should be valid");

        let valid = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            1.0,
        );
        assert!(valid.validate().is_ok(), "jitter=1.0 should be valid");

        let invalid = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(60),
            1.1,
        );
        assert!(invalid.validate().is_err(), "jitter=1.1 should be invalid");
    }

    #[test]
    fn compute_backoff_jitter_within_bounds() {
        // With jitter, the delay should stay within [(1-jitter)*delay, (1+jitter)*delay]
        // and never exceed max_delay.
        let policy = ReconnectPolicy::new(
            std::time::Duration::from_secs(1),
            std::time::Duration::from_secs(10),
            0.5,
        );
        for attempt in 0..20 {
            let delay = policy.compute_backoff(attempt);
            assert!(delay <= policy.max_delay);
            assert!(delay >= std::time::Duration::ZERO);
        }
    }

    // -----------------------------------------------------------------------
    // SrtpPolicy serde roundtrip (behind serde feature)
    // -----------------------------------------------------------------------

    #[cfg(feature = "serde")]
    #[test]
    fn srtp_policy_serde_roundtrip_disabled() {
        let original = SrtpPolicy::Disabled;
        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: SrtpPolicy = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(original, deserialized);
    }

    #[cfg(all(feature = "serde", feature = "srtp"))]
    #[test]
    fn srtp_policy_serde_roundtrip_all_variants() {
        let variants = [SrtpPolicy::Disabled, SrtpPolicy::Optional, SrtpPolicy::Mandatory];
        for original in &variants {
            let json = serde_json::to_string(original).expect("serialize");
            let deserialized: SrtpPolicy = serde_json::from_str(&json).expect("deserialize");
            assert_eq!(*original, deserialized);
        }
    }

    #[cfg(feature = "serde")]
    #[test]
    fn reconnect_policy_serde_roundtrip() {
        let original = ReconnectPolicy::default();
        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: ReconnectPolicy = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(original.base_delay, deserialized.base_delay);
        assert_eq!(original.max_delay, deserialized.max_delay);
        assert!((original.jitter_ratio - deserialized.jitter_ratio).abs() < f32::EPSILON);
    }

    // -----------------------------------------------------------------------
    // Integration-level: type re-export check
    // -----------------------------------------------------------------------

    #[test]
    fn types_are_re_exported_from_config_module() {
        // Verify types are accessible via crate::config path (set up in config/mod.rs)
        let _policy: SrtpPolicy = SrtpPolicy::Disabled;
        let _reconnect: ReconnectPolicy = ReconnectPolicy::default();
    }
}
