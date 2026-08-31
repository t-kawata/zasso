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
//   - NODE_ID=N0088:  62.19 Docker/Asterisk 実 SIP 統合テスト基盤
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0088 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! §62.19 (N0088) docker integration-test base — Q9/Q9a-c.
//!
//! Encodes the five §62.19 decisions as testable data so the base is verified
//! in the default build, while the real-SIP tests (`tests/sip_integration.rs`)
//! run only under `pjsua-native` in CI:
//! 1. the integration tests live in `tests/sip_integration.rs`, gated by
//!    `#![cfg(feature = "pjsua-native")]` (Q9a);
//! 2. `docker-compose.yml` defines the `asterisk` and `coturn` services and the
//!    `make test-integration` target drives compose up → test → down (Q9b);
//! 3. every test gates on [`docker_available`] and prints
//!    [`SKIP_MESSAGE`] when docker is unavailable (Q9c) — a local skip that CI
//!    treats as a mandatory gate;
//! 4. the matrix covers outbound (siprs→Asterisk) and inbound (Asterisk→siprs
//!    via `channel originate`) real-SIP interop;
//! 5. coturn verifies STUN binding, TURN allocate, and relay media at the
//!    protocol level (Q7a, deferred from P16-8).

use crate::tests::test_strategy_4layer::TestLayer;
use std::time::Duration;

/// Q9c skip message printed when the docker daemon is unavailable.
pub const SKIP_MESSAGE: &str = "[SKIPPED: docker unavailable]";
/// The compose file defining the `asterisk` / `coturn` services (Q9b).
pub const DOCKER_COMPOSE_FILE: &str = "docker-compose.yml";
/// The integration-test binary name declared in `Cargo.toml` `[[test]]`.
pub const SIP_INTEGRATION_TEST: &str = "sip_integration";
/// The Makefile target driving `compose up → test → compose down` (Q9b).
pub const MAKE_TARGET: &str = "test-integration";
/// Asterisk image, aligned with `DockerIntegrationJob::asterisk_job` (§44).
pub const ASTERISK_IMAGE: &str = "asterisk:20.6.0";
/// coturn image used for STUN/TURN/ICE protocol-level verification (Q7a).
pub const COTURN_IMAGE: &str = "coturn/coturn:4.6";
/// SIP UDP port on which Asterisk listens.
pub const ASTERISK_SIP_PORT: u16 = 5060;
/// SIP TCP port on which Asterisk listens (§44 CI job).
pub const ASTERISK_SIP_TCP_PORT: u16 = 5061;
/// STUN/TURN listening port of coturn.
pub const COTURN_STUN_PORT: u16 = 3478;
/// Upper bound for any event-wait loop in the integration tests.
pub const IT_EVENT_TIMEOUT: Duration = Duration::from_secs(30);

/// Direction of an integration-test interaction relative to siprs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IntegrationDirection {
    /// siprs originates the interaction (REGISTER / INVITE).
    Outbound,
    /// Asterisk originates the interaction (`channel originate`).
    Inbound,
    /// STUN binding / TURN allocate / relay media through coturn.
    Ice,
}

/// One row of the §62.19 integration-test matrix.
#[derive(Debug, Clone, Copy)]
pub struct IntegrationTestEntry {
    /// Test-case name in `tests/sip_integration.rs`.
    pub name: &'static str,
    /// Whether siprs or Asterisk originates the flow.
    pub direction: IntegrationDirection,
    /// What the test verifies.
    pub description: &'static str,
}

/// §62.19 (Q9a-c) docker integration-test policy encoded as data.
#[derive(Debug, Clone, Copy)]
pub struct DockerItPolicy {
    /// Integration-test file under `tests/` (Q9a).
    pub test_file: &'static str,
    /// Compose definition file (Q9b).
    pub compose_file: &'static str,
    /// Makefile target driving compose up → test → down (Q9b).
    pub make_target: &'static str,
    /// Compose service names.
    pub services: &'static [&'static str],
    /// Cargo feature gating the integration tests (Q9a).
    pub feature_gate: &'static str,
    /// Text printed when docker is unavailable (Q9c).
    pub skip_message: &'static str,
    /// Test layer this base realizes (§43 Layer 3).
    pub test_layer: TestLayer,
    /// The integration-test matrix (C117-inv: outbound + inbound).
    pub integration_tests: &'static [IntegrationTestEntry],
    /// CI always has docker; the gate is a local skip only (C118-inv).
    pub ci_requires_docker: bool,
}

