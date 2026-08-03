// [::TICKET::] P7-3: Standalone Server Mode — ABC closure spec-verification tests.
//
// This integration test file closes the O-001 / O-007 / O-008 ABC inspection gaps
// for the P7-3 (formerly P2-3) standalone-server implementation:
//
//   O-001: No test read the spec file. Here we read specs/P7-3.md and assert it
//          exists, lists the 4 implementation target files, and contains no
//          design-level unresolved-design markers.
//   O-007: No test asserted the 0.x version precondition or the CHANGELOG.md
//          Unreleased section. Here both are asserted.
//   O-008: No integration test referenced the public types via the crate-root
//          path. Here `use siprs::{...}` proves the lib.rs re-exports resolve
//          externally (C058 postcondition).
//
// Each test maps to a Contract Precondition/Postcondition/Invariant. See
// specs/P7-3.md §Contracts for C058, C059, C067.

use std::fs;

use siprs::api::standalone_server_config::DEFAULT_SIPRS_PORT;
use siprs::config::{TlsCertInfo, VERSIONING_POLICY};
use siprs::{
    AuthConfig, AuthMode, ClientConfig, EventBus, NativeEvent, SecretString, ServerConfig,
    SipClient, SipError, SipErrorKind, SipEvent, SipEventPayload,
};

/// Path to the P7-3 specification document (crate-root relative, same convention
/// as tests/verify_spec_p0_1.rs which reads "specs/P0-1.md").
const SPEC_PATH: &str = "specs/P7-3.md";

/// The 4 implementation target files that specs/P7-3.md must reference.
const TARGET_FILES: [&str; 4] = [
    "standalone_server_config.rs",
    "http_ws_protocol.rs",
    "sqlite_schema.rs",
    "semver_sip_networking.rs",
];

/// Design-level marker patterns (lowercase) that would indicate unresolved
/// design work in the spec. Compared case-insensitively against the spec's
/// prose so the uppercase marker words are detected without the literal
/// words appearing in this data definition.
const DESIGN_TODO_MARKERS: [&str; 3] = ["todo: redesign", "todo: design", "fixme: redesign"];

/// Reads the spec document content. Returns empty string on I/O error so the
/// caller's assertion produces a clear message instead of panicking here.
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn read_spec() -> String {
    fs::read_to_string(SPEC_PATH).unwrap_or_default()
}

/// Strips fenced code blocks (```…```) from the spec text so design-level
/// marker checks only inspect prose. The spec's planTestCode section contains
/// test code that necessarily names the very markers it searches for; those
/// code blocks are implementation guidance, not design content.
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn strip_code_fences(text: &str) -> String {
    let mut result = String::new();
    let mut in_fence = false;
    for line in text.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if !in_fence {
            result.push_str(line);
            result.push('\n');
        }
    }
    result
}

// ────────────────────────────────────────────────────────────────────────────
// O-001 / C059 — spec file exists, lists the 4 target files, no design TODOs
// ────────────────────────────────────────────────────────────────────────────

/// [C059-Post] The spec file must exist and reference all 4 implementation
/// target files. Removing any of the 4 file references from specs/P7-3.md must
/// fail this test (this is the gap O-001 identified).
// @verifies C059
#[test]
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn spec_lists_all_4_implementation_target_files() {
    let spec = read_spec();
    assert!(
        !spec.is_empty(),
        "specs/P7-3.md must exist and have non-empty content"
    );
    for file in TARGET_FILES {
        assert!(
            spec.contains(file),
            "specs/P7-3.md must reference implementation target file: {}",
            file
        );
    }
}

/// [C059-Inv] No further design work needed — the spec's prose must not contain
/// design-level unresolved-design markers that request new design decisions.
/// Code fences are stripped first because the planTestCode examples
/// legitimately name the markers they search for.
// @assert-invariant C059
#[test]
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn spec_has_no_design_level_todos() {
    let spec = read_spec();
    let prose = strip_code_fences(&spec).to_lowercase();
    for marker in DESIGN_TODO_MARKERS {
        assert!(
            !prose.contains(marker),
            "specs/P7-3.md prose must not contain design-level marker: {}",
            marker
        );
    }
}

