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
//   - NODE_ID=N0087:  62.18 Examples 設計（E1–E5）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0087 --hops=2)
//
// Cross-referenced design context:
//   - requirement/§40 Audio Device Policy & §41 Usage Examples [NODE_ID=N0050]
//     (references → src/architecture/crate_scope.rs)
//     (references ← src/architecture/examples_e1e5.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0050 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! # 62.18 Examples 設計（E1–E5）
//!
//! Five runnable example binaries that demonstrate the siprs public API
//! (§41 Usage Examples). Each example carries an explicit Pre/Post/Invariant
//! contract (see [`EXAMPLE_CONTRACTS`]) and is verifiable on TestBackend
//! (deterministic) and Asterisk docker (real protocol, §62.19).
//!
//! ## Shared modules
//!
//! - `examples/common/cli.rs` — one `--flag value` convention, one usage
//!   message, and one `build_client_config` helper; no example re-implements
//!   argument parsing (CLI determinism invariant).
//! - `examples/common/client.rs` — `add_account_and_resolve` (account helper)
//!   and `for_sip_uri` (URI → `AccountConfig`). The RFC's `impl AccountConfig`
//!   spelling is impossible in an example crate (orphan rule E0116), so
//!   `for_sip_uri` is a free helper returning `Result<AccountConfig, CliError>`.
//!
//! ## API reconciliation with the current library (§62.18 skeleton vs. today)
//!
//! | RFC skeleton | Current API | Resolution |
//! |---|---|---|
//! | `AccountTransportPolicy::Prefer(TransportKind::Udp)` | `Udp`/`Tcp`/`Tls` enum | `AccountTransportPolicy::Udp` |
//! | `AccountCodecPolicy::default_voice()` | `Default` only | `AccountCodecPolicy::default()` |
//! | `DtmfPolicy::all_methods()` | `Default` only | literal 3-method `DtmfPolicy` (Rfc4733/Info/Inband) |
//! | `impl AccountConfig { fn for_sip_uri }` | orphan rule E0116 | free helper `for_sip_uri` |
//!
//! ## I/O boundary
//!
//! Input = CLI args (`--host`, `--port`, `--stun`, `--username`, `--domain`,
//! `--password`, `--target`, `--call-id`, `--gain`) plus each API's arguments.
//! Output = the stdout contract markers in [`EXAMPLE_CONTRACTS`] plus the
//! process exit code (0 on success, non-zero on any propagated `Err`).

/// The five example binaries fixed by §62.18, in execution order.
pub const EXAMPLE_BINARIES: [&str; 5] = [
    "client_init",
    "account_register",
    "make_call",
    "audio_tap",
    "tts_source",
];

/// (example id, RFC section, stdout contract-marker prefix) for each example.
pub const EXAMPLE_CONTRACTS: [(&str, &str, &str); 5] = [
    ("E1", "§41.1", "client initialized:"),
    ("E2", "§41.2", "registration:"),
    ("E3", "§41.3", "call placed:"),
    ("E4", "§41.4", "audio tap:"),
    ("E5", "§41.5", "tts source added:"),
];

/// Contract tests for the 62.18 Examples design (C114).
///
/// These tests pin the design's observable surface: the five example binaries
/// and their §41 contract markers.
#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C114
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn c114_precondition_module_is_wired_into_crate() {
        // Reachable through the public crate path proves src/architecture/mod.rs
        // declares `pub mod examples_e1e5;` so the crate compiles.
        let _ = crate::architecture::examples_e1e5::EXAMPLE_BINARIES.len();
    }

    /// @verifies C114
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn c114_postcondition_design_documents_all_five_examples() {
        assert_eq!(EXAMPLE_BINARIES.len(), 5);
        assert_eq!(EXAMPLE_CONTRACTS.len(), 5);
        for (id, section, marker) in EXAMPLE_CONTRACTS {
            assert!(
                !id.is_empty() && !section.is_empty() && !marker.is_empty(),
                "every example must carry a §62.18 contract marker"
            );
        }
    }

    /// @verifies C114
    #[test]
    // [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
    fn c114_invariant_examples_match_section41_usage() {
        assert_eq!(EXAMPLE_CONTRACTS[0], ("E1", "§41.1", "client initialized:"));
        assert_eq!(EXAMPLE_CONTRACTS[1], ("E2", "§41.2", "registration:"));
        assert_eq!(EXAMPLE_CONTRACTS[2], ("E3", "§41.3", "call placed:"));
        assert_eq!(EXAMPLE_CONTRACTS[3], ("E4", "§41.4", "audio tap:"));
        assert_eq!(EXAMPLE_CONTRACTS[4], ("E5", "§41.5", "tts source added:"));
    }
}
