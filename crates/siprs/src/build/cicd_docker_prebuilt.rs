// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0054:  §44 CI/CD & M20 Docker/Prebuilt Pipeline
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0054 --hops=2)
//
// Cross-referenced design context:
//   - build/§28 Build Strategy & OS Dependencies [NODE_ID=N0039]
//     (validates ← src/build/cicd_docker_prebuilt.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0039 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
// ============================================================================

//! # §44 CI/CD & M20 Docker/Prebuilt Pipeline
//!
//! This module documents the CI/CD pipeline configuration for the siprs crate.
//! Three GitHub Actions workflows are specified:
//!
//! 1. **CI matrix** (`ci.yml`) — builds and tests across 3 OSes × 4 feature
//!    combinations (12 configurations).
//! 2. **Docker Integration Test** (`integration.yml`) — runs Layer 3 SIP
//!    protocol tests against an Asterisk 20.6.0 container.
//! 3. **Prebuilt Refresh** (`prebuilt-refresh.yml`) — rebuilds PJSIP static
//!    libraries on macOS-14 and uploads artifacts (manual trigger).
//!
//! ## Source Build Fallback
//!
//! When prebuilt binaries are unavailable (e.g., a new OS version), `build.rs`
//! falls back to building PJSIP from source. The prebuilt refresh pipeline
//! automates the manual steps documented in `vendor/prebuilt/BUILD.md`.

// ---------------------------------------------------------------------------
// Helper: CI runner OS identifiers
// ---------------------------------------------------------------------------

/// Enumerates the 3 target operating systems for the CI matrix.
// [::TICKET::] P1-4: CI/CD pipeline spec defined.
//   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CiRunnerOs {
    /// `windows-latest` — Windows Server 2022 or newer.
    Windows,
    /// `macos-14` — Apple Silicon (M-series) macOS runner.
    MacOs,
    /// `ubuntu-22.04` — Linux x86_64 runner for Docker tests.
    Ubuntu,
}

// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
impl CiRunnerOs {
    /// Returns the GitHub Actions `runs-on` label for this OS.
    // [::TICKET::] P1-4: CI/CD pipeline spec defined.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
    pub fn runs_on(self) -> &'static str {
        match self {
            CiRunnerOs::Windows => "windows-latest",
            CiRunnerOs::MacOs => "macos-14",
            CiRunnerOs::Ubuntu => "ubuntu-22.04",
        }
    }
}

/// Feature set flags for the CI matrix.
// [::TICKET::] P1-4: CI/CD pipeline spec defined.
//   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeatureSet {
    /// `cargo build` (default features only).
    Default,
    /// `cargo build --features tls`
    Tls,
    /// `cargo build --features srtp`
    Srtp,
    /// `cargo build --features tls,srtp`
    TlsSrtp,
}

// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
impl FeatureSet {
    /// Returns the `--features` CLI argument for this feature set.
    // [::TICKET::] P1-4: CI/CD pipeline spec defined.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
    pub fn cargo_features_arg(self) -> &'static str {
        match self {
            FeatureSet::Default => "",
            FeatureSet::Tls => "--features tls",
            FeatureSet::Srtp => "--features srtp",
            FeatureSet::TlsSrtp => "--features tls,srtp",
        }
    }
}

/// Total CI matrix configurations: 3 OS × 4 feature sets = 12.
// [::TICKET::] P1-4: CI/CD pipeline spec defined.
//   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
pub const TOTAL_CI_CONFIGURATIONS: usize = 12;

// ---------------------------------------------------------------------------
// Docker integration test configuration
// ---------------------------------------------------------------------------

/// Configuration for the Docker Asterisk integration test job.
// [::TICKET::] P1-4: CI/CD pipeline spec defined.
//   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
pub mod docker {
    /// Asterisk Docker image tag used for Layer 3 integration tests.
    pub const ASTERISK_IMAGE: &str = "asterisk:20.6.0";

    /// SIP UDP port exposed by the Asterisk container.
    pub const SIP_UDP_PORT: u16 = 5060;

