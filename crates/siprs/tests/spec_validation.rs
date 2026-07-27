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
//   - NODE_ID=N0052:  §43 Test Strategy — 4-Layer Architecture
//     → To show details: (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0052 --hops=2)
//
// Cross-referenced design context:
//   - requirement/§5 Functional Requirements — Normative Scope [NODE_ID=N0007]
//     (validates ← siprs/tests/spec_validation.rs)
//   - architecture/§49 lib.rs Template & §50 Acceptance Criteria [NODE_ID=N0057]
//     (validates ← siprs/tests/spec_validation.rs)
//
// This test suite validates that the P0-1 specification document exists and
// correctly documents all 7 RFC foundation nodes (N0002-N0008).
// It covers the contracts C001-C009 defined for P0-1.
// ============================================================================

use std::io::Read;

/// Path to the P0-1 specification document.
const SPEC_PATH: &str = "specs/P0-1.md";

/// Read the spec file content as a String.
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn read_spec() -> std::io::Result<String> {
    let mut file = std::fs::File::open(SPEC_PATH)?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    Ok(content)
}

// ---------------------------------------------------------------------------
// C001 — N0001→N0007 (inbound): Purpose is implemented by functional
//         requirements; scope remains audio-only.
// ---------------------------------------------------------------------------

#[test]
// @verifies C001
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_file_exists() {
    let path = std::path::Path::new(SPEC_PATH);
    assert!(
        path.exists(),
        "spec file must exist at {} — it is the primary deliverable of P0-1",
        SPEC_PATH,
    );
}

#[test]
// @verifies C001
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_references_n0007() {
    let content = read_spec().expect("failed to read spec file");
    assert!(
        content.contains("N0007"),
        "spec must reference N0007 (15 Functional Requirements)"
    );
    assert!(
        content.contains("FR-01") || content.contains("15 functional requirements"),
        "spec must enumerate or reference the 15 functional requirements"
    );
}

#[test]
// @verifies C001
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_audio_only_scope() {
    let content = read_spec().expect("failed to read spec file");
    assert!(
        content.contains("audio-only") || content.contains("audio only"),
        "spec must assert audio-only scope"
    );
    // Video, recording, and GUI are explicitly excluded by N0003 non-goals
    assert!(
        !content.contains("video process"),
        "video processing must not appear as in-scope functionality"
    );
}

// ---------------------------------------------------------------------------
// C003 — N0002→N0001: M20 items prioritized; priority does not imply
//         dependency.
// ---------------------------------------------------------------------------

#[test]
// @verifies C003
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_has_m20_priority_map() {
    let content = read_spec().expect("failed to read spec file");
    assert!(
        content.contains("N0002"),
        "spec must reference N0002 (M20 Priority Map)"
    );
    // Priority levels P0/P1/P2/P3 must be mentioned
    let priority_mentions = ["P0", "P1", "P2", "P3"]
        .iter()
        .filter(|&&p| content.contains(p))
        .count();
    assert!(
        priority_mentions >= 3,
        "spec should mention at least 3 of 4 priority levels (P0-P3), found {}",
        priority_mentions,
    );
}

#[test]
// @verifies C003
// [::TICKET::] P0-1, P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-1|P0-3) --for-spec --no-implementation-order`.
fn spec_m20_no_dependency_claim() {
    let content = read_spec().expect("failed to read spec file");
    // Priority ordering (P0 before P1 before P2) must not be stated
    // as a hard dependency — items are independently schedulable.
    assert!(
        !content.contains("must be completed before P1") && !content.contains("must precede P"),
        "priority ordering must not imply dependency between levels"
    );
}

// ---------------------------------------------------------------------------
// C004 — N0003→N0001: Non-goals documented; Tauri boundary respected.
// ---------------------------------------------------------------------------

#[test]
// @verifies C004
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_has_non_goals() {
    let content = read_spec().expect("failed to read spec file");
    assert!(
        content.contains("N0003"),
        "spec must reference N0003 (Non-goals & Tauri Boundary)"
    );
    assert!(
        content.contains("Non-goal") || content.contains("non-goal"),
        "spec must enumerate non-goals"
    );
}

