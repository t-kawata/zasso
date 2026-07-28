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

// ============================================================================
// PHASE RED — Tests (written before implementation)
// ============================================================================

/// Development phase — 0.x (flexible semver) vs 1.0+ (strict semver).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VersionPhase {
    /// 0.x development phase: breaking changes allowed with CHANGELOG notification.
    Dev,
    /// 1.0+ stable phase: strict semver compliance (MAJOR/MINOR/PATCH).
    Stable,
}

/// API change classification per semver spec.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    /// Breaking API change — struct field removal, enum variant removal/rename,
    /// trait method signature change.
    Major,
    /// Backward-compatible addition — enum variant addition, struct field
    /// addition, new trait.
    Minor,
    /// Bug fix, refactoring, internal optimization. No public API changes.
    Patch,
}

/// Error returned for invalid change descriptions or version strings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionError(pub String);

/// Versioning policy — determines phase behavior from the crate's semver
/// version string, following RFC-ROOT §4.1.
///
/// - 0.x (Dev): breaking changes allowed; CHANGELOG required.
/// - 1.0+ (Stable): strict semver; semver-checks mandatory in CI (P2-2).
#[derive(Debug, Clone)]
pub struct VersionPolicy {
    phase: VersionPhase,
}

// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
impl VersionPolicy {
    /// Create a new policy from a semver version string.
    pub fn new(version: &str) -> Result<Self, VersionError> {
        let phase = version_phase_from_semver(version)?;
        Ok(Self { phase })
    }

    /// Return the current development phase.
    pub fn phase(&self) -> VersionPhase {
        self.phase
    }

    /// Returns `true` if breaking changes are allowed in the current phase.
    ///
    /// - Dev (0.x): always allowed.
    /// - Stable (1.0+): denied — must bump MAJOR.
    pub fn is_breaking_change_allowed(&self) -> bool {
        self.phase == VersionPhase::Dev
    }

    /// Returns `true` if a CHANGELOG entry is required for the given change.
    ///
    /// - Dev: required for all changes except PATCH.
    /// - Stable: required for MAJOR and MINOR changes.
    pub fn is_changelog_required(&self, change: &ChangeKind) -> bool {
        match self.phase {
            VersionPhase::Dev => *change != ChangeKind::Patch,
            VersionPhase::Stable => {
                *change == ChangeKind::Major || *change == ChangeKind::Minor
            }
        }
    }

    /// Returns `true` if CI semver-checks are required for this phase.
    ///
    /// Only Stable (1.0+) requires automated semver validation in CI.
    /// This check gates the P2-2 semver-checks integration.
    pub fn requires_semver_checks(&self) -> bool {
        self.phase == VersionPhase::Stable
    }
}

/// Classify a human-readable change description into a `ChangeKind`.
///
/// Keyword-based classification with special overrides:
/// - Security fixes ("security:" prefix) are always PATCH, bypassing MAJOR delay.
/// - Runtime behavior changes (timeout, retry) are always PATCH.
pub fn classify_change(description: &str) -> Result<ChangeKind, VersionError> {
    let trimmed = description.trim();
    if trimmed.is_empty() {
        return Err(VersionError(
            "change description must not be empty".to_string(),
        ));
    }
    let lower = trimmed.to_lowercase();

    // Security fixes bypass MAJOR delay — always PATCH.
    if lower.starts_with("security:") || lower.starts_with("security fix") {
        return Ok(ChangeKind::Patch);
    }

    // Runtime behavior changes (non-API surface) are always PATCH.
    let runtime_patterns = ["timeout", "retry"];
    if runtime_patterns.iter().any(|p| lower.contains(p)) {
        return Ok(ChangeKind::Patch);
    }

    // MAJOR: keywords indicating breaking API changes.
    let major_keywords = ["remove", "delete", "rename", "break", "signature"];
    if major_keywords.iter().any(|k| lower.contains(k)) {
        return Ok(ChangeKind::Major);
    }

    // MINOR: keywords indicating backward-compatible additions.
    let minor_keywords = ["add", "new", "introduce", "extend"];
    if minor_keywords.iter().any(|k| lower.contains(k)) {
        return Ok(ChangeKind::Minor);
    }

    // Default to PATCH for bug fixes, refactoring, and unclear descriptions.
    Ok(ChangeKind::Patch)
}

