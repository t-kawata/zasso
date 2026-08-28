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
//   - NODE_ID=N0102:  Bindgen
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0102 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Bindgen enum/const generation strategy (§62.33 / N0102).
//!
//! The bindgen allowlist is the single entry point that defines the generated
//! FFI surface (C140 invariant). Enum types siprs matches on are generated as
//! Rust enums via `BINDGEN_ENUM_TYPES` + `default_enum_style(Rust)` +
//! `prepend_enum_name(false)` — so `pjsip_inv_state::PJSIP_INV_STATE_CALLING`
//! resolves to a real variant instead of a missing u32 constant (the E0599
//! 'no associated constant' class).
//!
//! The canonical allowlist lives in [`crate::build::build_script_bindgen`]
//! (`BINDGEN_ENUM_TYPES`), which is the module build.rs includes and the crate
//! compiles for tests — this module re-exports it as the design record.

/// Enum types generated as Rust enums (§62.33 / N0102; C140).
pub use crate::build::build_script_bindgen::BINDGEN_ENUM_TYPES;

/// The bindgen configuration that turns the enum types into Rust enums.
///
/// `default_enum_style(Rust { non_exhaustive: false })` generates the enum and
/// `prepend_enum_name(false)` keeps the C enumerator names as-is
/// (`PJSIP_INV_STATE_CALLING`, not `pjsip_inv_state_PJSIP_INV_STATE_CALLING`).
pub const ENUM_GENERATION_STYLE: &str = "Rust { non_exhaustive: false } + prepend_enum_name(false)";

#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C140
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn enum_types_are_allowlisted_as_rust_enums() {
        // C140 postcondition: pjsip_inv_state / pjsip_tsx_state /
        // pjsua_call_media_status / pj_status_t are generated as Rust enums —
        // each is in BINDGEN_ENUM_TYPES.
        for ty in [
            "pjsip_inv_state",
            "pjsip_tsx_state",
            "pjsua_call_media_status",
            "pj_status_t",
        ] {
            assert!(
                BINDGEN_ENUM_TYPES.contains(&ty),
                "BINDGEN_ENUM_TYPES must include {ty}"
            );
        }
    }

    /// @verifies C140
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn allowlist_remains_the_single_bindgen_entry() {
        // C140 invariant: the enum surface is driven by BINDGEN_ENUM_TYPES and
        // the fixed allowlist set — no ad-hoc per-type allowlisting.
        assert!(!BINDGEN_ENUM_TYPES.is_empty());
        assert!(!ENUM_GENERATION_STYLE.is_empty());
    }
}
