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
//   - NODE_ID=N0059:  §52 HTTP/WebSocket API Layer & Crate Split
//     → To show details: (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0059 --hops=2)
//   - NODE_ID=N0060:  §52.2-52.4 License & Multi-Instance Policy
//     → To show details: (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0060 --hops=2)
//   - NODE_ID=N0067:  §61 I/O Boundary Reference Information
//     → To show details: (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0067 --hops=2)
//
// Cross-referenced design context:
//   - architecture/§52 HTTP/WebSocket API Layer & Crate Split [NODE_ID=N0059]
//     (validates ← siprs/tests/P2-3_spec_validation.rs)
//   - architecture/§52.2-52.4 License & Multi-Instance Policy [NODE_ID=N0060]
//     (validates ← siprs/tests/P2-3_spec_validation.rs)
//   - architecture/§61 I/O Boundary Reference Information [NODE_ID=N0067]
//     (validates ← siprs/tests/P2-3_spec_validation.rs)
//
// This test suite validates that the P2-3 specification document exists and
// correctly documents the Crate Split, License & I/O Boundary Architecture.
// It covers the contracts C060, C061, C062, C068 defined for P2-3.
// ============================================================================

use std::io::Read;

/// Path to the P2-3 specification document.
const SPEC_PATH: &str = "specs/P2-3.md";

/// Read the P2-3 spec file content as a String.
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn read_spec() -> std::io::Result<String> {
    let mut file = std::fs::File::open(SPEC_PATH)?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    Ok(content)
}

// ---------------------------------------------------------------------------
// C060 — N0059→N0008: Core crate structure → HTTP/WS API layer in separate
//         crate. siprs-server depends on siprs, not inverse.
// ---------------------------------------------------------------------------

#[test]
// @verifies C060-precondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn p2x3_spec_file_exists() {
    let path = std::path::Path::new(SPEC_PATH);
    assert!(
        path.exists(),
        "P2-3 spec file must exist at {} — it is the primary deliverable",
        SPEC_PATH,
    );
}

#[test]
// @verifies C060-precondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_references_crate_split() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("N0059"),
        "spec must reference N0059 (Crate Split architecture)"
    );
    assert!(
        content.contains("siprs-server"),
        "spec must reference the siprs-server crate"
    );
    assert!(
        content.contains("crate split") || content.contains("Crate Split"),
        "spec must document the crate split decision"
    );
}

#[test]
// @verifies C060-postcondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_dependency_direction() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("siprs-server depends on siprs")
            || content.contains("siprs-server→siprs")
            || content.contains("siprs-server -> siprs"),
        "spec must assert that siprs-server depends on siprs only (not the inverse)"
    );
}

#[test]
// @verifies C060-invariant
// [::TICKET::] P2-3, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-3|P4-1) --for-spec --no-implementation-order`.
fn siprs_crate_has_no_http_deps() {
    let cargo = std::fs::read_to_string("Cargo.toml").expect("Cargo.toml must exist at crate root");
    assert!(
        !cargo.contains("axum"),
        "siprs crate must not depend on axum (crate split invariant)"
    );
    assert!(
        !cargo.contains("tokio-tungstenite"),
        "siprs crate must not depend on tokio-tungstenite (crate split invariant)"
    );
    assert!(
        !cargo.contains("rusqlite"),
        "siprs crate must not depend on rusqlite (crate split invariant)"
    );
}

// ---------------------------------------------------------------------------
// C061 — N0060→N0059 (internal): License policy — MIT/Apache 2.0 dual license
//         with GPL linking exception; multi-instance via PjsuaBackend singleton.
// ---------------------------------------------------------------------------

#[test]
// @verifies C061-precondition
// [::TICKET::] P2-3, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-3|P4-1) --for-spec --no-implementation-order`.
fn spec_references_license() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("N0060"),
        "spec must reference N0060 (License & Multi-Instance Policy)"
    );
    assert!(content.contains("MIT"), "spec must mention MIT license");
    assert!(
        content.contains("Apache 2.0"),
        "spec must mention Apache 2.0 license"
    );
}

#[test]
// @verifies C061-postcondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_gpl_linking_exception() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("GPL linking exception"),
        "spec must document the GPL linking exception for PJSIP dependency"
    );
    assert!(
        content.contains("GPL v2") || content.contains("GPLv2") || content.contains("GPL v2"),
        "spec must reference GPL v2 as the PJSIP license"
    );
}

#[test]
// @verifies C061-invariant
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_multi_instance() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("PjsuaBackend singleton")
            || content.contains("singleton sharing")
            || content.contains("Dual Client"),
        "spec must document PjsuaBackend singleton sharing model"
    );
}

#[test]
// @verifies C061-invariant
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_ffi_audit_policy() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("bindings"),
        "spec must document the bindings tier of FFI audit policy"
    );
    assert!(
        content.contains("callbacks"),
        "spec must document the callbacks tier of FFI audit policy"
    );
    assert!(
        content.contains("strings"),
        "spec must document the strings tier of FFI audit policy"
    );
}

