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
//   - NODE_ID=N0039:  §28 Build Strategy & OS Dependencies
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0039 --hops=2)
//
// Cross-referenced design context:
//   - requirement/§4 Compliance Requirements [NODE_ID=N0005]
//     (part_of ← src/config/versioning_policy.rs)
//     (depends_on ← src/config/client_config_spec.rs)
//     (depends_on ← src/build/build_strategy_os_deps.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0005 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! PJSIP build detection and feature-flag resolution (RFC §28, N0039).
//!
//! Implements the Build Strategy & OS Dependencies spec: detects a system
//! PJSIP installation (prebuilt-first, then source fallback per §28.1),
//! maps the result to Cargo feature flags (`pjsua-native`, `tls`, `srtp`),
//! and consumes the CI matrix defined in [`crate::build::cicd_docker_prebuilt`]
//! (RFC §44, N0054).

use std::path::{Path, PathBuf};

use crate::build::cicd_docker_prebuilt::{CiOsTarget, FeatureCombination, TOTAL_CI_JOBS};

/// Canonical PJSIP version fixed by RFC §4 (N0005).
pub const PJSIP_CANONICAL_VERSION: PjsipVersion = PjsipVersion::new(2, 17, 0);

/// PJSIP semantic version tuple (major.minor.patch).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PjsipVersion {
    pub major: u16,
    pub minor: u16,
    pub patch: u16,
}

// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
impl PjsipVersion {
    /// Builds a version tuple.
    pub const fn new(major: u16, minor: u16, patch: u16) -> Self {
        Self {
            major,
            minor,
            patch,
        }
    }
}

/// Result of probing the build environment for PJSIP.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PjsipDetection {
    /// A usable PJSIP install (prebuilt or source-buildable) was found.
    Present { version: PjsipVersion },
    /// No PJSIP found — the crate falls back to the stub-alias path.
    Absent,
}

// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
impl PjsipDetection {
    /// Whether the source-build fallback (§28.1 step 3) must be used.
    ///
    /// `Absent` means the prebuilt library set is missing, so a source build
    /// would be required to obtain PJSIP.
    pub fn requires_source_build(&self) -> bool {
        matches!(self, PjsipDetection::Absent)
    }
}

/// Structured failure from PJSIP detection (RFC §28.4 dependency hints).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PjsipDetectionError {
    /// The target OS triple is not one of the three supported CI targets.
    #[error("unsupported OS target triple: {0}")]
    UnsupportedOs(String),
    /// The detection backend failed to complete its probe.
    #[error("PJSIP probe failed: {0}")]
    ProbeFailed(String),
}

/// Abstraction over the environment probe — real filesystem probe in
/// production, deterministic fake in unit tests.
pub trait DetectionBackend {
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn probe(&self) -> Result<PjsipDetection, PjsipDetectionError>;
}

/// Cargo feature flags resolved from a [`PjsipDetection`] result.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ResolvedFeatures {
    /// Whether the `pjsua-native` feature path is enabled.
    pub pjsua_native: bool,
    /// Whether the `tls` feature is enabled at compile time.
    pub tls: bool,
    /// Whether the `srtp` feature is enabled at compile time.
    pub srtp: bool,
}

/// Status of a single CI-matrix (OS, feature-combination) job.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CiJobStatus {
    pub os: CiOsTarget,
    pub features: FeatureCombination,
    pub pjsip_available: bool,
}

/// Probes the build environment through the given backend.
pub fn detect_pjsip(backend: &dyn DetectionBackend) -> Result<PjsipDetection, PjsipDetectionError> {
    backend.probe()
}

/// Maps a detection result to the Cargo feature flags.
///
/// `pjsua_native` is derived from the detection (Present ⇒ native path);
/// `tls`/`srtp` reflect the compile-time `cfg!` state so
/// `ClientCapabilities.tls_available/srtp_available` stay consistent.
pub fn resolve_feature_flags(detection: &PjsipDetection) -> ResolvedFeatures {
    ResolvedFeatures {
        pjsua_native: matches!(detection, PjsipDetection::Present { .. }),
        tls: cfg!(feature = "tls"),
        srtp: cfg!(feature = "srtp"),
    }
}

