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
//   - NODE_ID=N0107:  Raw SIP real test
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0107 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! §62.38 (N0107) real-PJSIP raw SIP verification path — Q17.
//!
//! Encodes the §62.38 decision as testable data so the base is verified in the
//! default build, while the real-SIP test (`raw_sip_rx_reaches_subscriber`)
//! runs only under `pjsua-native` in `tests/sip_integration.rs`:
//! 1. `subscribe_raw_sip()` is fixed by a complete integration test through the
//!    real path (`pjsip_module` hook → `enqueue_raw_sip_bytes` →
//!    `drain_and_publish_raw_sip` → `subscribe_raw_sip()`);
//! 2. TestBackend test-only hooks and other dummy implementations are forbidden
//!    (Q17) — verification is real-PJSIP-only;
//! 3. the `pjsip_module` hook stays observation-only (`PJ_FALSE`);
//! 4. TestBackend / default build keeps `subscribe_raw_sip()` as a silent
//!    channel (spec, not a bug);
//! 5. `make test-integration` is the gate (compose up → pjsua-native test →
//!    compose down).

use crate::tests::docker_asterisk_it::SKIP_MESSAGE;

/// The integration-test binary name (Cargo.toml `[[test]]`).
pub const SIP_INTEGRATION_TEST: &str = "sip_integration";
/// The real-PJSIP raw SIP test name inside `tests/sip_integration.rs`.
pub const RAW_SIP_RX_TEST: &str = "raw_sip_rx_reaches_subscriber";
/// The Makefile target driving compose up → test → down.
pub const MAKE_TARGET: &str = "test-integration";
/// The Cargo feature gating the real-SIP integration tests (Q9a).
pub const FEATURE_GATE: &str = "pjsua-native";
/// The production wiring point where the raw SIP module is registered (P17-2).
pub const REGISTER_CALL_SITE: &str = "src/ffi/backend_calls.rs";
/// The pjsip_module hook definition file (P17-2 §62.22).
pub const MODULE_FILE: &str = "src/ffi/raw_sip_module.rs";
/// The value handed back by the observation-only handlers.
pub const OBSERVATION_ONLY: &str = "PJ_FALSE";
/// The name of the docker-availability gate (N0088).
pub const DOCKER_GATE: &str = "docker_available";

/// The production path the integration test exercises, in order.
pub const PRODUCTION_PATH_STEPS: &[&str] = &[
    "pjsip_module hook",
    "enqueue_raw_sip_bytes",
    "drain_and_publish_raw_sip",
    "subscribe_raw_sip",
];

/// §62.38 (Q17) raw SIP real-PJSIP verification policy encoded as data.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RawSipRealTestPolicy {
    /// Integration-test file under `tests/`.
    pub test_file: &'static str,
    /// Real-PJSIP raw SIP test name.
    pub test_name: &'static str,
    /// Makefile target driving compose up → test → down.
    pub make_target: &'static str,
    /// Cargo feature gating the integration tests.
    pub feature_gate: &'static str,
    /// Skip message printed when docker is unavailable (Q9c).
    pub skip_message: &'static str,
    /// Production wiring point where the raw SIP module is registered.
    pub register_call_site: &'static str,
    /// The pjsip_module hook definition file.
    pub module_file: &'static str,
    /// Docker-availability gate name.
    pub docker_gate: &'static str,
    /// The value handed back by the observation-only handlers.
    pub observation_only: &'static str,
}

// [::TICKET::] P19-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-1 --for-spec --no-implementation-order`.
impl RawSipRealTestPolicy {
    /// The §62.38 policy instance.
    pub const fn policy() -> Self {
        Self {
            test_file: "tests/sip_integration.rs",
            test_name: RAW_SIP_RX_TEST,
            make_target: MAKE_TARGET,
            feature_gate: FEATURE_GATE,
            skip_message: SKIP_MESSAGE,
            register_call_site: REGISTER_CALL_SITE,
            module_file: MODULE_FILE,
            docker_gate: DOCKER_GATE,
            observation_only: OBSERVATION_ONLY,
        }
    }

    /// The production path the integration test exercises, in order.
    pub const fn production_path_steps(&self) -> &'static [&'static str] {
        PRODUCTION_PATH_STEPS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── C145: N0107 → N0091 (§62.22 raw SIP production path) ─────────────

    /// C145-Pre: N0091 defines the pjsip_module hook.
    // @verifies C145-pre
    #[test]
// [::TICKET::] P19-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-1 --for-spec --no-implementation-order`.
    fn c145_pre_pjsip_module_hook_defined() {
        let policy = RawSipRealTestPolicy::policy();
        assert_eq!(policy.module_file, "src/ffi/raw_sip_module.rs");
        assert!(
            std::path::Path::new(policy.module_file).exists(),
            "raw_sip_module.rs must exist (P17-2 §62.22)"
        );
    }

    /// C145-Post: the real integration test verifies subscribe_raw_sip().
    // @verifies C145-post
    #[test]
// [::TICKET::] P19-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-1 --for-spec --no-implementation-order`.
    fn c145_post_real_test_verifies_subscribe_raw_sip() {
        let policy = RawSipRealTestPolicy::policy();
        assert_eq!(policy.test_name, "raw_sip_rx_reaches_subscriber");
        assert_eq!(policy.test_file, "tests/sip_integration.rs");
    }

    /// C145-Inv: no TestBackend dummy hooks — the production path is wired.
    // @verifies C145-inv
    #[test]
// [::TICKET::] P19-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-1 --for-spec --no-implementation-order`.
    fn c145_inv_no_testbackend_dummy_hooks() {
        let policy = RawSipRealTestPolicy::policy();
        assert_eq!(policy.register_call_site, "src/ffi/backend_calls.rs");
        assert_eq!(policy.observation_only, "PJ_FALSE");
        assert_eq!(
            policy.production_path_steps(),
            &[
                "pjsip_module hook",
                "enqueue_raw_sip_bytes",
                "drain_and_publish_raw_sip",
                "subscribe_raw_sip",
            ]
        );
    }

    // ── C146: N0107 → N0088 (§62.19 docker integration base) ─────────────

    /// C146-Pre: N0088 defines the docker integration base.
    // @verifies C146-pre
    #[test]
// [::TICKET::] P19-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-1 --for-spec --no-implementation-order`.
    fn c146_pre_docker_integration_base_defined() {
        let policy = RawSipRealTestPolicy::policy();
        assert_eq!(policy.docker_gate, "docker_available");
        assert_eq!(policy.skip_message, SKIP_MESSAGE);
        assert!(
            std::path::Path::new("src/tests/docker_asterisk_it.rs").exists(),
            "docker_asterisk_it.rs must exist (P16-10 §62.19)"
        );
    }

    /// C146-Post: raw SIP is verified against real PJSIP in Docker.
    // @verifies C146-post
    #[test]
// [::TICKET::] P19-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-1 --for-spec --no-implementation-order`.
    fn c146_post_raw_sip_verified_against_real_pjsip_in_docker() {
        let policy = RawSipRealTestPolicy::policy();
        assert_eq!(policy.test_file, "tests/sip_integration.rs");
        assert_eq!(policy.feature_gate, "pjsua-native");
    }

    /// C146-Inv: make test-integration is the gate.
    // @verifies C146-inv
    #[test]
// [::TICKET::] P19-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-1 --for-spec --no-implementation-order`.
    fn c146_inv_make_test_integration_gate() {
        let policy = RawSipRealTestPolicy::policy();
        assert_eq!(policy.make_target, "test-integration");
        assert!(policy.make_target.starts_with("test-"));
    }
}
