// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.





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

/// Facade layer — SipClient, SipError, ClientConfig.
/// The top-level API that application code interacts with.
pub mod client;
pub mod config;
pub mod error;

/// Account, Call, and Transport type stubs.
///
/// [::STUB::] P0-7: Full implementations with lifecycle methods.
pub mod account;
pub mod call;
pub mod transport;
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: event.rs, api/, state/ — event types, bus, conversion, routing
pub mod api;
pub mod state;
pub mod event;

// [::STUB::] P1+: audio/ — Audio processing (chunk, format, mixer, source, resampler, bridge)
// pub mod audio;

// [::STUB::] P2-4: ffi/ — PJSIP FFI bindings
// pub mod ffi;

// [::TICKET::] P0-2: runtime/ — Reactor, Command, Handle
pub mod runtime;

// [::STUB::] P1+: util/ — ID, Time, Sync utilities
// pub mod util;

// ── Public API re-exports ──────────────────────────────────────────
//
// These re-exports form the crate's public API surface. Application code
// should use these types via `siprs::SipClient`, `siprs::ClientConfig`, etc.

pub use client::SipClient;
pub use config::{AuthCredentials, ClientConfig, ClientConfigBuilder, LogLevel, ServerConfig};
pub use error::SipError;
pub use error::SipErrorKind;
// [::TICKET::] P0-5: event types and EventBus re-exports
pub use event::{
    AccountEventReceiver, AccountInfoSnapshot, CallMediaState, CallState, ConnectedCallInfo,
    DtmfReceivedInfo, DtmfSentInfo, EventBus, EventDirection, EventMeta, EventTimestamp,
    MediaActiveInfo, MediaErrorInfo, NativeEvent, RegistrationFailure, RegistrationInfo,
    SentDtmfError, SipEvent, SipEventPayload,
};
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