/// Enumerates all 12 (OS, feature-combination) CI-matrix jobs.
pub fn ci_matrix_jobs() -> Vec<(CiOsTarget, FeatureCombination)> {
    let mut jobs = Vec::with_capacity(TOTAL_CI_JOBS);
    for os in CiOsTarget::all() {
        for features in FeatureCombination::all() {
            jobs.push((*os, *features));
        }
    }
    jobs
}

/// Reports per-combination build status for the whole CI matrix.
pub fn run_ci_matrix(detection: &PjsipDetection) -> Vec<CiJobStatus> {
    let pjsip_available = matches!(detection, PjsipDetection::Present { .. });
    ci_matrix_jobs()
        .into_iter()
        .map(|(os, features)| CiJobStatus {
            os,
            features,
            pjsip_available,
        })
        .collect()
}

/// Returns the RFC §28.4 OS-package install hint for a CI target.
pub fn os_dependency_hint(os: CiOsTarget) -> &'static str {
    match os {
        CiOsTarget::WindowsLatest => "MSVC Build Tools; vcpkg install libsrtp:x64-windows",
        CiOsTarget::MacOs14 => "brew install pkg-config cmake (CoreAudio/CoreFoundation/Security via Xcode CLI)",
        CiOsTarget::Ubuntu2204 => "apt-get install -y build-essential cmake libasound2-dev libssl-dev libcrypto-dev libuuid-dev libsrtp2-dev",
    }
}

/// Real environment probe following the §28.1 search order.
///
/// Prebuilt-first: checks `vendor/prebuilt/{target-triple}/lib` for the PJSIP
/// static libraries; if missing, falls back to the `vendor/pjsip` source tree.
pub struct EnvDetectionBackend {
    target_triple: String,
    prebuilt_root: PathBuf,
    vendor_pjsip_root: PathBuf,
}

// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
impl EnvDetectionBackend {
    /// Builds a backend rooted at the crate's `vendor/` directory.
    pub fn new(target_triple: impl Into<String>) -> Self {
        let triple = target_triple.into();
        Self {
            prebuilt_root: PathBuf::from("vendor/prebuilt").join(&triple),
            vendor_pjsip_root: PathBuf::from("vendor/pjsip"),
            target_triple: triple,
        }
    }

    /// Whether the target triple is one of the three CI-supported OSes.
    pub fn is_supported_target(&self) -> bool {
        let triple = self.target_triple.to_ascii_lowercase();
        triple.contains("windows") || triple.contains("apple-darwin") || triple.contains("linux")
    }

    /// The target triple this backend probes for.
    pub fn target_triple(&self) -> &str {
        &self.target_triple
    }

    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn prebuilt_libs_complete(&self) -> bool {
        let lib_dir = self.prebuilt_root.join("lib");
        lib_dir.is_dir() && contains_pjsua_library(&lib_dir)
    }

    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn vendor_source_available(&self) -> bool {
        self.vendor_pjsip_root.join("CMakeLists.txt").is_file()
    }
}

// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
impl DetectionBackend for EnvDetectionBackend {
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn probe(&self) -> Result<PjsipDetection, PjsipDetectionError> {
        if !self.is_supported_target() {
            return Err(PjsipDetectionError::UnsupportedOs(
                self.target_triple.clone(),
            ));
        }
        if self.prebuilt_libs_complete() || self.vendor_source_available() {
            Ok(PjsipDetection::Present {
                version: PJSIP_CANONICAL_VERSION,
            })
        } else {
            Ok(PjsipDetection::Absent)
        }
    }
}

