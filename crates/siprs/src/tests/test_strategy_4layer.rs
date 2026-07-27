// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0052:  §43 Test Strategy — 4-Layer Architecture
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0052 --hops=2)
//
// Cross-referenced design context:
//   - requirement/§5 Functional Requirements — Normative Scope [NODE_ID=N0007]
//     (validates ← src/tests/test_strategy_4layer.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0007 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N>)
// ============================================================================

//! # §43 Test Strategy — 4-Layer Architecture
//!
//! This module documents the 4-layer test strategy for the siprs crate, as
//! defined by N0052. Tests are organised in 4 layers from fastest (pure logic,
//! no PJSIP) to most realistic (production PBX interop, CI-external).
//!
//! ```text
//! Layer 1: Unit Tests        ← Fastest, no mock/PJSIP needed, cargo test
//! Layer 2: State-Machine     ← SipBackend MockBackend used, no PJSIP needed
//! Layer 3: SIP Integration   ← Local SIP server via Docker, PJSIP required
//! Layer 4: Interop           ← Real PBX/Proxy, CI-external
//! ```
//!
//! ## Invariants
//!
//! - Each layer has **mutually exclusive scope**: no test item appears in
//!   more than one layer.
//! - Layer 1 and 2 must compile without the `pjsip` feature flag.
//! - Layer 3 tests are gated behind `#[cfg(feature = "pjsip")]`.
//! - Layer 4 tests are manual-run only, documented with runbook steps.
//!
//! Implementation detail: the 4 test layers are enumerated here as the
//! [`TestLayer`] enum, which makes the architecture type-explicit.
//! Actual test code resides in the corresponding `src/tests/` submodules
//! and `tests/` integration test files.

/// Enumerates the 4 test layers — the crate's testing architecture.
///
/// Each variant carries a brief description of its scope and environment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
// [::TICKET::] P1-4: 4-layer test strategy defined.
//   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
pub enum TestLayer {
    /// **Layer 1 – Unit Tests**: Pure logic, no async, no PJSIP.
    /// Scope: config validation, BiMap id mapping, pair aligner, resampler,
    /// mixer clipping, event filtering, `SipError` consistency.
    /// Tools: `MockBackend`, `cargo test`.
    Unit,

    /// **Layer 2 – State-Machine Tests**: Deterministic async state machines.
    /// Scope: `RegistrationState` transitions, `CallState` transitions,
    /// concurrency (max_calls), duplicate register/unregister, shutdown.
    /// Tools: `MockBackend` injected into `Runtime`, `#[tokio::test]`.
    StateMachine,

    /// **Layer 3 – SIP Integration Tests**: Real SIP protocol via Docker.
    /// Scope: REGISTER, INVITE/BYE, DTMF (Inband/SIP INFO/RFC4733),
    /// TURN/ICE, media loopback, dual-account calls.
    /// Environment: Docker Asterisk 20.6.0 / FreeSWITCH, `#[cfg(feature = "pjsip")]`.
    /// CI: GitHub Actions `ubuntu-22.04` with `services.asterisk`.
    SipIntegration,

    /// **Layer 4 – Interop Tests**: Real PBX/Proxy, CI-external.
    /// Scope: Asterisk (LTS), FreeSWITCH, OpenSIPS, Kamailio, 3CX (SBC).
    /// Tests: REGISTER, INVITE/BYE, DTMF, SRTP, TLS, ICE/TURN, Hold/Transfer.
    /// Priority: P0 = Asterisk + FreeSWITCH (before 1.0), P1 = others (post-1.0).
    Interop,
}

// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
impl TestLayer {
    /// Returns true if this layer can run without the `pjsip` feature flag.
    ///
    /// Layers 1 and 2 are PJSIP-free for fast developer feedback.
    /// Layers 3 and 4 require the actual PJSIP library (or real PBX).
    // [::TICKET::] P1-4: 4-layer test strategy defined.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
    pub fn is_pjsip_free(self) -> bool {
        matches!(self, TestLayer::Unit | TestLayer::StateMachine)
    }

    /// Returns true if this layer can run in CI (GitHub Actions).
    ///
    /// Layer 4 (Interop) requires real PBX infrastructure and is CI-external.
    // [::TICKET::] P1-4: 4-layer test strategy defined.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
    pub fn is_ci_compatible(self) -> bool {
        !matches!(self, TestLayer::Interop)
    }

    /// Human-readable label for documentation output.
    // [::TICKET::] P1-4: 4-layer test strategy defined.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
    pub fn label(self) -> &'static str {
        match self {
            TestLayer::Unit => "Unit Tests (PJSIP-free)",
            TestLayer::StateMachine => "State-Machine (MockBackend)",
            TestLayer::SipIntegration => "SIP Integration (Docker)",
            TestLayer::Interop => "Interop (real PBX, CI-external)",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C053-invariant
    // [::TICKET::] P1-4: 4-layer test strategy defined.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    fn all_four_layers_exist() {
        let layers = [
            TestLayer::Unit,
            TestLayer::StateMachine,
            TestLayer::SipIntegration,
            TestLayer::Interop,
        ];
        assert_eq!(layers.len(), 4, "exactly 4 test layers must be defined");
    }

    #[test]
    // @verifies C053-invariant
    // [::TICKET::] P1-4: 4-layer test strategy defined.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    fn layers_1_and_2_are_pjsip_free() {
        assert!(TestLayer::Unit.is_pjsip_free());
        assert!(TestLayer::StateMachine.is_pjsip_free());
        assert!(!TestLayer::SipIntegration.is_pjsip_free());
        assert!(!TestLayer::Interop.is_pjsip_free());
    }

    #[test]
    // @verifies C053-invariant
    // [::TICKET::] P1-4: 4-layer test strategy defined.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    fn only_layer_4_is_not_ci_compatible() {
        assert!(TestLayer::Unit.is_ci_compatible());
        assert!(TestLayer::StateMachine.is_ci_compatible());
        assert!(TestLayer::SipIntegration.is_ci_compatible());
        assert!(!TestLayer::Interop.is_ci_compatible());
    }
}
