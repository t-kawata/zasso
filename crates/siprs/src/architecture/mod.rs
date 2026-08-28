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
//   - NODE_ID=N0068:  §62 実装整合設計 — RESIDUE 解消のための設計判断確定
//   - NODE_ID=N0069:  62.0 進化スコープと根因
//   - NODE_ID=N0078:  62.9 I/O 境界参照情報（graphify / boundify 用）
//
// Sub-modules:
//   - crate_scope           (N0001 / N0003 / N0008)
//   - impl_integration_design (N0068 / N0069 / N0078)
//   - policy_reference      (N0060 / N0067)
//   - round2_scope_rootcause (N0079)
//   - examples_e1e5         (N0087)
//   - io_boundary_round2    (N0089)
//   - io_boundary_round3    (N0099)
//   - round3_scope_rootcause (N0090)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

pub mod crate_scope;
// [::TICKET::] P15-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-1 --for-spec --no-implementation-order`.
pub mod impl_integration_design;
pub mod policy_reference;
// [::TICKET::] P16-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-1 --for-spec --no-implementation-order`.
pub mod round2_scope_rootcause;
// [::TICKET::] P16-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-9 --for-spec --no-implementation-order`.
pub mod examples_e1e5;
pub mod io_boundary_round2;
pub mod io_boundary_round3;
// [::TICKET::] P16-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-11 --for-spec --no-implementation-order`.
// [::TICKET::] P17-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-10 --for-spec --no-implementation-order`.
// [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
pub mod round3_scope_rootcause;
// [::TICKET::] P17-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P17-1 --for-spec --no-implementation-order`.
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
pub mod round4_scope_rootcause;
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.
