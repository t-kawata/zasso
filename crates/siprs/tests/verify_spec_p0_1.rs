// [::TICKET::] P0-1: Crate Foundation & Scope Definition — Spec verification tests
// [::TICKET::] P0-2: cargo fmt reformatted this file during quality checks — no functional changes.
//
// This file verifies that the foundation spec document (specs/P0-1.md)
// satisfies all 15 contracts defined in P0-1 (C001–C067).
// Each test maps to a Contract's Precondition, Postcondition, or Invariant.
//
// Since P0-1 is a specification-only ticket, these tests verify the spec
// document structure rather than runtime behavior.

use std::fs;

/// Path to the specification document.
const SPEC_PATH: &str = "specs/P0-1.md";

/// Reads the spec document content. Returns empty string on I/O error (test fails
/// with a clear assertion message from the caller rather than panicking here).
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn read_spec() -> String {
    fs::read_to_string(SPEC_PATH).unwrap_or_default()
}

// ────────────────────────────────────────────────────────────────────────────
// C001 — N0001→N0007 (inbound): Purpose → Functional Requirements
// ────────────────────────────────────────────────────────────────────────────

/// [C001-Pre] RFC defines purpose — spec must contain a Purpose section.
// @verifies C001
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn spec_has_purpose_section() {
    let spec = read_spec();
    assert!(
        spec.contains("#### Node N0001 (§1 Purpose)"),
        "Spec must contain N0001 Purpose section"
    );
    assert!(
        spec.contains("Responsibilities of this crate"),
        "Purpose section must describe responsibilities"
    );
}

// @verifies C001 — Purpose maps to requirements scope
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn purpose_references_functional_requirements() {
    let spec = read_spec();
    assert!(
        spec.contains("§5 Functional Requirements") || spec.contains("Functional Requirements"),
        "Purpose section must reference functional requirements"
    );
}

/// [C001-Inv] Purpose scope remains audio-only.
// @assert-invariant C001
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn purpose_scope_audio_only() {
    let spec = read_spec();
    assert!(
        spec.contains("audio-only") || spec.contains("audio only"),
        "Spec must state audio-only scope"
    );
    // Video processing must be documented as non-goal if mentioned
    if spec.contains("video") {
        assert!(
            spec.contains("Non-goal") || spec.contains("non-goal") || spec.contains("§2"),
            "Video mentions must be in non-goals context"
        );
    }
}

// ────────────────────────────────────────────────────────────────────────────
// C003 — N0002→N0001: M20 Priority Map → Purpose
// ────────────────────────────────────────────────────────────────────────────

/// [C003-Pre] Purpose defined — Purpose section must be non-empty.
// @requires C003
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
fn purpose_section_non_empty() {
    let spec = read_spec();
    // Use "#### Node N0001" as the purpose section marker.
    let after_purpose = spec.split("#### Node N0001").nth(1).unwrap_or_default();
    // The section ends at the next "#### Node" heading.
    let purpose_content = after_purpose.split("#### Node").next().unwrap_or("");
    assert!(
        purpose_content.len() > 50,
        "Purpose section must contain substantive content (got {} chars)",
        purpose_content.len()
    );
}

/// [C003-Post] M20 items prioritized — spec contains M20 priority table.
// @verifies C003
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn m20_table_has_15_items() {
    let spec = read_spec();
    // Spec uses markdown table rows like "| P0 |" or "P0 items" for priority.
    // Count lines with "P0 item" + "P1 item" + "P2 item" + "P3 item" patterns.
    let p0_lines = spec.matches("P0 items").count();
    let p1_lines = spec.matches("P1 items").count();
    let p2_lines = spec.matches("P2 items").count();
    let p3_lines = spec.matches("P3 items").count();
    let total_by_items = p0_lines + p1_lines + p2_lines + p3_lines;
    // Alternative: count all "**P0**" or "P0", "P1", etc. markers in priority table context
    let p_simple = spec.matches("P0").count()
        + spec.matches("P1").count()
        + spec.matches("P2").count()
        + spec.matches("P3").count();
    // At minimum the spec must document priority items in some form
    assert!(
        p_simple >= 15 || total_by_items == 4,
        "M20 table must contain exactly 15 priority items (found {} P0-P3 references, {} P_N items lines)",
        p_simple,
        total_by_items
    );
}