// [::TICKET::] P16-10, P19-1, P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-10|P19-1|P19-5) --for-spec --no-implementation-order`.
impl DockerItPolicy {
    /// The §62.19 policy instance.
    pub const fn policy() -> Self {
        Self {
            test_file: "tests/sip_integration.rs",
            compose_file: DOCKER_COMPOSE_FILE,
            make_target: MAKE_TARGET,
            services: &["asterisk", "coturn"],
            feature_gate: "pjsua-native",
            skip_message: SKIP_MESSAGE,
            test_layer: TestLayer::Layer3SipIntegration,
            integration_tests: &[
                IntegrationTestEntry {
                    name: "register_against_asterisk",
                    direction: IntegrationDirection::Outbound,
                    description: "REGISTER to Asterisk and await RegistrationState::Registered",
                },
                IntegrationTestEntry {
                    name: "outgoing_call_to_asterisk",
                    direction: IntegrationDirection::Outbound,
                    description: "INVITE to Asterisk and await CallConnected, then hangup",
                },
                IntegrationTestEntry {
                    name: "incoming_call_via_originate",
                    direction: IntegrationDirection::Inbound,
                    description: "Asterisk channel originate → IncomingCall → answer(200)",
                },
                IntegrationTestEntry {
                    name: "coturn_stun_turn_ice",
                    direction: IntegrationDirection::Ice,
                    description: "STUN binding + TURN allocate + relay media through coturn",
                },
                IntegrationTestEntry {
                    name: "raw_sip_rx_reaches_subscriber",
                    direction: IntegrationDirection::Outbound,
                    description: "Asterisk REGISTER response reaches subscribe_raw_sip() via the real PJSIP hook (§62.38 Q17)",
                },
                IntegrationTestEntry {
                    name: "dtmf_sip_info",
                    direction: IntegrationDirection::Outbound,
                    description: "SIP INFO DTMF (DtmfMethod::Info) sent to Asterisk echo reaches DtmfSent (§62.42 Q21)",
                },
                IntegrationTestEntry {
                    name: "dtmf_rfc4733",
                    direction: IntegrationDirection::Outbound,
                    description: "RFC 4733 DTMF (DtmfMethod::Rfc4733) sent to Asterisk echo reaches DtmfSent (§62.42 Q21)",
                },
                IntegrationTestEntry {
                    name: "register_invite_bye_rtp_flow",
                    direction: IntegrationDirection::Outbound,
                    description: "2-endpoint RTP media exchange between alice and bob (§62.42 Q21)",
                },
            ],
            ci_requires_docker: true,
        }
    }
}

