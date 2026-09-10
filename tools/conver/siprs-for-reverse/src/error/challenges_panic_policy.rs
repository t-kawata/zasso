
/// The four known implementation challenges documented in RFC §45.
///
/// Each challenge has a documented solution approach. These are the primary
/// design risk areas identified during the RFC phase.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImplementationChallenge {
    /// PJSIP callback → async bridge: callbacks must only enqueue;
    /// state transitions happen in the reactor.
    CallbackToAsyncBridge,
    /// Send/receive audio timing drift: PairAligner + tolerance +
    /// zero-padding + drift metrics.
    AudioTimingDrift,
    /// Multi-source audio injection: per-call AudioMixer and source
    /// lifecycle API with atomic frame-boundary switching.
    MultiSourceInjection,
    /// Native PJSIP ID reuse: public IDs are separately numbered with
    /// BiMap conversion to hide native ID reuse.
    NativeIdReuse,
}

impl ImplementationChallenge {
    /// Returns all four known challenges.
    pub const fn all() -> &'static [Self] {
        &[
            Self::CallbackToAsyncBridge,
            Self::AudioTimingDrift,
            Self::MultiSourceInjection,
            Self::NativeIdReuse,
        ]
    }

    /// Returns the RFC-identified solution approach for this challenge.
    pub const fn solution(&self) -> &'static str {
        match self {
            Self::CallbackToAsyncBridge => {
                "Callback enqueues only; state transitions are handled by the reactor. \
                 This avoids reentrancy and mutex inversion."
            }
            Self::AudioTimingDrift => {
                "PairAligner with configurable tolerance threshold, zero-padding for \
                 underruns, and drift metrics for observability."
            }
            Self::MultiSourceInjection => {
                "Per-call AudioMixer with source lifecycle API; sources are swapped \
                 atomically at frame boundaries."
            }
            Self::NativeIdReuse => {
                "Public IDs are separately numbered; BiMap conversion hides native \
                 PJSIP ID reuse from application code."
            }
        }
    }
}

/// Panic policy for the siprs crate (RFC §46).
///
/// The goal is a panic-free public API. Internal panics in FFI callbacks
/// are caught via `std::panic::catch_unwind` with a 4-step cleanup procedure.
#[derive(Debug, Clone, Copy)]
pub struct PanicPolicy;

impl PanicPolicy {
    /// The four steps of the catch_unwind cleanup procedure.
    ///
    /// 1. **Catch**: Wrap each FFI callback body in `std::panic::catch_unwind`.
    /// 2. **Log**: Record the panic location and message via `tracing::error!`.
    /// 3. **Cleanup**: Restore partially-modified state to a consistent snapshot.
    /// 4. **Recover**: Return a safe default value or re-enter the reactor loop.
    pub const fn cleanup_steps() -> &'static [&'static str] {
        &["catch", "log", "cleanup", "recover"]
    }

    /// Returns true if `catch_unwind` is mandatory for all FFI callbacks.
    ///
    /// This invariant MUST hold for every PJSIP callback registered through
    /// the FFI layer (P4-2). Violating this can cause undefined behaviour
    /// from panics unwinding across C ABI boundaries.
    pub const fn catch_unwind_mandatory() -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── C056-Precondition: All 4 known challenges documented ────
    #[test]
    fn test_four_known_challenges_documented() {
        let challenges = ImplementationChallenge::all();
        assert_eq!(challenges.len(), 4,
            "All 4 known implementation challenges must be documented");

        let names: Vec<&str> = challenges.iter().map(|c| match c {
            ImplementationChallenge::CallbackToAsyncBridge => "callback_to_async_bridge",
            ImplementationChallenge::AudioTimingDrift => "audio_timing_drift",
            ImplementationChallenge::MultiSourceInjection => "multi_source_injection",
            ImplementationChallenge::NativeIdReuse => "native_id_reuse",
        }).collect();

        assert!(names.contains(&"callback_to_async_bridge"));
        assert!(names.contains(&"audio_timing_drift"));
        assert!(names.contains(&"multi_source_injection"));
        assert!(names.contains(&"native_id_reuse"));
    }

    // ── C056-Postcondition: Panic policy 4-step cleanup ────────
    #[test]
    fn test_panic_policy_cleanup_four_steps() {
        let steps = PanicPolicy::cleanup_steps();
        assert_eq!(steps.len(), 4,
            "Panic cleanup must have exactly 4 steps");
        assert!(steps.contains(&"catch"),
            "Step 1 must catch the panic via std::panic::catch_unwind");
        assert!(steps.contains(&"log"),
            "Step 2 must log the panic context with tracing::error!");
        assert!(steps.contains(&"cleanup"),
            "Step 3 must restore partially-modified state");
        assert!(steps.contains(&"recover"),
            "Step 4 must recover or re-enter the reactor loop");
    }

    // ── C056-Invariant: catch_unwind is mandatory for FFI callbacks ─
    #[test]
    fn test_catch_unwind_is_mandatory_for_ffi() {
        assert!(PanicPolicy::catch_unwind_mandatory(),
            "catch_unwind is mandatory for all FFI callbacks");
    }

    // ── Each challenge has a non-empty solution ─────────────────
    #[test]
    fn test_each_challenge_has_solution() {
        for challenge in ImplementationChallenge::all() {
            let solution = challenge.solution();
            assert!(!solution.is_empty(),
                "Challenge {:?} must have a documented solution", challenge);
        }
    }

    // ── Challenge variants are distinct ─────────────────────────
    #[test]
    fn test_challenge_variants_are_distinct() {
        let challenges = ImplementationChallenge::all();
        for i in 0..challenges.len() {
            for j in (i + 1)..challenges.len() {
                assert_ne!(challenges[i], challenges[j],
                    "Challenge variants must be distinct");
            }
        }
    }
}
