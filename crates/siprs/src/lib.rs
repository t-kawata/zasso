// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.

// ============================================================================
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC.
// Each node captures a distinct architectural concern that must be carefully implemented
// with attention to its relationships.
//
// Graph:        ../RFC-ROOT-GRAPH.json
// Directory:    ../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0007: §5 Functional Requirements — Normative Scope
//     → To show details: (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0007 --hops=2)
//   - NODE_ID=N0008: §6 Module Structure & Crate Responsibility
//     → To show details: (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0008 --hops=2)
//
// Cross-referenced design context:
//   - architecture/§1 Purpose — Responsibilities of this crate [NODE_ID=N0001]
//     (part_of ← src/lib.rs)
//     → (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0001 --hops=2)
//
// Full graph exploration:
//   (cd .. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N>)
// ============================================================================

// [::STUB::] P0-1: Crate foundation — module declarations only.
// Full module implementations are added incrementally in downstream tickets:
//   P0-2: Concurrency Model (runtime/)
//   P0-3: Crate Purpose & Architecture (client.rs, config.rs)
//   P0-4: Error Design (error.rs)
//   P0-5: Event System (event.rs)
//   P0-6: Runtime Infrastructure (runtime/, ffi/)
//   P1+: Audio processing (audio/), Util (util/), Transport (transport.rs)

// Module declarations matching RFC §6 Module Structure (N0008).
// Each module is stub-gated behind its responsible ticket.

// [::STUB::] P0-3: client.rs — SipClient public API
// pub mod client;

// [::STUB::] P0-3: config.rs — ClientConfig, AccountConfig, TransportConfig
// pub mod config;

// [::STUB::] P0-3: account.rs — SipAccount management
// pub mod account;

// [::STUB::] P0-3: call.rs — SipCall lifecycle
// pub mod call;

// [::STUB::] P0-3: transport.rs — Transport management
// pub mod transport;

// [::STUB::] P0-5: event.rs — SipEventPayload, EventBus
// pub mod event;

// [::STUB::] P0-4: error.rs — SipError, SipErrorKind
// pub mod error;

// [::STUB::] P1+: audio/ — Audio processing (chunk, format, mixer, source, resampler, bridge)
// pub mod audio;

// [::STUB::] P0-6: ffi/ — PJSIP FFI bindings
// pub mod ffi;

// [::TICKET::] P0-2: runtime/ — Reactor, Command, Handle
pub mod runtime;

// [::STUB::] P1+: util/ — ID, Time, Sync utilities
// pub mod util;