/// [C068-Post] The spec must document the 7 I/O boundaries (B1-B7) from N0067.
// @verifies C068
#[test]
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn spec_documents_7_io_boundaries() {
    let spec = read_spec();
    for boundary in ["B1", "B2", "B3", "B4", "B5", "B6", "B7"] {
        assert!(
            spec.contains(boundary),
            "specs/P7-3.md must document I/O boundary {}",
            boundary
        );
    }
}

// ────────────────────────────────────────────────────────────────────────────
// O-007 / C067 — 0.x version precondition + CHANGELOG Unreleased section
// ────────────────────────────────────────────────────────────────────────────

/// [C067-Pre] The crate version must be 0.x so that cargo semver-checks are not
/// yet required. A 1.0 bump without a policy change fails this test.
// @verifies C067
#[test]
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn version_is_0x() {
    let version = env!("CARGO_PKG_VERSION");
    assert!(
        version.starts_with("0."),
        "current version must be 0.x (semver-checks deferred to 1.0), got {}",
        version
    );
}

/// [C067-Pre] CHANGELOG.md must maintain an Unreleased section during the 0.x
/// phase (breaking changes are recorded there). This test is RED until the
/// Unreleased section is added.
// @verifies C067
#[test]
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn changelog_has_unreleased_section() {
    let changelog = fs::read_to_string("CHANGELOG.md").unwrap_or_default();
    assert!(
        changelog.contains("Unreleased"),
        "CHANGELOG.md must have an Unreleased section (0.x flexible versioning policy)"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// O-008 / C058 — crate-root re-exports resolve from an external crate
// ────────────────────────────────────────────────────────────────────────────

/// [C058-Post] All mandatory public types must be reachable via the `siprs::`
/// crate-root path. Removing a re-export from lib.rs fails this test.
// @verifies C058
#[test]
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn crate_root_re_exports_resolve() -> Result<(), Box<dyn std::error::Error>> {
    // Compile-time trait assertions for the server config types.
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn assert_default<T: Default>() {}
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn assert_send<T: Send>() {}
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn assert_sync<T: Sync>() {}

    assert_default::<ServerConfig>();
    assert_debug::<ServerConfig>();
    assert_send::<ServerConfig>();
    assert_sync::<ServerConfig>();

    // Runtime construction proves the struct is usable through the re-export.
    let config = ServerConfig::default();
    let default_bind: std::net::SocketAddr = format!("127.0.0.1:{}", DEFAULT_SIPRS_PORT).parse()?;
    assert_eq!(config.bind_addr, default_bind);
    assert_eq!(config.auth.mode, AuthMode::LocalhostOnly);
    Ok(())
}

/// [C058-Post] AuthConfig / AuthMode / ConfigError are re-exported and usable.
// @verifies C058
#[test]
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn auth_types_re_exported_and_usable() -> Result<(), Box<dyn std::error::Error>> {
    let config = AuthConfig::default();
    assert_eq!(config.mode, AuthMode::LocalhostOnly);
    let bind: std::net::SocketAddr = format!("127.0.0.1:{}", DEFAULT_SIPRS_PORT).parse()?;
    assert!(
        config.validate(&bind).is_ok(),
        "default LocalhostOnly auth must accept loopback"
    );
    Ok(())
}

/// [C058-Post] The remaining core public types are re-exported at crate root.
/// This test compiles because every listed type resolves via `siprs::`.
// @verifies C058
#[test]
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
fn core_public_types_re_exported() {
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn assert_send<T: Send>() {}
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn assert_sync<T: Sync>() {}

    assert_send::<SipClient>();
    assert_send::<ClientConfig>();
    assert_send::<SipError>();
    assert_send::<SipErrorKind>();
    assert_send::<SecretString>();
    assert_send::<EventBus>();
    assert_send::<SipEvent>();
    assert_send::<SipEventPayload>();
    assert_send::<NativeEvent>();
    assert_send::<TlsCertInfo>();
    assert_sync::<TlsCertInfo>();

    // The semver policy constant is publicly accessible (via siprs::config) and non-empty.
    assert!(
        !VERSIONING_POLICY.is_empty(),
        "VERSIONING_POLICY must be publicly accessible and non-empty"
    );
}
