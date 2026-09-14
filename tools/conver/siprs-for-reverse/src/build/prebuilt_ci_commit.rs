
//! N0106 — prebuilt CI commit design model (§62.37).
//!
//! The actual workflow lives at the repo root `.github/workflows/prebuilt.yml`.
//! This module encodes the workflow shape as named constants and validates that
//! the committed file matches the §62.37 requirements, so `make test` covers
//! the CI design without running GitHub Actions.
//!

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

    fn repo_root() -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
    }

    #[test]
    fn workflow_constants_match_design() {
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
    fn committed_workflow_satisfies_s62_37() -> Result<(), String> {
        // verify-all on 3 OS and commits vendor/prebuilt directly.
        validate_prebuilt_workflow(&repo_root())?;
        Ok(())
    }
}