/// Parse a semver version string and determine the development phase.
///
/// Only the MAJOR version component determines the phase:
/// - MAJOR == 0 → Dev (0.x development phase)
/// - MAJOR >= 1 → Stable (1.0+ stable phase)
///
/// Pre-release suffixes (e.g., "-alpha.1") and build metadata ("+build.123")
/// are stripped before validation. All MAJOR.MINOR.PATCH segments must be
/// non-negative integers.
pub fn version_phase_from_semver(version: &str) -> Result<VersionPhase, VersionError> {
    if version.is_empty() {
        return Err(VersionError(
            "version string must not be empty".to_string(),
        ));
    }
    // Strip pre-release and build metadata (everything after '-' or '+').
    let base = version.split(['-', '+']).next().unwrap_or(version);
    // Validate that all three MAJOR.MINOR.PATCH segments are numeric.
    let segments: Vec<&str> = base.split('.').collect();
    if segments.len() < 2 || segments.len() > 3 {
        return Err(VersionError(format!(
            "expected 2-3 dot-separated segments, got {}: {version}",
            segments.len()
        )));
    }
    // Extract MAJOR from the first segment.
    let major_str = segments[0];
    let major: u32 = major_str.parse().map_err(|_| {
        VersionError(format!("invalid numeric segment: {major_str}"))
    })?;
    // Validate the remaining segments are also numeric.
    for &seg in &segments[1..] {
        seg.parse::<u32>().map_err(|_| {
            VersionError(format!("invalid numeric segment: {seg}"))
        })?;
    }
    if major == 0 {
        Ok(VersionPhase::Dev)
    } else {
        Ok(VersionPhase::Stable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // C007: N0006→N0005 — Versioning policy derived from compliance baseline
    // -----------------------------------------------------------------------

    #[test]
    // @verifies C007-precondition
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn c007_precondition_compliance_baseline_referenced() {
        let content = std::fs::read_to_string("src/config/versioning_policy.rs")
            .expect("versioning_policy.rs must exist");
        assert!(
            content.contains("N0005"),
            "header must reference N0005 compliance baseline"
        );
    }

    #[test]
    // @verifies C007-postcondition
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn c007_postcondition_version_phase_dev_allows_breaking() {
        let policy = VersionPolicy::new("0.1.0").expect("valid semver");
        assert_eq!(policy.phase(), VersionPhase::Dev);
        assert!(
            policy.is_breaking_change_allowed(),
            "Dev phase must allow breaking changes"
        );
    }

    #[test]
    // @verifies C007-postcondition
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn c007_postcondition_version_phase_stable_rejects_breaking() {
        let policy = VersionPolicy::new("1.0.0").expect("valid semver");
        assert_eq!(policy.phase(), VersionPhase::Stable);
        assert!(
            !policy.is_breaking_change_allowed(),
            "Stable phase must reject MAJOR changes"
        );
    }

    #[test]
    // @verifies C007-invariant
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn c007_invariant_security_fix_is_always_patch() {
        let result = classify_change("Security: fix buffer overflow in RTP parsing")
            .expect("valid description");
        assert_eq!(
            result,
            ChangeKind::Patch,
            "security fix must be PATCH (bypasses MAJOR delay)"
        );
    }

    #[test]
    // @verifies C007-invariant
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn c007_invariant_runtime_behavior_change_is_patch() {
        let result = classify_change("Adjust default command timeout from 10s to 15s")
            .expect("valid description");
        assert_eq!(
            result,
            ChangeKind::Patch,
            "runtime behavior change must be PATCH even in Stable"
        );
    }

    // -----------------------------------------------------------------------
    // C067: N0066→N0006 (inbound) — Semver operations use versioning policy
    // -----------------------------------------------------------------------

    #[test]
    // @verifies C067-precondition
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn c067_precondition_policy_struct_exists() {
        let dev = VersionPolicy::new("0.1.0").expect("parse 0.1.0");
        assert_eq!(dev.phase(), VersionPhase::Dev);

        let stable = VersionPolicy::new("2.0.0").expect("parse 2.0.0");
        assert_eq!(stable.phase(), VersionPhase::Stable);

        let result = classify_change("Add new API endpoint");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ChangeKind::Minor);
    }

    #[test]
    // @verifies C067-invariant
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn c067_invariant_dev_phase_does_not_require_semver_checks() {
        let dev = VersionPolicy::new("0.1.0").expect("valid");
        assert!(
            !dev.requires_semver_checks(),
            "0.x must NOT require semver-checks"
        );

        let dev_high = VersionPolicy::new("0.999.999").expect("valid");
        assert!(
            !dev_high.requires_semver_checks(),
            "0.999.999 still Dev, no semver-checks"
        );
    }

    #[test]
    // @verifies C067-invariant
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn c067_invariant_stable_phase_requires_semver_checks() {
        let stable = VersionPolicy::new("1.0.0").expect("valid");
        assert!(
            stable.requires_semver_checks(),
            "1.0+ MUST require semver-checks"
        );
    }

    // -----------------------------------------------------------------------
    // Normal cases — VersionPhase construction from version strings
    // -----------------------------------------------------------------------

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn version_policy_new_creates_dev_for_0_x() {
        let policy = VersionPolicy::new("0.1.0").expect("valid semver");
        assert_eq!(policy.phase(), VersionPhase::Dev);
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn version_policy_new_creates_dev_for_0_99_x() {
        let policy = VersionPolicy::new("0.99.0").expect("valid semver");
        assert_eq!(policy.phase(), VersionPhase::Dev);
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn version_policy_new_creates_stable_for_1_0_0() {
        let policy = VersionPolicy::new("1.0.0").expect("valid semver");
        assert_eq!(policy.phase(), VersionPhase::Stable);
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn version_policy_new_creates_stable_for_release_version() {
        let policy = VersionPolicy::new("2.5.3").expect("valid semver");
        assert_eq!(policy.phase(), VersionPhase::Stable);
    }

    // -----------------------------------------------------------------------
    // Normal cases — classify_change classification
    // -----------------------------------------------------------------------

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn classify_change_identifies_major_for_removal() {
        let result =
            classify_change("Remove deprecated struct field").expect("valid description");
        assert_eq!(result, ChangeKind::Major);
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn classify_change_identifies_major_for_rename() {
        let result =
            classify_change("Rename SipError variant for clarity").expect("valid description");
        assert_eq!(result, ChangeKind::Major);
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn classify_change_identifies_major_for_signature_change() {
        let result = classify_change("Change trait method signature for callbacks")
            .expect("valid description");
        assert_eq!(result, ChangeKind::Major);
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn classify_change_identifies_minor_for_addition() {
        let result = classify_change("Add new enum variant for DtmfSent")
            .expect("valid description");
        assert_eq!(result, ChangeKind::Minor);
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn classify_change_identifies_minor_for_struct_field() {
        let result =
            classify_change("Introduce new field in EventMeta").expect("valid description");
        assert_eq!(result, ChangeKind::Minor);
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn classify_change_identifies_patch_for_bug_fix() {
        let result =
            classify_change("Fix buffer overflow in audio pipeline").expect("valid description");
        assert_eq!(result, ChangeKind::Patch);
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn classify_change_identifies_patch_for_refactoring() {
        let result =
            classify_change("Refactor internal error conversion logic")
                .expect("valid description");
        assert_eq!(result, ChangeKind::Patch);
    }

    // -----------------------------------------------------------------------
    // Normal cases — CHANGELOG notification requirement
    // -----------------------------------------------------------------------

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn is_changelog_required_true_for_major_in_stable() {
        let policy = VersionPolicy::new("1.0.0").expect("valid");
        assert!(policy.is_changelog_required(&ChangeKind::Major));
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn is_changelog_required_true_for_minor_in_stable() {
        let policy = VersionPolicy::new("1.0.0").expect("valid");
        assert!(policy.is_changelog_required(&ChangeKind::Minor));
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn is_changelog_required_false_for_patch_in_stable() {
        let policy = VersionPolicy::new("1.0.0").expect("valid");
        assert!(!policy.is_changelog_required(&ChangeKind::Patch));
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn is_changelog_required_true_for_major_in_dev() {
        let policy = VersionPolicy::new("0.1.0").expect("valid");
        assert!(policy.is_changelog_required(&ChangeKind::Major));
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn is_changelog_required_false_for_patch_in_dev() {
        let policy = VersionPolicy::new("0.1.0").expect("valid");
        assert!(!policy.is_changelog_required(&ChangeKind::Patch));
    }

    // -----------------------------------------------------------------------
    // Error cases
    // -----------------------------------------------------------------------

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn classify_change_returns_err_for_empty_description() {
        let result = classify_change("");
        assert!(result.is_err(), "empty description must produce Err");
        assert!(
            result.unwrap_err().0.contains("empty"),
            "error message must mention empty"
        );
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn version_phase_from_semver_rejects_invalid_segments() {
        let result = version_phase_from_semver("0.1.alpha");
        assert!(
            result.is_err(),
            "non-numeric version segment must produce Err"
        );
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn version_phase_from_semver_rejects_empty_string() {
        let result = version_phase_from_semver("");
        assert!(result.is_err(), "empty version string must produce Err");
    }

    // -----------------------------------------------------------------------
    // Boundary cases
    // -----------------------------------------------------------------------

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn version_0_999_999_is_still_dev() {
        let policy = VersionPolicy::new("0.999.999").expect("valid semver");
        assert_eq!(policy.phase(), VersionPhase::Dev);
        assert!(
            policy.is_breaking_change_allowed(),
            "0.999.999 must still allow breaking changes"
        );
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn version_1_0_0_exact_transition_point() {
        let policy = VersionPolicy::new("1.0.0").expect("valid semver");
        assert_eq!(policy.phase(), VersionPhase::Stable);
        assert!(!policy.is_breaking_change_allowed());
    }

    #[test]
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn version_parses_pre_release_and_build_metadata() {
        let policy =
            VersionPolicy::new("0.1.0-alpha.1+build.123").expect("pre-release version");
        assert_eq!(policy.phase(), VersionPhase::Dev);
    }

    // -----------------------------------------------------------------------
    // Integration-level verification (spec validation)
    // -----------------------------------------------------------------------

    #[test]
    // @verifies C067-postcondition
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn c067_postcondition_spec_references_p2_2_for_semver_checks() {
        let spec = std::fs::read_to_string("specs/P0-2.md").expect("spec must exist");
        assert!(
            spec.contains("P2-2"),
            "spec must reference P2-2 for semver-checks integration"
        );
        assert!(
            spec.contains("semver-checks") || spec.contains("cargo semver-checks"),
            "spec must mention semver-checks integration"
        );
    }
}