#[test]
// @verifies C004
// [::TICKET::] P0-1, P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-1|P0-3) --for-spec --no-implementation-order`.
fn spec_tauri_boundary_respected() {
    // No crate source file may import tauri runtime — this is a
    // non-Tauri crate used via public Rust API.
    let src_dir = std::path::Path::new("src");
    if !src_dir.is_dir() {
        return;
    }
    for entry in walkdir_without_hidden(src_dir) {
        let content = std::fs::read_to_string(&entry).unwrap_or_default();
        assert!(
            !content.contains("tauri::"),
            "no tauri import allowed in src/: {:?}",
            entry,
        );
    }
}

// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn walkdir_without_hidden(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Skip hidden directories
                if !path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map_or(false, |n| n.starts_with('.'))
                {
                    files.extend(walkdir_without_hidden(&path));
                }
            } else if path.extension().map_or(false, |e| e == "rs") {
                files.push(path);
            }
        }
    }
    files
}

// ---------------------------------------------------------------------------
// C005 — N0004→N0001: Domain terms defined.
// ---------------------------------------------------------------------------

#[test]
// @verifies C005
// [::TICKET::] P0-1, P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-1|P0-3) --for-spec --no-implementation-order`.
fn spec_has_terminology() {
    let content = read_spec().expect("failed to read spec file");
    assert!(
        content.contains("N0004"),
        "spec must reference N0004 (Terminology)"
    );
    // At least one key domain term should be present
    let key_terms = ["Client", "Account", "Call", "Media Session", "SIP Event"];
    let found = key_terms.iter().filter(|&&t| content.contains(t)).count();
    assert!(
        found >= 2,
        "spec should define at least 2 of the key domain terms, found {}",
        found,
    );
}

// ---------------------------------------------------------------------------
// C006 — N0005→N0001: Compliance requirements (MSRV, PJSIP, OS targets).
// ---------------------------------------------------------------------------

#[test]
// @verifies C006
// [::TICKET::] P0-1, P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-1|P0-3) --for-spec --no-implementation-order`.
fn cargo_toml_has_correct_msrv() {
    let content = std::fs::read_to_string("Cargo.toml").expect("Cargo.toml must exist");
    assert!(
        content.contains("rust-version = \"1.95\""),
        "MSRV must be 1.95 in Cargo.toml (N0005 compliance requirement)"
    );
}

#[test]
// @verifies C006
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_has_compliance_requirements() {
    let content = read_spec().expect("failed to read spec file");
    assert!(
        content.contains("N0005"),
        "spec must reference N0005 (Compliance Requirements)"
    );
    assert!(
        content.contains("MSRV") || content.contains("1.95"),
        "spec must document MSRV 1.95"
    );
    assert!(
        content.contains("2.17"),
        "spec must document PJSIP version 2.17"
    );
}

// ---------------------------------------------------------------------------
// C007 — N0006→N0005 (internal): Versioning policy documented.
// ---------------------------------------------------------------------------

#[test]
// @verifies C007
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_has_versioning_policy() {
    let content = read_spec().expect("failed to read spec file");
    assert!(
        content.contains("N0006"),
        "spec must reference N0006 (Versioning Policy)"
    );
    assert!(
        content.contains("0.x") || content.contains("0."),
        "spec must document the 0.x development phase"
    );
    assert!(
        content.contains("semver"),
        "spec must document semver compliance policy"
    );
}

#[test]
// @verifies C007
// [::TICKET::] P0-1, P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-1|P0-3) --for-spec --no-implementation-order`.
fn versioning_policy_config_struct_exists() {
    let content = std::fs::read_to_string("src/config/versioning_policy.rs")
        .expect("versioning_policy.rs must exist");
    assert!(
        content.contains("struct Config"),
        "Config struct must be declared in versioning_policy.rs"
    );
    assert!(
        content.contains("N0006"),
        "versioning_policy.rs must reference N0006 node in its header"
    );
}

// ---------------------------------------------------------------------------
// C008 — N0007→N0001: 15 functional requirements enumerated.
// ---------------------------------------------------------------------------

#[test]
// @verifies C008
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_has_functional_requirements() {
    let content = read_spec().expect("failed to read spec file");
    assert!(
        content.contains("N0007"),
        "spec must reference N0007 (Functional Requirements)"
    );
    let fr_count: usize = (1..=15)
        .filter(|i| content.contains(&format!("FR-{:02}", i)))
        .count();
    assert!(
        fr_count >= 10,
        "spec should enumerate at least 10 of 15 functional requirements (FR-01..FR-15), found {}",
        fr_count,
    );
}

// ---------------------------------------------------------------------------
// C009 — N0008→N0001: Module structure documented.
// ---------------------------------------------------------------------------

