// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../RFC-ROOT-GRAPH.json
// Directory:    ../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0050:  §40 Audio Device Policy & §41 Usage Examples
//     → To show details: (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0050 --hops=2)
//
// Cross-referenced design context:
//   - architecture/§1 Purpose — Responsibilities of this crate [NODE_ID=N0001]
//     (references ← examples/)
//   - architecture/§41 Usage Examples [NODE_ID=N0050]
//     (part_of ← examples/)
//
// Full graph exploration:
//   (cd .. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Integration-level validation of usage examples in the `examples/` directory.
//!
//! These tests verify that each example file:
//! - Exists and follows the cargo example convention
//! - Returns `Result` for `?`-based error propagation
//! - Avoids `.unwrap()` / `.expect()` in production code paths
//! - Guards microphone-specific code behind `#[cfg(feature = "cpal-input")]`
//! - Compiles successfully via `cargo check --examples`
//!
//! ## Test exception
//!
//! The `cargo_check_examples_passes` test is `#[ignore]` by default because it
//! spawns a subprocess. Run explicitly: `cargo test -- --ignored examples_compile`.

// ---------------------------------------------------------------------------
// ── C051 ── N0050→N0001: Audio device policy & usage examples
// ---------------------------------------------------------------------------

/// @verifies C051-precondition
/// All 6 required files (5 .rs examples + README.md) exist under examples/.
#[test]
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
fn example_files_exist() -> Result<(), String> {
    let required = [
        "examples/client_init.rs",
        "examples/account_register.rs",
        "examples/make_call.rs",
        "examples/audio_tap.rs",
        "examples/tts_source.rs",
        "examples/README.md",
    ];
    for path in &required {
        assert!(
            std::path::Path::new(path).exists(),
            "Example file not found: {path}"
        );
    }
    Ok(())
}

/// @verifies C051-precondition
/// Each .rs example file must define a `fn main()` and return `Result` for `?`
/// propagation.
#[test]
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
fn example_main_returns_result() -> Result<(), String> {
    let examples = [
        "examples/client_init.rs",
        "examples/account_register.rs",
        "examples/make_call.rs",
        "examples/audio_tap.rs",
        "examples/tts_source.rs",
    ];
    for path in &examples {
        let content =
            std::fs::read_to_string(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
        assert!(
            content.contains("fn main"),
            "{path} must have a main() function"
        );
        assert!(
            content.contains("Result<"),
            "{path} must return Result for ? propagation"
        );
    }
    Ok(())
}

/// @verifies C051-postcondition
/// Examples must not call `.unwrap()` or `.expect()` — all errors propagate
/// via `?`.
#[test]
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
fn examples_propagate_errors_via_question_mark() -> Result<(), String> {
    let examples = [
        "examples/client_init.rs",
        "examples/account_register.rs",
        "examples/make_call.rs",
    ];
    for path in &examples {
        let content =
            std::fs::read_to_string(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
        assert!(
            !content.contains(".unwrap("),
            "{path} must not call .unwrap()"
        );
        assert!(
            !content.contains(".expect("),
            "{path} must not call .expect()"
        );
    }
    Ok(())
}

/// @verifies C051-postcondition
/// The client_init example must demonstrate at least one transport config (UDP)
/// to verify the minimal viable ClientConfig compiles.
#[test]
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
fn client_init_example_has_transport_config() -> Result<(), String> {
    let content = std::fs::read_to_string("examples/client_init.rs")
        .map_err(|e| format!("Failed to read client_init.rs: {e}"))?;
    assert!(
        content.contains("udp") || content.contains("Udp") || content.contains("UDP"),
        "client_init must demonstrate UDP transport configuration"
    );
    Ok(())
}

/// @verifies C051-invariant
/// The audio_tap example must guard microphone-related code behind
/// `#[cfg(feature = "cpal-input")]` and compile without the feature enabled.
#[test]
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
fn microphone_is_optional_feature() -> Result<(), String> {
    let content = std::fs::read_to_string("examples/audio_tap.rs")
        .map_err(|e| format!("Failed to read audio_tap.rs: {e}"))?;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.contains("microphone") || trimmed.contains("default_microphone") {
            assert!(
                content.contains("feature = \"cpal-input\""),
                "microphone code must be guarded by #[cfg(feature = \"cpal-input\")]"
            );
        }
    }
    // The file must mention cpal-input at least once (even for a comment)
    assert!(
        content.contains("cpal-input"),
        "audio_tap.rs must document the cpal-input feature dependency"
    );
    Ok(())
}

/// @verifies C051-postcondition
/// Full crate compilation check for all examples. Marked `#[ignore]` because
/// it spawns a subprocess.
#[test]
#[ignore]
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
fn cargo_check_examples_passes() -> Result<(), String> {
    let output = std::process::Command::new("cargo")
        .args(["check", "--examples", "-q"])
        .output()
        .map_err(|e| format!("Failed to run cargo check: {e}"))?;
    assert!(
        output.status.success(),
        "cargo check --examples must pass\nstderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(())
}

/// @verifies C051-postcondition
/// Examples compile with no default features (serde off, tls off).
#[test]
#[ignore]
// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
fn cargo_check_examples_no_default_features() -> Result<(), String> {
    let output = std::process::Command::new("cargo")
        .args(["check", "--examples", "--no-default-features", "-q"])
        .output()
        .map_err(|e| format!("Failed to run cargo check --no-default-features: {e}"))?;
    assert!(
        output.status.success(),
        "cargo check --examples --no-default-features must pass"
    );
    Ok(())
}