    /// SIP TCP/TLS port exposed by the Asterisk container.
    pub const SIP_TLS_PORT: u16 = 5061;

    /// Environment variable for the SIP server hostname.
    pub const ENV_SIP_SERVER: &str = "SIP_SERVER";

    /// Default SIP server hostname (Docker service name).
    pub const DEFAULT_SIP_SERVER: &str = "localhost";

    /// Environment variable for the SIP server port.
    pub const ENV_SIP_PORT: &str = "SIP_PORT";
}

// ---------------------------------------------------------------------------
// Prebuilt refresh configuration
// ---------------------------------------------------------------------------

/// Configuration for the macOS prebuilt PJSIP refresh pipeline.
// [::TICKET::] P1-4: CI/CD pipeline spec defined.
//   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
pub mod prebuilt {
    /// CMake build configuration flags for PJSIP on macOS.
    ///
    /// - `-DSRTP_WITH_OPENSSL=OFF` — use Apple Security Framework, not OpenSSL.
    /// - `-DPJMEDIA_WITH_VIDEO=OFF` — audio-only build.
    /// - `-G "Unix Makefiles"` — explicit generator.
    pub const CMAKE_FLAGS: &[&str] = &[
        "-DCMAKE_BUILD_TYPE=Release",
        "-DSRTP_WITH_OPENSSL=OFF",
        "-DPJMEDIA_WITH_VIDEO=OFF",
        "-G",
        "Unix Makefiles",
    ];

    /// Path (relative to crate root) where prebuilt artifacts are uploaded.
    pub const PREBUILT_OUTPUT_PATH: &str = "vendor/prebuilt/macos/";

    /// URL for the vendor BUILD.md with manual rebuild instructions.
    pub const BUILD_DOC_PATH: &str = "vendor/prebuilt/BUILD.md";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C055-invariant
    // [::TICKET::] P1-4: CI/CD pipeline spec tests.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    fn ci_matrix_has_exactly_three_oses() {
        let oses = [CiRunnerOs::Windows, CiRunnerOs::MacOs, CiRunnerOs::Ubuntu];
        // Each OS maps to a distinct runner label
        let labels: std::collections::HashSet<&str> =
            oses.iter().map(|os| os.runs_on()).collect();
        assert_eq!(labels.len(), 3, "must have exactly 3 distinct OS runners");
        assert!(labels.contains("windows-latest"));
        assert!(labels.contains("macos-14"));
        assert!(labels.contains("ubuntu-22.04"));
    }

    #[test]
    // @verifies C055-invariant
    // [::TICKET::] P1-4: CI/CD pipeline spec tests.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    fn ci_matrix_has_four_feature_sets() {
        let sets = [
            FeatureSet::Default,
            FeatureSet::Tls,
            FeatureSet::Srtp,
            FeatureSet::TlsSrtp,
        ];
        assert_eq!(sets.len(), 4, "must have exactly 4 feature combinations");
    }

    #[test]
    // @verifies C055-invariant
    // [::TICKET::] P1-4: CI/CD pipeline spec tests.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    fn total_ci_configurations_is_12() {
        assert_eq!(TOTAL_CI_CONFIGURATIONS, 3 * 4);
        assert_eq!(TOTAL_CI_CONFIGURATIONS, 12);
    }

    #[test]
    // @verifies C055-postcondition
    // [::TICKET::] P1-4: CI/CD pipeline spec tests.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    fn docker_config_has_defaults() {
        assert_eq!(docker::SIP_UDP_PORT, 5060);
        assert_eq!(docker::SIP_TLS_PORT, 5061);
        assert_eq!(docker::DEFAULT_SIP_SERVER, "localhost");
        assert!(docker::ASTERISK_IMAGE.contains("asterisk"));
    }

    #[test]
    // @verifies C055-postcondition
    // [::TICKET::] P1-4: CI/CD pipeline spec tests.
    //   Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
    fn prebuilt_config_has_build_doc_path() {
        assert!(prebuilt::BUILD_DOC_PATH.contains("BUILD.md"));
        assert!(prebuilt::CMAKE_FLAGS.len() >= 4);
    }
}
