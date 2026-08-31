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
//   - NODE_ID=N0106:  Prebuilt CI and commit
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0106 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! N0106 — prebuilt CI commit design model (§62.37).
//!
//! The actual workflow lives at the repo root `.github/workflows/prebuilt.yml`.
//! This module encodes the workflow shape as named constants and validates that
//! the committed file matches the §62.37 requirements, so `make test` covers
//! the CI design without running GitHub Actions.
//!
//! [::TICKET::] P18-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-2 --for-spec --no-implementation-order`

/// The three GitHub Actions runner OSes in the §62.37 matrix.
pub const PREBUILT_MATRIX_OS: [&str; 3] = ["macos-latest", "ubuntu-latest", "windows-latest"];

/// The repo-root-relative producer manifest path used with `--manifest-path`.
pub const PREBUILT_MANIFEST_PATH: &str = "crates/pjsip-prebuilt/Cargo.toml";

/// The action that commits `vendor/prebuilt` directly (no PR ceremony).
pub const PREBUILT_COMMIT_ACTION: &str = "stefanzweifel/git-auto-commit-action@v5";

/// Required substrings the committed workflow must contain (§62.37).
const PREBUILT_WORKFLOW_REQUIREMENTS: [&str; 9] = [
    "branches: [master, siprs]",
    "crates/siprs/vendor/pjsip/**",
    "crates/pjsip-prebuilt/**",
    "macos-latest",
    "ubuntu-latest",
    "windows-latest",
    "-- build-all",
    "-- verify-all",
    PREBUILT_COMMIT_ACTION,
];

/// Validates the repo-root `.github/workflows/prebuilt.yml` against §62.37.
///
/// Returns the first missing requirement as an error so a stale workflow fails
/// the test suite loudly instead of silently drifting from the design.
pub fn validate_prebuilt_workflow(repo_root: &std::path::Path) -> Result<(), String> {
    let workflow_path = repo_root.join(".github/workflows/prebuilt.yml");
    let yaml = std::fs::read_to_string(&workflow_path)
        .map_err(|e| format!("cannot read {}: {e}", workflow_path.display()))?;
    for requirement in PREBUILT_WORKFLOW_REQUIREMENTS {
        if !yaml.contains(requirement) {
            return Err(format!(
                "prebuilt.yml missing required element: {requirement}"
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

// [::TICKET::] P18-2, P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P18-2|P19-4) --for-spec --no-implementation-order`.
    fn repo_root() -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
    }

    #[test]
// [::TICKET::] P18-2, P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P18-2|P19-4) --for-spec --no-implementation-order`.
    fn workflow_constants_match_design() {
        // C144 Precondition/Postcondition: matrix OS, manifest path, commit action.
        assert_eq!(
            PREBUILT_MATRIX_OS,
            ["macos-latest", "ubuntu-latest", "windows-latest"]
        );
        assert_eq!(PREBUILT_MANIFEST_PATH, "crates/pjsip-prebuilt/Cargo.toml");
        assert_eq!(
            PREBUILT_COMMIT_ACTION,
            "stefanzweifel/git-auto-commit-action@v5"
        );
    }

    #[test]
// [::TICKET::] P18-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-2 --for-spec --no-implementation-order`.
    fn committed_workflow_satisfies_s62_37() -> Result<(), String> {
        // @verifies C144
        // C144 Postcondition: the committed prebuilt.yml drives build-all +
        // verify-all on 3 OS and commits vendor/prebuilt directly.
        validate_prebuilt_workflow(&repo_root())?;
        Ok(())
    }
}