// ---------------------------------------------------------------------------
// C062 — N0061→N0059 (inbound): Standalone server mode and config defined.
//         AuthConfig defaults to LocalhostOnly.
// ---------------------------------------------------------------------------

#[test]
// @verifies C062-precondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_server_config_fields() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("bind_addr"),
        "spec must define the bind_addr field of ServerConfig"
    );
    assert!(
        content.contains("db_path"),
        "spec must define the db_path field of ServerConfig"
    );
    assert!(
        content.contains("allowed_origins"),
        "spec must define the allowed_origins field of ServerConfig"
    );
    assert!(
        content.contains("auth"),
        "spec must define the auth field of ServerConfig"
    );
}

#[test]
// @verifies C062-postcondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_auth_config_variants() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("LocalhostOnly"),
        "spec must define the LocalhostOnly AuthMode variant"
    );
    assert!(
        content.contains("ApiKey"),
        "spec must define the ApiKey AuthMode variant"
    );
    assert!(
        content.contains("Jwt"),
        "spec must define the Jwt AuthMode variant"
    );
}

#[test]
// @verifies C062-invariant
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_localhost_default() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("127.0.0.1"),
        "default bind address must be 127.0.0.1 (localhost only)"
    );
    assert!(
        content.contains("LocalhostOnly"),
        "AuthConfig must default to LocalhostOnly mode"
    );
}

// ---------------------------------------------------------------------------
// C068 — N0067→N0001: I/O boundary reference information for future
//         splitting. This is reference, not prescriptive.
// ---------------------------------------------------------------------------

#[test]
// @verifies C068-precondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_io_boundaries() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("N0067"),
        "spec must reference N0067 (I/O Boundary Reference)"
    );
    for i in 1..=7 {
        assert!(
            content.contains(&format!("B{}", i)),
            "spec must enumerate I/O boundary B{}",
            i,
        );
    }
}

#[test]
// @verifies C068-postcondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_io_attributes() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("sync/async") || content.contains("Synchronous/Asynchronous"),
        "spec must include sync/async attribute for I/O boundaries"
    );
    assert!(
        content.contains("data format"),
        "spec must include data format attribute for I/O boundaries"
    );
}

#[test]
// @verifies C068-postcondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_dependency_concerns() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("NativeEvent"),
        "spec must mention NativeEvent extension concern"
    );
    assert!(
        content.contains("RuntimeCommand"),
        "spec must mention RuntimeCommand pipeline concern"
    );
    assert!(
        content.contains("sequence number"),
        "spec must mention sequence number consistency concern"
    );
}

#[test]
// @verifies C068-invariant
// [::TICKET::] P2-3, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-3|P4-1) --for-spec --no-implementation-order`.
fn spec_io_reference_nature() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("reference"),
        "spec must describe I/O boundaries as reference information"
    );
    assert!(
        content.contains("not prescriptive")
            || content.contains("reference only")
            || content.contains("reference information"),
        "spec must clearly state that I/O boundaries are reference, not prescriptive"
    );
}

// ---------------------------------------------------------------------------
// Error case — Missing spec file detection
// ---------------------------------------------------------------------------

#[test]
// @verifies C060-precondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
#[should_panic(expected = "must exist at")]
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn error_spec_missing() {
    let path = std::path::Path::new("specs/P2-3_DOES_NOT_EXIST.md");
    assert!(
        path.exists(),
        "P2-3 spec file must exist at {}",
        path.display(),
    );
}

// ---------------------------------------------------------------------------
// Boundary cases
// ---------------------------------------------------------------------------

#[test]
// @verifies C068-postcondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn boundary_all_io_boundaries() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    let mut missing_boundaries = Vec::new();
    for i in 1..=7 {
        if !content.contains(&format!("B{}", i)) {
            missing_boundaries.push(format!("B{}", i));
        }
    }
    assert!(
        missing_boundaries.is_empty(),
        "All 7 I/O boundaries must be present. Missing: {:?}",
        missing_boundaries,
    );
}

#[test]
// @verifies C062-postcondition
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn boundary_auth_modes() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    let auth_modes = ["LocalhostOnly", "ApiKey", "Jwt"];
    for mode in &auth_modes {
        assert!(
            content.contains(mode),
            "AuthMode variant '{}' must be documented in spec",
            mode,
        );
    }
}

#[test]
// @verifies C062-invariant
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn boundary_default_port() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    assert!(
        content.contains("3910"),
        "Default listen port must be documented as 3910 per RFC §53.2"
    );
}

// ---------------------------------------------------------------------------
// Inbound edge contracts verification
// ---------------------------------------------------------------------------

#[test]
// @verifies C060
// @verifies C061
// @verifies C062
// @verifies C068
// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
fn spec_references_all_contract_nodes() {
    let content = read_spec().expect("failed to read P2-3 spec file");
    for required_node in &["N0059", "N0060", "N0061", "N0067"] {
        assert!(
            content.contains(required_node),
            "spec must reference {} for contract validity",
            required_node,
        );
    }
}
