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
//   - NODE_ID=N0100:  Round
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0100 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Round-4 evolution scope and root cause (§62.31 / N0100).
//!
//! Records the round-4 build-repair scope that closes the 69-error
//! `pjsua-native` build (bindgen enum/const generation, vendored 2.17.0 code
//! adaptation, and pure-Rust fixes). The 9 scope-change targets below are the
//! C137 invariant boundary: round-4 never rewrites a round-3-settled decision
//! (§62.21–62.30) in a file outside this list.

/// The 9 round-4 scope-change targets (§62.31 / N0100; C137).
///
/// Every file the round-4 build repair may modify. A file outside this list is
/// round-3-settled and must not be rewritten (C137 invariant).
pub const ROUND4_SCOPE_TARGETS: &[&str] = &[
    "src/build/build_script_bindgen.rs",
    "build.rs",
    "src/ffi/constants.rs",
    "src/ffi/backend_calls.rs",
    "src/ffi/callback.rs",
    "src/config/observability_metrics.rs",
    "src/state/m20_callstate_mapping.rs",
    "src/runtime/backend.rs",
    "src/config/stun_turn_ice_wiring.rs",
];

/// Number of observed `pjsua-native` error categories pre-repair (§62.31).
///
/// The root-cause record: 69 errors across 15 finer-grained categories than the
/// design brief's 7 — missing enumerators, absent vendored symbols, absent
/// struct fields, enum-shape mismatches, and pure-Rust (import/type) errors.
pub const OBSERVED_ERROR_CATEGORY_COUNT: usize = 15;

/// Whether a path is inside the round-4 scope-change set (C137 boundary).
pub fn is_round4_scope_target(path: &str) -> bool {
    ROUND4_SCOPE_TARGETS.contains(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C137
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn round4_scope_targets_are_the_nine_contract_paths() {
        // C137 invariant: the round-4 file set is exactly the 9 scope-change
        // targets — a round-3-settled file outside this list must never be
        // rewritten. The list is asserted in full so a scope expansion that
        // would touch a round-3 file fails here first.
        assert_eq!(ROUND4_SCOPE_TARGETS.len(), 9);
        for expected in [
            "src/build/build_script_bindgen.rs",
            "build.rs",
            "src/ffi/constants.rs",
            "src/ffi/backend_calls.rs",
            "src/ffi/callback.rs",
            "src/config/observability_metrics.rs",
            "src/state/m20_callstate_mapping.rs",
            "src/runtime/backend.rs",
            "src/config/stun_turn_ice_wiring.rs",
        ] {
            assert!(
                is_round4_scope_target(expected),
                "missing scope target {expected}"
            );
        }
    }

    /// @verifies C137
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn round3_settled_files_are_not_round4_scope_targets() {
        // C137 postcondition: the round-4 scope starts from the round-3 settled
        // baseline. The round-3-owned modules (io boundary, ticket structure)
        // are not in the 9-file repair set.
        for settled in [
            "src/architecture/io_boundary_round3.rs",
            "src/architecture/round3_scope_rootcause.rs",
        ] {
            assert!(
                !is_round4_scope_target(settled),
                "round-3-settled file must not be a round-4 scope target: {settled}"
            );
        }
    }
}
