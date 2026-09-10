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
//   - NODE_ID=N0111:  Real PJSIP integration test
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0111 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! §62.42 (N0111) real-PJSIP protocol + RTP integration-test scope — Q21.
//!
//! Encodes the §62.42 decision as testable data so the scope is verified in the
//! default build, while the real-SIP tests (`tests/sip_integration.rs`) run only
//! under `pjsua-native` in CI:
//! 1. the protocol level (REGISTER→200 / INVITE→180/200 / BYE / SIP INFO /
//!    RFC 4733 DTMF / STUN binding / TURN allocate / relay via coturn) and the
//!    communication level (2-endpoint RTP media) are both listed by
//!    [`RealPjsipItestPolicy`];
//! 2. every listed test name must exist as a `#[tokio::test]` in
//!    `tests/sip_integration.rs` (C150-post);
//! 3. `make test-integration` drives compose up → pjsua-native test → compose
//!    down with a guaranteed teardown `trap` (C150-inv);
//! 4. the tests run real PJSIP only — TestBackend green is never evidence of a
//!    real SIP verification (C151-inv, §62.38 Q17).

use crate::tests::docker_asterisk_it::SKIP_MESSAGE;

/// The integration-test binary name (Cargo.toml `[[test]]`).
pub const SIP_INTEGRATION_TEST: &str = "sip_integration";
/// The Makefile target driving compose up → test → down.
pub const MAKE_TARGET: &str = "test-integration";
/// The Cargo feature gating the real-SIP integration tests (Q9a).
pub const FEATURE_GATE: &str = "pjsua-native";
/// The runtime docker-availability gate name (Q9c).
pub const DOCKER_GATE: &str = "docker_available";

/// Protocol-level integration tests (REGISTER/INVITE/BYE/DTMF/STUN-TURN).
pub const PROTOCOL_LEVEL_TESTS: &[&str] = &[
    "register_against_asterisk",
    "outgoing_call_to_asterisk",
    "incoming_call_via_originate",
    "dtmf_sip_info",
    "dtmf_rfc4733",
    "coturn_stun_turn_ice",
];

/// Communication-level integration tests (2-endpoint RTP media).
pub const RTP_LEVEL_TESTS: &[&str] = &["register_invite_bye_rtp_flow"];

/// §62.42 (Q21) real-PJSIP integration-test scope encoded as data.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RealPjsipItestPolicy {
    /// Integration-test file under `tests/`.
    pub test_file: &'static str,
    /// Cargo feature gating the integration tests (Q9a).
    pub feature_gate: &'static str,
    /// Makefile target driving compose up → test → down (Q9b).
    pub make_target: &'static str,
    /// Docker-availability gate name (Q9c).
    pub docker_gate: &'static str,
    /// Skip message printed when docker is unavailable (Q9c).
    pub skip_message: &'static str,
    /// Protocol-level test names (REGISTER→200 / INVITE→180/200 / BYE /
    /// SIP INFO / RFC 4733 DTMF / STUN binding / TURN allocate / relay).
    pub protocol_level_tests: &'static [&'static str],
    /// Communication-level test names (2-endpoint RTP media exchange).
    pub rtp_level_tests: &'static [&'static str],
}