/// True when the docker daemon answers `docker info` (Q9c gate).
///
/// The check is intentionally cheap (`docker info` exit code) — the compose
/// services themselves are guaranteed up by the `make test-integration`
/// target. When docker is unavailable the skip message is printed and the
/// caller returns early without touching any real SIP state.
pub fn docker_available() -> bool {
    let status = std::process::Command::new("docker")
        .args(["info"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
    let available = docker_info_succeeds(status.ok());
    if !available {
        tracing::warn!("{SKIP_MESSAGE}");
    }
    available
}

/// Pure predicate: `docker info` succeeded exactly when the exit status is
/// `Some(0)`. `None` (spawn failure) and non-zero exits mean unavailable.
// [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
fn docker_info_succeeds(status: Option<std::process::ExitStatus>) -> bool {
    status.map(|exit| exit.success()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::architecture::round2_scope_rootcause::{known_graph_node_ids, Round2Section};
    use crate::build::cicd_docker_prebuilt::DockerIntegrationJob;
    use std::process::ExitStatus;

    // `ExitStatus::from_raw` is a platform trait method; importing the trait
    // makes the gate test cross-platform (unix + windows CI matrix, §44).
    #[cfg(unix)]
    use std::os::unix::process::ExitStatusExt;
    #[cfg(windows)]
    use std::os::windows::process::ExitStatusExt;

    // ── C116: N0088 → N0068 (§62) ──────────────────────────────────────────

    /// C116-Pre: §62 parent section resolves N0088 into §62.19.
    // @verifies C116-pre
    #[test]
    // [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
    fn c116_pre_parent_section_resolves_n0088() {
        assert!(known_graph_node_ids().contains(&"N0088"));
        assert_eq!(Round2Section::DockerAsteriskBase.section(), "62.19");
        assert_eq!(Round2Section::DockerAsteriskBase.node_id(), "N0088");
    }

    /// C116-Post: DockerItPolicy encodes the five Q9 decisions.
    // @verifies C116-post
    #[test]
// [::TICKET::] P16-10, P19-1, P19-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P16-10|P19-1|P19-5) --for-spec --no-implementation-order`.
    fn c116_post_policy_encodes_q9_decisions() {
        let policy = DockerItPolicy::policy();
        assert_eq!(policy.test_file, "tests/sip_integration.rs");
        assert_eq!(policy.compose_file, "docker-compose.yml");
        assert_eq!(policy.make_target, "test-integration");
        assert_eq!(policy.services, &["asterisk", "coturn"]);
        assert_eq!(policy.feature_gate, "pjsua-native");
        assert_eq!(policy.skip_message, "[SKIPPED: docker unavailable]");
        // §62.42 (P19-5) grows the §62.19 matrix from 5 to 8: the protocol-level
        // DTMF pair (SIP INFO / RFC 4733) and the 2-endpoint RTP flow.
        assert_eq!(policy.integration_tests.len(), 8);
    }

    /// C116-Inv: the base is consistent with §43 (Layer 3) and §44 (docker job).
    // @verifies C116-inv
    #[test]
    // [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
    fn c116_inv_consistent_with_layer3_and_docker_job() {
        let policy = DockerItPolicy::policy();
        assert_eq!(policy.test_layer, TestLayer::Layer3SipIntegration);
        let job = DockerIntegrationJob::asterisk_job();
        assert_eq!(ASTERISK_IMAGE, job.image);
        assert_eq!(ASTERISK_SIP_PORT, 5060);
        assert_eq!(ASTERISK_SIP_TCP_PORT, 5061);
    }

    // ── C117: N0088 → N0052 (§43) ──────────────────────────────────────────

    /// C117-Pre: §43 defines Layer 3 (docker SIP) and Layer 4 (real PBX interop).
    // @verifies C117-pre
    #[test]
    // [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
    fn c117_pre_layer3_and_layer4_defined() {
        assert!(!TestLayer::Layer3SipIntegration.is_pjsip_free());
        assert!(TestLayer::Layer3SipIntegration.is_ci_runnable());
        assert!(!TestLayer::Layer4Interop.is_ci_runnable());
        assert!(TestLayer::Layer3SipIntegration
            .description()
            .contains("Docker Asterisk"));
    }

    /// C117-Post: docker_available() gate reports docker info success; the
    /// skip message is exactly `[SKIPPED: docker unavailable]` (Q9c).
    // @verifies C117-post
    #[test]
    // [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
    fn c117_post_docker_gate_and_skip_semantics() {
        assert!(docker_info_succeeds(Some(ExitStatus::from_raw(0))));
        assert!(!docker_info_succeeds(Some(ExitStatus::from_raw(1))));
        assert!(!docker_info_succeeds(None));
        assert_eq!(SKIP_MESSAGE, "[SKIPPED: docker unavailable]");
    }

    /// C117-Inv: the matrix guarantees both outbound (siprs→Asterisk) and
    /// inbound (Asterisk→siprs) real-SIP interop.
    // @verifies C117-inv
    #[test]
    // [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
    fn c117_inv_matrix_covers_both_directions() {
        let policy = DockerItPolicy::policy();
        let outbound = policy
            .integration_tests
            .iter()
            .filter(|entry| entry.direction == IntegrationDirection::Outbound)
            .count();
        let inbound = policy
            .integration_tests
            .iter()
            .filter(|entry| entry.direction == IntegrationDirection::Inbound)
            .count();
        assert!(outbound >= 2, "REGISTER + INVITE are outbound");
        assert!(inbound >= 1, "channel originate is inbound");
    }

    // ── C118: N0088 → N0054 (§44) ──────────────────────────────────────────

    /// C118-Pre: §44 defines the docker integration job (Asterisk image + ports).
    // @verifies C118-pre
    #[test]
    // [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
    fn c118_pre_docker_job_defined() {
        let job = DockerIntegrationJob::asterisk_job();
        assert_eq!(job.image, "asterisk:20.6.0");
        assert_eq!(job.ports, &[("udp", 5060, 5060), ("tcp", 5061, 5061)]);
    }

    /// C118-Post: compose services (asterisk/coturn) and their ports are defined.
    // @verifies C118-post
    #[test]
    // [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
    fn c118_post_compose_services_defined() {
        let policy = DockerItPolicy::policy();
        assert_eq!(policy.services, &["asterisk", "coturn"]);
        assert_eq!(ASTERISK_IMAGE, "asterisk:20.6.0");
        assert_eq!(COTURN_IMAGE, "coturn/coturn:4.6");
        assert_eq!(COTURN_STUN_PORT, 3478);
    }

    /// C118-Inv: CI always has docker; the gate is a local skip only.
    // @verifies C118-inv
    #[test]
    // [::TICKET::] P16-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-10 --for-spec --no-implementation-order`.
    fn c118_inv_ci_requires_docker() {
        let policy = DockerItPolicy::policy();
        assert!(
            policy.ci_requires_docker,
            "CI treats docker as a mandatory gate"
        );
        assert!(!DockerIntegrationJob::asterisk_job().image.is_empty());
    }
}
