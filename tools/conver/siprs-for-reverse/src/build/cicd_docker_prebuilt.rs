
/// CI matrix OS targets as defined in RFC §44.
///
/// The CI pipeline runs on three operating systems, each with
/// four feature combinations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CiOsTarget {
    WindowsLatest,
    MacOs14,
    Ubuntu2204,
}

impl CiOsTarget {
    /// Returns all three CI OS targets as a slice.
    pub const fn all() -> &'static [Self] {
        &[Self::WindowsLatest, Self::MacOs14, Self::Ubuntu2204]
    }

    /// Returns the GitHub Actions runner label for this OS target.
    pub const fn runner_label(&self) -> &'static str {
        match self {
            Self::WindowsLatest => "windows-latest",
            Self::MacOs14 => "macos-14",
            Self::Ubuntu2204 => "ubuntu-22.04",
        }
    }
}

/// Feature combinations that the CI matrix tests for each OS.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeatureCombination {
    Default,
    Tls,
    Srtp,
    TlsSrtp,
}

impl FeatureCombination {
    /// Returns all four feature combinations as a slice.
    pub const fn all() -> &'static [Self] {
        &[Self::Default, Self::Tls, Self::Srtp, Self::TlsSrtp]
    }

    /// Returns the cargo `--features` argument for this combination.
    pub const fn cargo_features(&self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Tls => "tls",
            Self::Srtp => "srtp",
            Self::TlsSrtp => "tls,srtp",
        }
    }
}

/// Docker Integration Test Job configuration.
///
/// Defines the GitHub Actions service container for Asterisk 20.6.0
/// used by Layer 3 SIP integration tests (RFC §44).
#[derive(Debug, Clone)]
pub struct DockerIntegrationJob {
    /// Docker image name and tag.
    pub image: &'static str,
    /// Port mappings: (host, container, protocol).
    pub ports: &'static [(&'static str, u16, u16)],
}

impl DockerIntegrationJob {
    /// Returns the Asterisk 20.6.0 Docker job configuration.
    pub const fn asterisk_job() -> Self {
        Self {
            image: "asterisk:20.6.0",
            ports: &[("udp", 5060, 5060), ("tcp", 5061, 5061)],
        }
    }
}

/// Prebuilt Refresh Pipeline configuration for macOS.
///
/// Defines the build steps for refreshing macOS prebuilt PJSIP
/// binaries via GitHub Actions (RFC §44).
#[derive(Debug, Clone)]
pub struct PrebuiltRefreshPipeline {
    /// GitHub Actions runner for macOS builds.
    pub runner: &'static str,
}

impl PrebuiltRefreshPipeline {
    /// Returns the macOS prebuilt refresh pipeline configuration.
    pub const fn macos_pipeline() -> Self {
        Self { runner: "macos-14" }
    }
}

/// Total CI jobs = 3 OS targets × 4 feature combinations = 12.
pub const TOTAL_CI_JOBS: usize = 12;

#[cfg(test)]
mod tests {
    use super::*;

    // ── C055-Precondition: Build strategy feature combinations ──
    #[test]
    fn test_four_feature_combinations_exist() {
        let combos = FeatureCombination::all();
        assert_eq!(combos.len(), 4);
        let names: Vec<&str> = combos.iter().map(|c| c.cargo_features()).collect();
        assert!(names.contains(&"default"));
        assert!(names.contains(&"srtp"));
    }

    // ── C055-Postcondition: CI matrix covers all 3 OSes ──────────
    #[test]
    fn test_three_os_targets_exist() {
        let os_targets = CiOsTarget::all();
        assert_eq!(os_targets.len(), 3);
        let labels: Vec<&str> = os_targets.iter().map(|o| o.runner_label()).collect();
        assert!(labels.contains(&"windows-latest"));
        assert!(labels.contains(&"macos-14"));
        assert!(labels.contains(&"ubuntu-22.04"));
    }

    // ── C055-Invariant: 3 OSes × 4 combos = 12 jobs ─────────────
    #[test]
    fn test_total_ci_jobs_is_twelve() {
        let total = CiOsTarget::all().len() * FeatureCombination::all().len();
        assert_eq!(total, TOTAL_CI_JOBS);
    }

    // ── Docker job has correct Asterisk image ──────────────────
    #[test]
    fn test_docker_job_uses_asterisk_20_6_0() {
        let job = DockerIntegrationJob::asterisk_job();
        assert_eq!(job.image, "asterisk:20.6.0");
    }

    // ── Docker job exposes expected ports ───────────────────────
    #[test]
    fn test_docker_job_ports() {
        let job = DockerIntegrationJob::asterisk_job();
        let port_specs: Vec<(&str, u16, u16)> = job.ports.to_vec();
        assert!(port_specs.contains(&("udp", 5060, 5060)));
        assert!(port_specs.contains(&("tcp", 5061, 5061)));
        assert_eq!(port_specs.len(), 2);
    }

    // ── Prebuilt pipeline uses macos-14 ─────────────────────────
    #[test]
    fn test_prebuilt_pipeline_uses_macos_14() {
        let pipeline = PrebuiltRefreshPipeline::macos_pipeline();
        assert_eq!(pipeline.runner, "macos-14");
    }
}