// [::TICKET::] P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-5 --for-spec --no-implementation-order`.
impl RealPjsipItestPolicy {
    /// The §62.42 policy instance.
    pub const fn policy() -> Self {
        Self {
            test_file: "tests/sip_integration.rs",
            feature_gate: FEATURE_GATE,
            make_target: MAKE_TARGET,
            docker_gate: DOCKER_GATE,
            skip_message: SKIP_MESSAGE,
            protocol_level_tests: PROTOCOL_LEVEL_TESTS,
            rtp_level_tests: RTP_LEVEL_TESTS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::docker_asterisk_it::DockerItPolicy;
    use crate::tests::raw_sip_real_test::RawSipRealTestPolicy;
    use crate::tests::test_strategy_4layer::TestLayer;
    use std::path::Path;

    /// Read `tests/sip_integration.rs` as text; an absent file reads as empty
    /// so the "test must exist" assertions fail loudly instead of panicking.
// [::TICKET::] P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-5 --for-spec --no-implementation-order`.
    fn sip_integration_src() -> String {
        std::fs::read_to_string("tests/sip_integration.rs").unwrap_or_default()
    }

    // ── C150: N0111 → N0088 (§62.42 → §62.19 docker base) ──────────────

    /// C150-Pre: N0088 defines the docker Asterisk/coturn base.
    // @verifies C150-pre
    #[test]
    // [::TICKET::] P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-5 --for-spec --no-implementation-order`.
    fn c150_pre_docker_base_defines_infrastructure() {
        let policy = DockerItPolicy::policy();
        assert_eq!(policy.compose_file, "docker-compose.yml");
        assert_eq!(policy.services, &["asterisk", "coturn"]);
        assert_eq!(policy.feature_gate, "pjsua-native");
        assert_eq!(policy.make_target, "test-integration");
        assert_eq!(policy.skip_message, SKIP_MESSAGE);
        assert!(Path::new("docker-compose.yml").exists());
    }

    /// C150-Post: protocol + RTP levels are listed and each test exists.
    // @verifies C150-post
    #[test]
    // [::TICKET::] P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-5 --for-spec --no-implementation-order`.
    fn c150_post_protocol_and_rtp_levels_listed_and_exist() {
        let policy = RealPjsipItestPolicy::policy();
        assert_eq!(policy.test_file, "tests/sip_integration.rs");
        let src = sip_integration_src();
        for name in policy.protocol_level_tests {
            assert!(
                src.contains(name),
                "{name} must exist in tests/sip_integration.rs"
            );
        }
        for name in policy.rtp_level_tests {
            assert!(
                src.contains(name),
                "{name} must exist in tests/sip_integration.rs"
            );
        }
        // The §62.19 matrix grows from 5 (P16-10) to 8 with the §62.42 tests.
        assert_eq!(DockerItPolicy::policy().integration_tests.len(), 8);
    }

    /// C150-Inv: make test-integration green with a guaranteed teardown.
    // @verifies C150-inv
    #[test]
    // [::TICKET::] P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-5 --for-spec --no-implementation-order`.
    fn c150_inv_make_test_integration_guarantees_teardown() {
        let makefile = std::fs::read_to_string("Makefile").unwrap_or_default();
        assert!(makefile.contains("docker compose up -d"));
        assert!(makefile.contains("trap 'docker compose down' EXIT"));
        assert!(makefile.contains(
            "cargo test --features pjsua-native --test sip_integration"
        ));
        let cargo_toml = std::fs::read_to_string("Cargo.toml").unwrap_or_default();
        assert!(cargo_toml.contains("name = \"sip_integration\""));
        assert!(cargo_toml.contains("required-features = [\"pjsua-native\"]"));
    }

    // ── C151: N0111 → N0052 (§62.42 → §43 4-layer strategy) ────────────

    /// C151-Pre: §43 defines Layer 3 (docker SIP) and Layer 4 (real PBX).
    // @verifies C151-pre
    #[test]
    // [::TICKET::] P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-5 --for-spec --no-implementation-order`.
    fn c151_pre_four_layer_strategy_defines_layers() {
        assert!(!TestLayer::Layer3SipIntegration.is_pjsip_free());
        assert!(TestLayer::Layer3SipIntegration.is_ci_runnable());
        assert!(!TestLayer::Layer4Interop.is_ci_runnable());
        assert!(TestLayer::Layer3SipIntegration
            .description()
            .contains("Docker Asterisk"));
    }

    /// C151-Post: Layer 4 interop tests run real PJSIP only.
    // @verifies C151-post
    #[test]
    // [::TICKET::] P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-5 --for-spec --no-implementation-order`.
    fn c151_post_layer4_runs_real_pjsip() {
        let policy = RealPjsipItestPolicy::policy();
        assert_eq!(policy.feature_gate, "pjsua-native");
        assert_eq!(policy.docker_gate, "docker_available");
        let src = sip_integration_src();
        assert!(src.contains("#![cfg(feature = \"pjsua-native\")]"));
        assert!(src.contains("docker_available()"));
    }

    /// C151-Inv: TestBackend green is never evidence of a real SIP verification.
    // @verifies C151-inv
    #[test]
    // [::TICKET::] P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-5 --for-spec --no-implementation-order`.
    fn c151_inv_testbackend_green_not_real_sip_verification() {
        let raw = RawSipRealTestPolicy::policy();
        assert_eq!(raw.observation_only, "PJ_FALSE");
        assert_eq!(
            raw.production_path_steps(),
            &[
                "pjsip_module hook",
                "enqueue_raw_sip_bytes",
                "drain_and_publish_raw_sip",
                "subscribe_raw_sip",
            ]
        );
        let src = sip_integration_src();
        for new_test in ["dtmf_sip_info", "dtmf_rfc4733", "register_invite_bye_rtp_flow"] {
            assert!(
                src.contains(new_test),
                "{new_test} must be docker-gated in sip_integration.rs"
            );
        }
        assert_eq!(SKIP_MESSAGE, "[SKIPPED: docker unavailable]");
    }
}
