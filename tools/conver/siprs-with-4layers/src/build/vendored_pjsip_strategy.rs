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
//   - NODE_ID=N0101:  Vendored
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0101 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Vendored PJSIP 2.17.0 version strategy (§62.32 / N0101).
//!
//! PJSIP stays pinned at 2.17.0 (C139 invariant — no upgrade path exists; the
//! latest release is the vendored one). The crate therefore *adapts* to the
//! actual 2.17.0 symbols instead of upgrading the library:
//!
//! - `PJSIP_CRED_DATA_PLAIN_PASSWD` (sip_auth.h:109) replaces the absent
//!   `PJ_CRED_DATA_PLAIN_PASSWD` — defined in [`crate::ffi::constants`].
//! - `pjsua_codec_info` in 2.17.0 exposes only `codec_id`/`priority`, so
//!   `encoding_name`/`clock_rate` are derived from a `codec_id` "mime/clock"
//!   parse (`codec_id_to_name_rate` in `config::observability_metrics`).
//! - `PJSUA_CALL_NULL` (absent from the vendored headers) is a crate-internal
//!   sentinel in [`crate::ffi::constants`].

/// Canonical vendored PJSIP version — pinned by RFC §4 / §62.32 (C139).
pub use crate::build::build_strategy_os_deps::{PjsipVersion, PJSIP_CANONICAL_VERSION};

/// The fields `pjsua_codec_info` exposes in PJSIP 2.17.0 (pjsua.h:8155).
///
/// `encoding_name` / `clock_rate` are absent — they are derived from the
/// `codec_id` string (§62.32 / N0101).
pub const VENDORED_CODEC_INFO_FIELDS: &[&str] = &["codec_id", "priority"];

#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C139
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn vendored_pjsip_is_pinned_at_2_17_0() {
        // C139 invariant: no vendored PJSIP upgrade — code adapts to 2.17.0
        // symbols rather than upgrading the library.
        assert_eq!(PJSIP_CANONICAL_VERSION, PjsipVersion::new(2, 17, 0));
    }

    /// @verifies C139
    #[test]
    // [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
    fn codec_info_surface_is_the_two_2_17_0_fields() {
        // C139 postcondition: code adapts to 2.17.0 symbols — the codec info
        // exposes only codec_id/priority, so name/rate derive from codec_id.
        assert_eq!(VENDORED_CODEC_INFO_FIELDS, &["codec_id", "priority"]);
    }
}
