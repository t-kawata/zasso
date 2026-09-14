// [::TICKET::] P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-5 --for-spec --no-implementation-order`.
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.

// ============================================================================
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC.
//
// Graph:        ../RFC-ROOT-GRAPH.json
// Directory:    ../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0007: §5 Functional Requirements — Normative Scope
//     → To show details: (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --id=N0007 --hops=2)
//   - NODE_ID=N0008: §6 Module Structure & Crate Responsibility
//
// Full graph exploration:
//   (cd .. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json")
// ============================================================================

/// Facade layer — the top-level API that application code interacts with.
pub mod client;
pub mod error;

/// Audio-only session identifier.
pub const SESSION_ID_PREFIX: &str = "sip-session";