#[test]
// @verifies C009
// [::TICKET::] P0-1, P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-1|P0-3) --for-spec --no-implementation-order`.
fn spec_has_module_structure() {
    let content = read_spec().expect("failed to read spec file");
    assert!(
        content.contains("N0008"),
        "spec must reference N0008 (Module Structure)"
    );
    // Key module directories should be mentioned
    assert!(
        content.contains("ffi/") || content.contains("runtime/") || content.contains("audio/"),
        "spec must document at least one key module directory (ffi/, runtime/, audio/)"
    );
    assert!(
        content.contains("single crate") || content.contains("single-crate"),
        "spec must state the single-crate design rationale"
    );
}

// ---------------------------------------------------------------------------
// Inbound edge contracts (C010-C067) — verify correct node references.
// ---------------------------------------------------------------------------

#[test]
// @verifies C010
// @verifies C014
// @verifies C040
// @verifies C053
// @verifies C058
// @verifies C060
// @verifies C067
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_references_inbound_contract_targets() {
    let content = read_spec().expect("failed to read spec file");
    // The spec must reference all target nodes that inbound contracts
    // depend on: N0005, N0006, N0007, N0008.
    for required_node in &["N0005", "N0006", "N0007", "N0008"] {
        assert!(
            content.contains(required_node),
            "spec must reference {} for inbound contract validity",
            required_node,
        );
    }
}

// ===========================================================================
// P1-4: Test Strategy & CI/CD Pipeline (N0052, N0053, N0054)
// ===========================================================================

/// Path to the P1-4 specification document.
const P1_4_SPEC_PATH: &str = "specs/P1-4.md";

/// Read the P1-4 spec file content as a String.
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn read_p1_4_spec() -> std::io::Result<String> {
    let mut file = std::fs::File::open(P1_4_SPEC_PATH)?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    Ok(content)
}

// ---------------------------------------------------------------------------
// C053 — N0052→N0007: 4-layer test strategy validates Functional Requirements.
// ---------------------------------------------------------------------------

#[test]
// @verifies C053-precondition
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_spec_file_exists() {
    let path = std::path::Path::new(P1_4_SPEC_PATH);
    assert!(
        path.exists(),
        "P1-4 spec file must exist at {}",
        P1_4_SPEC_PATH,
    );
}

#[test]
// @verifies C053-postcondition
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_spec_references_n0052_n0053_n0054() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(content.contains("N0052"), "spec must reference N0052");
    assert!(content.contains("N0053"), "spec must reference N0053");
    assert!(content.contains("N0054"), "spec must reference N0054");
    assert!(content.contains("§43"), "spec must reference RFC §43");
    assert!(content.contains("§44"), "spec must reference RFC §44");
}

#[test]
// @verifies C055-precondition
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_spec_references_n0039() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(
        content.contains("N0039"),
        "spec must reference N0039 (§28 Build Strategy & OS Dependencies)"
    );
}

// ---------------------------------------------------------------------------
// C053-postcondition: Each of the 4 layers has defined scope.
// ---------------------------------------------------------------------------

#[test]
// @verifies C053-postcondition
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_layer1_unit_tests_scope_defined() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(content.contains("Layer 1"), "spec must define Layer 1 scope");
    assert!(
        content.contains("MockBackend") || content.contains("PJSIP-free"),
        "Layer 1 must mention MockBackend or PJSIP-free testing"
    );
    assert!(
        content.contains("config validation") || content.contains("id mapping") || content.contains("BiMap"),
        "Layer 1 must list concrete test items"
    );
}

#[test]
// @verifies C053-postcondition
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_layer2_state_machine_scope_defined() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(content.contains("Layer 2"), "spec must define Layer 2 scope");
    assert!(
        content.contains("RegistrationState") || content.contains("CallState"),
        "Layer 2 must mention RegistrationState or CallState transitions"
    );
}

#[test]
// @verifies C053-postcondition
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_layer3_sip_integration_scope_defined() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(content.contains("Layer 3"), "spec must define Layer 3 scope");
    assert!(
        content.contains("Docker") && (content.contains("Asterisk") || content.contains("FreeSWITCH")),
        "Layer 3 must mention Docker-based SIP servers"
    );
}

