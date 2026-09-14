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
//   - NODE_ID=N0103:  Static
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0103 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Static link-set derivation strategy (§62.34 / N0103).
//!
//! The link set is derived from the resolved `lib/` directory contents — never
//! a hardcoded module list (C141 invariant). `libpjproject.a` (or
//! `pjproject.lib` on Windows) wins as a single integrated archive
//! (`static=pjproject`); otherwise every `lib*.a` stem is emitted sorted.
//! ELF linkers (Linux/Android) wrap the set in `--start-group`/`--end-group`
//! to resolve pjmedia ↔ pjmedia-codec ↔ pjlib-util cycles.
//!
//! The canonical derivation lives in [`crate::build::build_script_bindgen`]
//! (`derive_link_set` / `link_group_wrapper`); this module re-exports them as
//! the design record.

/// Derive the static link set from a resolved `lib/` directory (§62.34 / N0103).
pub use crate::build::build_script_bindgen::{derive_link_set, link_group_wrapper};

/// Integrated-archive file name on Unix (`libpjproject.a`).
pub const INTEGRATED_ARCHIVE_UNIX: &str = "libpjproject.a";
/// Integrated-archive file name on Windows (`pjproject.lib`).
pub const INTEGRATED_ARCHIVE_WINDOWS: &str = "pjproject.lib";

#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C141
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn integrated_archive_wins_over_per_stem_enumeration() {
        // C141 postcondition: libpjproject.a present → single "pjproject" stem.
        let root = std::env::temp_dir().join(format!("p18-1-link-record-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("libpjproject.a"), b"").unwrap();
        std::fs::write(root.join("libpjsip.a"), b"").unwrap();
        assert_eq!(derive_link_set(&root), vec!["pjproject".to_string()]);
        let _ = std::fs::remove_dir_all(&root);
    }

    /// @verifies C141
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn individual_stems_are_derived_not_hardcoded() {
        // C141 invariant: the link set comes from directory contents (read_dir),
        // never a hardcoded module array.
        let root =
            std::env::temp_dir().join(format!("p18-1-link-stem-record-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("libpjmedia.a"), b"").unwrap();
        std::fs::write(root.join("libpjsip.a"), b"").unwrap();
        let stems = derive_link_set(&root);
        assert_eq!(stems, vec!["pjmedia".to_string(), "pjsip".to_string()]);
        let _ = std::fs::remove_dir_all(&root);
    }
}
