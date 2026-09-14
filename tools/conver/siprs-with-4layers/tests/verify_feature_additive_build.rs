// [::TICKET::] P13-2, P15-7: feature-additive build-graph invariant.
//
// The RFC §40 microphone source is gated behind the optional `cpal-input`
// feature (Contract C051-Pre). P15-7 (§62.6) promotes `cpal-input` to a
// DEFAULT feature so the microphone source connects in the default build.
// This integration test enforces the invariant at the RESOLVED GRAPH level:
//
//   (1) `cpal` stays an optional dependency wired only through `cpal-input`;
//   (2) the DEFAULT build graph includes `cpal` (because cpal-input is default).
//
// The file is deliberately NOT gated by `#![cfg(feature = "cpal-input")]`
// (unlike tests/verify_spec_p8_7.rs) so it compiles and runs in the DEFAULT
// build — exactly the state whose graph must include cpal.
//
// Run:
//   make test                          — both tests run in the default build
//   cargo test --no-default-features    — still validates the manifest wiring
//
// See specs/P15-7.md §Contracts C051/C087 for the contract mapping.

use std::path::Path;
use std::process::Command;

/// C051-Pre (O-001) — static half: Cargo.toml keeps cpal optional behind cpal-input.
///
/// Removing `optional = true` from the cpal declaration, or rewiring the
/// `cpal-input` feature away from `["dep:cpal"]`, fails this test — the
/// feature-additive invariant is broken at the manifest level.
#[test]
// [::TICKET::] P13-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-2 --for-spec --no-implementation-order`.
fn cargo_toml_keeps_cpal_optional_behind_cpal_input() -> Result<(), String> {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    let text = std::fs::read_to_string(&manifest).map_err(|e| format!("read Cargo.toml: {e}"))?;

    assert!(
        text.contains("cpal = { version = \"0.18\", optional = true }"),
        "cpal must stay an optional dependency (Cargo.toml [dependencies])"
    );
    assert!(
        text.contains("cpal-input = [\"dep:cpal\"]"),
        "cpal-input feature must pull dep:cpal (Cargo.toml [features])"
    );
    Ok(())
}

/// C051-Pre (O-001) — dynamic half: the resolved default graph includes cpal
/// because `cpal-input` is a default feature (§62.6).
///
/// Runs `cargo tree -e normal --offline --locked` against the crate manifest
/// and inspects the resolved package nodes. `--locked` prevents Cargo.lock
/// churn; `--offline` works because `make test` has already resolved the
/// default graph, populating the registry cache.
#[test]
// [::TICKET::] P13-2, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P13-2|P15-7) --for-spec --no-implementation-order`.
fn default_build_graph_includes_cpal_via_default_cpal_input() -> Result<(), String> {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");

    let default_tree = run_cargo_tree(&manifest, &[])?;
    assert!(
        contains_cpal(&default_tree),
        "default build graph must resolve the cpal crate (cpal-input is a default feature, §62.6); cargo tree output:\n{default_tree}"
    );
    Ok(())
}

/// Runs `cargo tree -e normal --offline --locked <extra>` against the manifest.
// [::TICKET::] P13-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-2 --for-spec --no-implementation-order`.
fn run_cargo_tree(manifest: &Path, extra: &[&str]) -> Result<String, String> {
    let output = Command::new("cargo")
        .arg("tree")
        .arg("-e")
        .arg("normal")
        .args(["--offline", "--locked"])
        .arg("--manifest-path")
        .arg(manifest)
        .args(extra)
        .output()
        .map_err(|e| format!("failed to spawn cargo tree: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "cargo tree failed: {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    String::from_utf8(output.stdout).map_err(|e| format!("cargo tree output not UTF-8: {e}"))
}

/// Whether any resolved package node in the tree output is named `cpal`.
///
/// `cargo tree` prints each package as `├── <name> v<version>` (or `└──` / `│`
/// prefix variants), so the package name is the second whitespace token, not the
/// first (which is the tree-drawing prefix). The exact-token match prevents
/// false positives from package paths that merely contain "cpal".
// [::TICKET::] P13-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P13-2 --for-spec --no-implementation-order`.
fn contains_cpal(tree_output: &str) -> bool {
    tree_output
        .lines()
        .any(|line| line.split_whitespace().any(|token| token == "cpal"))
}
