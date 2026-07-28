
// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0026:  §18 Call State Model
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0026 --hops=2)
// ============================================================================
//
// [::TICKET::] P0-5: Call State Model — re-exports from m20_callstate_mapping

// Re-export the CallState and CallMediaState enums from the M20 implementation.
// These types are defined in m20_callstate_mapping.rs along with their
// conversion functions from PJSIP native types.
pub use crate::state::m20_callstate_mapping::{CallMediaState, CallState};
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