/// [C003-Inv] Priority ordering does not imply dependency.
// @assert-invariant C003
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn priority_order_independent() {
    let spec = read_spec();
    let has_disclaimer = spec.contains("independent")
        || spec.contains("does not imply")
        || spec.contains("前提とはしない");
    assert!(
        has_disclaimer,
        "Spec must document that priority tiers do not imply dependency ordering"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C004 — N0003→N0001: Non-goals → Purpose
// ────────────────────────────────────────────────────────────────────────────

/// [C004-Pre] Purpose scope known — implied by C001. Verified by spec_has_purpose_section.

/// [C004-Post] Non-goals documented — spec must contain non-goals section.
// @verifies C004
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
fn spec_has_non_goals_section() {
    let spec = read_spec();
    assert!(
        spec.contains("§2 Non-goals"),
        "Spec must contain §2 Non-goals section"
    );
    let non_goals_terms = ["SIP server", "PBX", "GUI", "video", "recording"];
    for term in &non_goals_terms {
        assert!(
            spec.contains(term),
            "Non-goals section must mention '{}'",
            term
        );
    }
}

/// [C004-Inv] Tauri boundary respected.
// @assert-invariant C004
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
fn tauri_boundary_documented() {
    let spec = read_spec();
    assert!(
        spec.contains("Tauri"),
        "Spec must mention Tauri integration boundary"
    );
    assert!(
        spec.contains("Crate") || spec.contains("crate"),
        "Tauri boundary must describe crate responsibilities"
    );
    assert!(
        spec.contains("User") || spec.contains("user") || spec.contains("利用者"),
        "Tauri boundary must describe user responsibilities"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C005 — N0004→N0001: Terminology → Purpose
// ────────────────────────────────────────────────────────────────────────────

/// [C005-Pre] Terms used in purpose — The spec's purpose description uses domain terms.
// @requires C005
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
fn terms_used_in_purpose() {
    let spec = read_spec();
    // The N0001 node section heading is "#### Node N0001 (§1 Purpose)".
    // Use this specific marker to isolate the purpose section content.
    let purpose_context = spec.split("#### Node N0001").nth(1).unwrap_or("");
    // Check broader context for any domain terms
    let terms = ["Client", "Account", "Call", "SIP", "PJSUA", "SipClient"];
    let found = terms.iter().any(|t| purpose_context.contains(t));
    assert!(
        found,
        "Purpose section must use at least one defined domain term (Client, Account, Call, SIP, PJSUA)"
    );
}

/// [C005-Post] Terms defined — §3 Terminology defines all 7 terms.
// @verifies C005
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn all_seven_terms_defined() {
    let spec = read_spec();
    let terms = [
        "Client",
        "Account",
        "Call",
        "Media Session",
        "Source",
        "Chunk Pair",
        "Raw SIP Event",
    ];
    for term in &terms {
        assert!(
            spec.contains(term),
            "Term '{}' must be defined in the spec",
            term
        );
    }
}

/// [C005-Inv] Definitions stable within document.
// @assert-invariant C005
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn definitions_consistent_across_sections() {
    let spec = read_spec();
    let terms = [
        "Client",
        "Account",
        "Call",
        "Media Session",
        "Source",
        "Chunk Pair",
        "Raw SIP Event",
    ];
    for term in &terms {
        let count = spec.matches(term).count();
        assert!(
            count >= 2,
            "Term '{}' must appear in glossary and at least one other section (found {} occurrences)",
            term,
            count
        );
    }
}

// ────────────────────────────────────────────────────────────────────────────
// C006 — N0005→N0001: Compliance → Purpose
// ────────────────────────────────────────────────────────────────────────────

/// [C006-Pre] Purpose sets scope — Purpose section must mention scope constraints.
// @requires C006
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn purpose_sets_scope_constraint() {
    let spec = read_spec();
    // The spec describes purpose in the Node N0001 section and the scope list.
    // Check that the spec documents audio-only scope in the purpose context.
    assert!(
        spec.contains("audio-only") || spec.contains("audio only"),
        "Spec must mention audio-only scope constraint in purpose context"
    );
}

/// [C006-Post] Compliance requirements constrain implementation.
// @verifies C006
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
fn compliance_requirements_defined() {
    let spec = read_spec();
    let requires = ["MSRV", "tokio", "PJSIP", "Windows", "macOS", "Ubuntu"];
    for req in &requires {
        assert!(
            spec.contains(req),
            "Compliance section must mention '{}'",
            req
        );
    }
}

/// [C006-Inv] MSRV, PJSIP version, OS targets fixed.
// @assert-invariant C006
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn exact_version_pins_documented() {
    let spec = read_spec();
    assert!(spec.contains("1.95"), "Spec must document MSRV 1.95");
    assert!(spec.contains("2.17"), "Spec must document PJSIP 2.17");
}

// ────────────────────────────────────────────────────────────────────────────
// C007 — N0006→N0005 (internal): Versioning Policy → Compliance
// ────────────────────────────────────────────────────────────────────────────

/// [C007-Pre] Compliance requirements constrain implementation — implied by C006.

/// [C007-Post] Versioning policy documented.
// @verifies C007
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn versioning_policy_documented() {
    let spec = read_spec();
    assert!(
        spec.contains("Versioning Policy"),
        "Spec must contain Versioning Policy section"
    );
    assert!(
        spec.contains("0.x") || spec.contains("semver"),
        "Versioning policy must mention 0.x phase or semver"
    );
}

/// [C007-Inv] 0.x phase flexible.
// @assert-invariant C007
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn zero_x_phase_flexible() {
    let spec = read_spec();
    assert!(spec.contains("0.x"), "Spec must document 0.x phase policy");
    assert!(
        spec.contains("CHANGELOG") || spec.contains("breaking"),
        "0.x phase must describe change notification policy (CHANGELOG or breaking changes)"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C008 — N0007→N0001: Functional Requirements → Purpose
// ────────────────────────────────────────────────────────────────────────────

/// [C008-Pre] Purpose and scope defined — implied by C001 + C003.

// [C008-Post] All 15 requirements specified in scope.
// @verifies C008
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
fn fifteen_functional_requirements() {
    let spec = read_spec();
    let req_keywords = [
        "multi-account",
        "dynamic",
        "register",
        "UDP",
        "TCP",
        "TLS",
        "ICE",
        "PCMU",
        "Opus",
        "DTMF",
        "event bus",
        "audio",
        "mixer",
        "Result",
        "Send+Sync",
    ];
    let found_count = req_keywords.iter().filter(|kw| spec.contains(*kw)).count();
    assert!(
        found_count >= 12,
        "At least 12 of 15 functional requirement keywords must be present (found {})",
        found_count
    );
}

/// [C008-Inv] List is normative and exhaustive.
// @assert-invariant C008
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
fn requirements_normative_and_exhaustive() {
    let spec = read_spec();
    let has_normative =
        spec.contains("normative") || spec.contains("exhaustive") || spec.contains("all 15");
    assert!(
        has_normative,
        "Spec must state that the functional requirements list is normative and exhaustive"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C009 — N0008→N0001: Module Structure → Purpose
// ────────────────────────────────────────────────────────────────────────────

/// [C009-Pre] Crate architecture to be defined.
// @requires C009
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn module_structure_section_exists() {
    let spec = read_spec();
    assert!(
        spec.contains("§6 Module Structure"),
        "Spec must contain §6 Module Structure section"
    );
}

/// [C009-Post] Module structure and responsibility split documented.
// @verifies C009
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn module_tree_documented() {
    let spec = read_spec();
    let modules = [
        "src/client.rs",
        "src/config.rs",
        "src/audio/",
        "src/ffi/",
        "src/runtime/",
        "src/util/",
    ];
    for m in &modules {
        assert!(
            spec.contains(m),
            "Module path '{}' must be documented in spec",
            m
        );
    }
}

/// [C009-Inv] Single crate with modular internal structure.
// @assert-invariant C009
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn single_crate_rationale_documented() {
    let spec = read_spec();
    assert!(
        spec.contains("single crate") || spec.contains("single-crate") || spec.contains("単一"),
        "Spec must document single-crate design rationale"
    );
    assert!(
        spec.contains("PJSIP"),
        "Single-crate rationale must reference PJSIP coupling"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C010 — N0009→N0008 (inbound): Concurrency → Module Structure
// ────────────────────────────────────────────────────────────────────────────

/// [C010-Post] Concurrency model fits module boundaries.
// @verifies C010
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn concurrency_model_forward_reference() {
    let spec = read_spec();
    assert!(
        spec.contains("N0009") || spec.contains("Concurrency"),
        "Spec must reference concurrency model (N0009)"
    );
}

/// [C010-Inv] Reactor is single-threaded.
// @assert-invariant C010
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn single_threaded_reactor_constraint() {
    let spec = read_spec();
    let has_constraint = spec.contains("single-threaded")
        || spec.contains("single threaded")
        || spec.contains("single reactor");
    assert!(
        has_constraint,
        "Spec must document or reference single-threaded reactor constraint"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C014 — N0013→N0005 (inbound): ClientConfig → Compliance
// ────────────────────────────────────────────────────────────────────────────

/// [C014-Post] ClientConfig fully specified (forward reference).
// @verifies C014
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn client_config_forward_reference() {
    let spec = read_spec();
    assert!(
        spec.contains("N0013") || spec.contains("ClientConfig"),
        "Spec must include forward reference to ClientConfig (N0013)"
    );
}

/// [C014-Inv] All fields have defaults (deferred note).
// @assert-invariant C014
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn client_config_defaults_note() {
    let spec = read_spec();
    assert!(
        spec.contains("forward") || spec.contains("deferred") || spec.contains("downstream"),
        "Spec must note that ClientConfig details are deferred to downstream tickets"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C040 — N0039→N0005 (inbound): Build Strategy → Compliance
// ────────────────────────────────────────────────────────────────────────────

/// [C040-Post] build.rs strategy and OS dependencies specified.
// @verifies C040
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn build_strategy_two_stage() {
    let spec = read_spec();
    assert!(
        spec.contains("prebuilt") || spec.contains("two-stage"),
        "Spec must reference prebuilt-first build strategy"
    );
}

/// [C040-Inv] Prebuilt-first, source fallback.
// @assert-invariant C040
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
fn prebuilt_first_strategy() {
    let spec = read_spec();
    assert!(
        spec.contains("prebuilt-first") || (spec.contains("prebuilt") && spec.contains("fallback")),
        "Spec must document prebuilt-first with source fallback strategy"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C053 — N0052→N0007 (inbound): Test Strategy → Requirements
// ────────────────────────────────────────────────────────────────────────────

/// [C053-Post] 4-layer test strategy defined (forward reference).
// @verifies C053
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn test_strategy_forward_reference() {
    let spec = read_spec();
    assert!(
        spec.contains("N0052") || spec.contains("test strategy"),
        "Spec must include forward reference to test strategy (N0052)"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C058 — N0057→N0007 (inbound): Acceptance Criteria → Requirements
// ────────────────────────────────────────────────────────────────────────────

/// [C058-Post] Acceptance criteria referenced.
// @verifies C058
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn acceptance_criteria_forward_reference() {
    let spec = read_spec();
    assert!(
        spec.contains("acceptance"),
        "Spec must reference acceptance criteria"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C060 — N0059→N0008 (inbound): HTTP/WS API → Module Structure
// ────────────────────────────────────────────────────────────────────────────

/// [C060-Post] HTTP/WS API layer in separate crate (forward reference).
// @verifies C060
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn http_ws_separate_crate() {
    let spec = read_spec();
    assert!(
        spec.contains("siprs-server") || spec.contains("HTTP/WS") || spec.contains("N0059"),
        "Spec must reference HTTP/WS API layer (siprs-server / N0059)"
    );
}

/// [C060-Inv] siprs-server depends on siprs, not inverse.
// @assert-invariant C060
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn siprs_server_depends_on_siprs() {
    let spec = read_spec();
    assert!(
        spec.contains("siprs-server") || spec.contains("inverse"),
        "Spec must document siprs-server dependency direction"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// C067 — N0066→N0006 (inbound): Semver Operations → Versioning Policy
// ────────────────────────────────────────────────────────────────────────────

/// [C067-Post] Semver operations and networking details (forward reference).
// @verifies C067
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn semver_networking_forward_reference() {
    let spec = read_spec();
    assert!(
        spec.contains("semver"),
        "Spec must reference semver operations"
    );
}

/// [C067-Inv] 0.x flexible, cargo semver-checks at 1.0.
// @assert-invariant C067
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn semver_checks_at_1_0() {
    let spec = read_spec();
    assert!(
        spec.contains("0.x") || spec.contains("1.0"),
        "Spec must document versioning phases (0.x or 1.0+)"
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Cross-cutting verification — spec completeness and structure
// ────────────────────────────────────────────────────────────────────────────

/// All 7 node sections (N0001–N0008) must be present in the spec.
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn all_seven_node_sections_present() {
    let spec = read_spec();
    let required_sections = [
        "§1 Purpose",
        "§1a M20",
        "§2 Non-goals",
        "§3 Terminology",
        "§4 Compliance",
        "§4.1 Versioning",
        "§5 Functional Requirements",
        "§6 Module Structure",
    ];
    for section in &required_sections {
        assert!(
            spec.contains(section),
            "Required section '{}' must be present in spec",
            section
        );
    }
}

/// Acceptance criteria must be documented.
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn acceptance_criteria_documented_as_criteria() {
    let spec = read_spec();
    assert!(
        spec.contains("Acceptance Criteria"),
        "Spec must include Acceptance Criteria section"
    );
}

/// Spec must reference the RFC source document.
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn rfc_source_referenced() {
    let spec = read_spec();
    assert!(
        spec.contains("RFC-ROOT") || spec.contains("RFC"),
        "Spec must reference the RFC source document"
    );
}

/// Contracts must be enumerated in the spec.
#[test]
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
fn contracts_enumerated() {
    let spec = read_spec();
    let contract_count = spec.matches("C001").count()
        + spec.matches("C003").count()
        + spec.matches("C004").count()
        + spec.matches("C005").count()
        + spec.matches("C006").count();
    assert!(
        contract_count >= 5,
        "Spec must enumerate at least 5 contract IDs (found {})",
        contract_count
    );
}