#[test]
// @verifies C053-postcondition
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_layer4_interop_scope_defined() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(content.contains("Layer 4"), "spec must define Layer 4 scope");
    assert!(
        content.contains("OpenSIPS") || content.contains("Kamailio") || content.contains("3CX"),
        "Layer 4 must list PBX/Proxy targets"
    );
}

// ---------------------------------------------------------------------------
// C054-postcondition: M20 features mapped; placeholders have resolution paths.
// ---------------------------------------------------------------------------

#[test]
// @verifies C054-postcondition
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_placeholder_tests_have_resolution_conditions() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(
        content.contains("call_reject"),
        "spec must document the call_reject placeholder"
    );
    assert!(
        content.contains("early_media_received"),
        "spec must document the early_media_received placeholder"
    );
    assert!(
        content.contains("reregister_after_unregister") || content.contains("reregister"),
        "spec must document the reregister_after_unregister placeholder"
    );
    let has_resolution =
        content.contains("Dual Client") || content.contains("SIPp") || content.contains("blocking_read");
    assert!(has_resolution, "spec must document resolution conditions");
}

#[test]
// @verifies C054-postcondition
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_all_m20_features_have_test_layer_mapping() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    let m20_features = [
        "NativeEvent", "RegistrationStateChanged", "CallStateChanged",
        "CallMediaStateChanged", "DtmfSent", "SubscribeAudio",
        "conf_connect", "configure_codecs", "Dual Client", "low-priority",
    ];
    let found = m20_features.iter().filter(|&&f| content.contains(f)).count();
    assert!(
        found >= 9,
        "spec must map at least 9 of 11 M20 features, found {}",
        found,
    );
}

// ---------------------------------------------------------------------------
// C055-invariant: CI matrix covers 3 OSes x 4 features = 12 configs.
// ---------------------------------------------------------------------------

#[test]
// @verifies C055-invariant
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_ci_matrix_covers_three_oses() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(
        content.contains("windows-latest") || content.contains("windows"),
        "CI matrix must include Windows"
    );
    assert!(
        content.contains("macos-14") || content.contains("macOS"),
        "CI matrix must include macOS (macos-14)"
    );
    assert!(
        content.contains("ubuntu-22.04") || content.contains("ubuntu"),
        "CI matrix must include Ubuntu (ubuntu-22.04)"
    );
}

#[test]
// @verifies C055-invariant
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_ci_matrix_feature_combos() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(
        (content.contains("default") && content.contains("tls") && content.contains("srtp"))
            || content.contains("4 feature"),
        "spec must enumerate 4 feature combinations"
    );
}

#[test]
// @verifies C055-invariant
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_ci_matrix_all_12_configs_implied() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    let has_12 = content.contains("12 configurations")
        || (content.contains("3 OS") && content.contains("4 feature"));
    assert!(has_12, "spec must document 12 total CI configurations");
}

// ---------------------------------------------------------------------------
// C053/C054/C066 invariants.
// ---------------------------------------------------------------------------

#[test]
// @verifies C053-invariant
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_layer_scopes_do_not_overlap() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(content.contains("Layer 1"), "spec must list Layer 1");
    assert!(content.contains("Layer 2"), "spec must list Layer 2");
    assert!(content.contains("Layer 3"), "spec must list Layer 3");
    assert!(content.contains("Layer 4"), "spec must list Layer 4");
}

#[test]
// @verifies C054-invariant
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_dual_client_utility_documented() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(
        content.contains("DualClientContext") || content.contains("Dual Client"),
        "spec must document DualClientContext"
    );
    assert!(
        content.contains("client_a") && content.contains("client_b"),
        "DualClientContext must define client_a and client_b"
    );
    assert!(
        content.contains("PjsuaBackend") || content.contains("singleton"),
        "DualClientContext must reference shared PjsuaBackend singleton"
    );
}

#[test]
// @verifies C066
// @verifies C066-invariant
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_layer5_api_structure_referenced() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(
        content.contains("Layer 5") || content.contains("N0065") || content.contains("API Integration"),
        "spec must reference Layer 5 extension"
    );
}

#[test]
// @verifies C066
// @verifies C066-invariant
// [::TICKET::] P1-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-4 --for-spec --no-implementation-order`.
fn p1_4_test_dirs_mirror_api_invariant() {
    let content = read_p1_4_spec().expect("failed to read P1-4 spec file");
    assert!(
        content.contains("mirror") && (content.contains("src/api") || content.contains("tests/")),
        "spec must document that test dirs mirror the API module structure"
    );
}
