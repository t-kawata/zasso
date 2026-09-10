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
//   - NODE_ID=N0104:  build.rs
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0104 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! build.rs 4-stage resolution pipeline (§62.35 / N0104).
//!
//! `resolve_pjsip` walks the §28.1 search order: prebuilt
//! (`vendor/prebuilt/<target>/lib`) → system (pkg-config/env) → vendored-source
//! CMake build → **fail-stop panic** when no PJSIP is obtainable (C142 — no
//! `cargo:warning`-and-continue). `SIPRS_STAGE_PREBUILT=1` stages a successful
//! vendored build into `vendor/prebuilt/<target>/`; a normal consumer build
//! never writes the vendor tree (§5.2(b)).
//!
//! The canonical pipeline lives in [`crate::build::build_script_bindgen`]
//! (`resolve_pjsip` / `ResolvedPjsip` / `should_stage_prebuilt`); this module
//! re-exports them as the design record.

/// The 4-stage PJSIP resolution result (§62.35 / N0104).
pub use crate::build::build_script_bindgen::{resolve_pjsip, should_stage_prebuilt, ResolvedPjsip};

/// Environment variable that enables the producer staging mode (§5.2(b)).
pub const STAGE_PREBUILT_ENV: &str = "SIPRS_STAGE_PREBUILT";

#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C138
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn prebuilt_is_consulted_before_system() {
        // C138 invariant: §28.1 step 1 (prebuilt lib dir) is consulted before
        // the system install — prebuilt-first order preserved.
        let prebuilt = std::path::PathBuf::from("/tmp/p18-1-record/prebuilt/lib");
        let resolved = resolve_pjsip(
            Some(prebuilt.clone()),
            Some("/tmp/p18-1-record/system".into()),
            true,
        );
        assert_eq!(resolved, ResolvedPjsip::Prebuilt(prebuilt));
    }

    /// @verifies C142
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn fails_stop_when_no_pjsip_obtainable() {
        // C142 invariant: no prebuilt, no system, no cmake → panic; the
        // warning-and-continue path is prohibited.
        let result = std::panic::catch_unwind(|| resolve_pjsip(None, None, false));
        assert!(
            result.is_err(),
            "fail-stop: must panic, never warning-and-continue"
        );
    }

    /// @verifies C142
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn staging_mode_is_opt_in_via_env_flag() {
        // §5.2(b): the env var NAME is SIPRS_STAGE_PREBUILT and the value must
        // be "1" to enable staging; unset/0 keeps the consumer build read-only
        // over vendor/.
        assert_eq!(STAGE_PREBUILT_ENV, "SIPRS_STAGE_PREBUILT");
        assert!(should_stage_prebuilt(Ok("1".to_string())));
        assert!(!should_stage_prebuilt(Ok("0".to_string())));
        assert!(!should_stage_prebuilt(Err(std::env::VarError::NotPresent)));
    }
}
