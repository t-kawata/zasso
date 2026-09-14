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
//   - NODE_ID=N0006:  §4.1 Versioning Policy
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0006 --hops=2)
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

/// The semver phase of the crate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SemverPhase {
    /// 0.x phase — breaking changes allowed with CHANGELOG notification.
    ZeroX,
    /// 1.0+ phase — strict semver.
    Stable,
}

/// The kind of change being classified by [`VersionPolicy`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    /// A breaking public API change.
    Breaking,
    /// A backward-compatible feature addition.
    Additive,
    /// A bugfix or refactor with no public API change.
    Fix,
}

/// The required version bump for a change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VersionBump {
    /// MAJOR — incompatible public API change.
    Major,
    /// MINOR — backward-compatible feature addition.
    Minor,
    /// PATCH — backward-compatible bugfix.
    Patch,
}

/// Errors from classifying a change under the versioning policy.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum VersionError {
    /// A breaking change requires a MAJOR bump in the stable phase.
    #[error("breaking change requires a MAJOR bump in the stable (1.0+) phase")]
    BreakingRequiresMajor,
}

/// The crate's semver versioning policy (RFC N0006 §4.1).
///
/// # 0.x phase
/// Breaking changes are allowed — there is no MAJOR requirement — but public
/// API changes (Breaking / Additive) must be recorded in the CHANGELOG.
///
/// # 1.0+ phase (strict semver)
/// - Breaking → requires a MAJOR bump (returns [`VersionError::BreakingRequiresMajor`])
/// - Additive → MINOR
/// - Fix → PATCH
/// - Security fix → always PATCH (the documented exception)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VersionPolicy {
    phase: SemverPhase,
}

// [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
impl VersionPolicy {
    /// Create a policy for the given semver phase.
    pub fn new(phase: SemverPhase) -> Self {
        Self { phase }
    }

    /// Return the phase this policy applies to.
    pub fn phase(&self) -> SemverPhase {
        self.phase
    }

    /// Classify a change into the required version bump.
    ///
    /// A security fix is always classified as PATCH regardless of phase. In
    /// the stable phase a non-security breaking change is rejected.
    pub fn classify_change(
        &self,
        change: ChangeKind,
        is_security_fix: bool,
    ) -> Result<VersionBump, VersionError> {
        if is_security_fix {
            return Ok(VersionBump::Patch);
        }
        // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
        match (self.phase, change) {
            (SemverPhase::ZeroX, ChangeKind::Breaking) => Ok(VersionBump::Minor),
            (SemverPhase::ZeroX, ChangeKind::Additive) => Ok(VersionBump::Minor),
            (SemverPhase::ZeroX, ChangeKind::Fix) => Ok(VersionBump::Patch),
            (SemverPhase::Stable, ChangeKind::Breaking) => Err(VersionError::BreakingRequiresMajor),
            (SemverPhase::Stable, ChangeKind::Additive) => Ok(VersionBump::Minor),
            (SemverPhase::Stable, ChangeKind::Fix) => Ok(VersionBump::Patch),
        }
    }

    /// Whether the change must be recorded in the CHANGELOG.
    ///
    /// Public API changes (Breaking or Additive) are always documented; a Fix
    /// is not.
    pub fn requires_changelog(&self, change: ChangeKind) -> bool {
        matches!(change, ChangeKind::Breaking | ChangeKind::Additive)
    }
}

#[cfg(test)]
mod tests {
    use super::{ChangeKind, SemverPhase, VersionBump, VersionError, VersionPolicy};

    /// @verifies TS-003
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn version_policy_zero_x_phase_allows_breaking_with_changelog() {
        let policy = VersionPolicy::new(SemverPhase::ZeroX);
        assert_eq!(policy.phase(), SemverPhase::ZeroX);
        assert!(policy.classify_change(ChangeKind::Breaking, false).is_ok());
        assert!(policy.requires_changelog(ChangeKind::Breaking));
    }

    /// @verifies TS-003
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn version_policy_stable_phase_strict_semver() -> Result<(), &'static str> {
        let policy = VersionPolicy::new(SemverPhase::Stable);
        let additive = policy
            .classify_change(ChangeKind::Additive, false)
            .map_err(|_| "additive change must classify under 1.0+")?;
        assert_eq!(additive, VersionBump::Minor);
        let fix = policy
            .classify_change(ChangeKind::Fix, false)
            .map_err(|_| "fix change must classify under 1.0+")?;
        assert_eq!(fix, VersionBump::Patch);
        assert!(matches!(
            policy.classify_change(ChangeKind::Breaking, false),
            Err(VersionError::BreakingRequiresMajor)
        ));
        // Security-fix exception: a breaking change shipped as PATCH.
        let security = policy
            .classify_change(ChangeKind::Breaking, true)
            .map_err(|_| "security fix must classify as PATCH")?;
        assert_eq!(security, VersionBump::Patch);
        Ok(())
    }

    /// @verifies TS-003
    #[test]
    // [::TICKET::] P8-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P8-4 --for-spec --no-implementation-order`.
    fn version_policy_changelog_requirement() {
        let policy = VersionPolicy::new(SemverPhase::ZeroX);
        assert!(policy.requires_changelog(ChangeKind::Breaking));
        assert!(policy.requires_changelog(ChangeKind::Additive));
        assert!(!policy.requires_changelog(ChangeKind::Fix));
    }
}