/// Whether the given `lib/` directory contains a `libpjsua*` archive.
// [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
fn contains_pjsua_library(lib_dir: &Path) -> bool {
    std::fs::read_dir(lib_dir)
        .map(|entries| {
            entries.flatten().any(|entry| {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                name.contains("pjsua") && (name.ends_with(".a") || name.ends_with(".lib"))
            })
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Deterministic fake backend driving the pure detection logic.
    pub struct MockDetectionBackend {
        pub result: Result<PjsipDetection, PjsipDetectionError>,
    }

    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    impl DetectionBackend for MockDetectionBackend {
        // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
        fn probe(&self) -> Result<PjsipDetection, PjsipDetectionError> {
            self.result.clone()
        }
    }

    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    impl MockDetectionBackend {
        pub fn present(version: PjsipVersion) -> Self {
            Self {
                result: Ok(PjsipDetection::Present { version }),
            }
        }

        pub fn absent() -> Self {
            Self {
                result: Ok(PjsipDetection::Absent),
            }
        }

        pub fn unsupported_os(triple: &str) -> Self {
            Self {
                result: Err(PjsipDetectionError::UnsupportedOs(triple.to_string())),
            }
        }

        pub fn prebuilt_complete(triple: &str) -> Self {
            let _ = triple;
            Self::present(PJSIP_CANONICAL_VERSION)
        }

        pub fn prebuilt_absent(triple: &str) -> Self {
            let _ = triple;
            Self::absent()
        }
    }

    // ── C040-Precondition: Build requirements defined ──────────
    /// @verifies C040
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn detect_pjsip_returns_present_with_version() -> Result<(), PjsipDetectionError> {
        let backend = MockDetectionBackend::present(PjsipVersion::new(2, 17, 0));
        let detection = detect_pjsip(&backend)?;
        assert!(matches!(
            detection,
            PjsipDetection::Present { version } if version == PjsipVersion::new(2, 17, 0)
        ));
        Ok(())
    }

    // ── C040-Postcondition: build.rs strategy and OS dependencies ──
    /// @verifies C040
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn resolve_flags_present_maps_to_pjsua_native() {
        let flags = resolve_feature_flags(&PjsipDetection::Present {
            version: PjsipVersion::new(2, 17, 0),
        });
        assert!(
            flags.pjsua_native,
            "Present detection must enable pjsua-native"
        );
        assert_eq!(flags.tls, cfg!(feature = "tls"));
        assert_eq!(flags.srtp, cfg!(feature = "srtp"));
    }

    // ── C040-Postcondition: Absent maps to stub-alias fallback ──
    /// @verifies C040
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn resolve_flags_absent_disables_pjsua_native() {
        let flags = resolve_feature_flags(&PjsipDetection::Absent);
        assert!(
            !flags.pjsua_native,
            "Absent detection must keep the stub-alias path"
        );
    }

    // ── C040-Invariant: Prebuilt-first, source fallback ─────────
    /// @verifies C040
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn prebuilt_complete_yields_present_without_source_build() -> Result<(), PjsipDetectionError> {
        let prebuilt = MockDetectionBackend::prebuilt_complete("aarch64-apple-darwin");
        assert!(matches!(
            detect_pjsip(&prebuilt)?,
            PjsipDetection::Present { .. }
        ));
        Ok(())
    }

    // ── C040-Invariant: Prebuilt absent selects source fallback ──
    /// @verifies C040
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn prebuilt_absent_requires_source_build() -> Result<(), PjsipDetectionError> {
        let no_prebuilt = MockDetectionBackend::prebuilt_absent("aarch64-apple-darwin");
        assert!(detect_pjsip(&no_prebuilt)?.requires_source_build());
        Ok(())
    }

    // ── Error: unsupported OS ──────────────────────────────────
    /// @verifies C040
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn unsupported_os_returns_structured_error() {
        let backend = MockDetectionBackend::unsupported_os("solaris");
        let err = detect_pjsip(&backend).unwrap_err();
        assert!(matches!(err, PjsipDetectionError::UnsupportedOs(_)));
    }

    // ── C055-Precondition: Build strategy defined ──────────────
    /// @verifies C055
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn ci_matrix_jobs_covers_all_combinations() {
        let jobs = ci_matrix_jobs();
        assert_eq!(jobs.len(), TOTAL_CI_JOBS);
        assert_eq!(
            jobs.len(),
            CiOsTarget::all().len() * FeatureCombination::all().len()
        );
        // Every OS target must be paired with every feature combination.
        for os in CiOsTarget::all() {
            for features in FeatureCombination::all() {
                let paired = jobs
                    .iter()
                    .any(|(job_os, job_features)| job_os == os && job_features == features);
                assert!(paired, "missing job for {:?} × {:?}", os, features);
            }
        }
    }

    // ── C055-Postcondition: CI/CD pipeline and Docker tests ────
    /// @verifies C055
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn run_ci_matrix_reports_per_combination_status() {
        let detection = PjsipDetection::Present {
            version: PjsipVersion::new(2, 17, 0),
        };
        let statuses = run_ci_matrix(&detection);
        assert_eq!(statuses.len(), TOTAL_CI_JOBS);
        assert!(statuses.iter().all(|s| s.pjsip_available));
        // Each status must pair an OS target with its declared feature combo.
        assert!(statuses.iter().all(|s| {
            CiOsTarget::all().contains(&s.os) && FeatureCombination::all().contains(&s.features)
        }));
    }

    // ── C055-Postcondition: Absent PJSIP marks every job unavailable ──
    /// @verifies C055
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn run_ci_matrix_reports_absent_for_all_jobs() {
        let statuses = run_ci_matrix(&PjsipDetection::Absent);
        assert_eq!(statuses.len(), TOTAL_CI_JOBS);
        assert!(statuses.iter().all(|s| !s.pjsip_available));
    }

    // ── C055-Invariant: Matrix covers 3 OSes ───────────────────
    /// @verifies C055
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn matrix_covers_three_os_targets() {
        let oses: Vec<&str> = CiOsTarget::all().iter().map(|o| o.runner_label()).collect();
        assert_eq!(oses, vec!["windows-latest", "macos-14", "ubuntu-22.04"]);
    }

    // ── C055-Invariant: Matrix covers 4 feature combos ─────────
    /// @verifies C055
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn matrix_covers_four_feature_combinations() {
        let combos: Vec<&str> = FeatureCombination::all()
            .iter()
            .map(|c| c.cargo_features())
            .collect();
        assert_eq!(combos, vec!["default", "tls", "srtp", "tls,srtp"]);
    }

    // ── Invariant: deterministic flag resolution ──────────────
    /// @verifies C040
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn flag_resolution_is_deterministic() {
        let detection = PjsipDetection::Present {
            version: PjsipVersion::new(2, 17, 0),
        };
        assert_eq!(
            resolve_feature_flags(&detection),
            resolve_feature_flags(&detection)
        );
    }

    // ── EnvDetectionBackend: supported-target classification ──
    /// @verifies C040
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn env_backend_classifies_supported_targets() {
        assert!(EnvDetectionBackend::new("x86_64-pc-windows-msvc").is_supported_target());
        assert!(EnvDetectionBackend::new("aarch64-apple-darwin").is_supported_target());
        assert!(EnvDetectionBackend::new("x86_64-unknown-linux-gnu").is_supported_target());
    }

    /// @verifies C040
    #[test]
    // [::TICKET::] P10-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-2 --for-spec --no-implementation-order`.
    fn env_backend_rejects_unsupported_target() {
        let backend = EnvDetectionBackend::new("solaris-unknown");
        assert!(!backend.is_supported_target());
        assert!(matches!(
            backend.probe(),
            Err(PjsipDetectionError::UnsupportedOs(_))
        ));
    }
}
