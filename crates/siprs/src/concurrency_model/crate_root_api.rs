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
//   - NODE_ID=N0016:  §8.1 crateルート公開API
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0016 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::STUB::] P0-4: Type re-exports from other modules are pending.
// This module defines the paths that will re-export types to lib.rs.
// Re-export markers are commented out until the source modules exist.

// Crate root public API — re-exported from lib.rs.
//
// These `pub use` chains form the crate's external contract.
// Each commented line indicates a re-export destination that will be
// activated when the corresponding module is implemented.
//
// [::STUB::] P0-4: pub use crate::client::SipClient;
// [::STUB::] P0-4: pub use crate::config::{ClientConfig, AccountConfig, ...};
// [::STUB::] P0-4: pub use crate::account::{AccountId, SipAccountHandle, ...};
// [::STUB::] P0-4: pub use crate::call::{CallId, CallState, OutgoingCallRequest, ...};
// [::STUB::] P0-4: pub use crate::audio::{AudioChunkPair, ...};
// [::STUB::] P0-4: pub use crate::event::{SipEvent, SipEventPayload, EventBus, ...};
// [::STUB::] P0-4: pub use crate::error::{SipError, SipErrorKind};
// [::STUB::] P0-4: pub use crate::transport::*;
