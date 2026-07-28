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
/// [::STUB::] P3-1/P5-1: Full implementations with lifecycle methods (account/call/transport in P3-1, call API semantics in P5-1).
pub mod account;
pub mod call;
pub mod transport;
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: event.rs, api/, state/ — event types, bus, conversion, routing
pub mod api;
pub mod event;
pub mod state;

// [::STUB::] P3-2/P4-2: audio/ — Audio processing (mixer in P3-2, format in P4-2)
// pub mod audio;

// [::STUB::] P3-2: ffi/ — PJSIP FFI bindings
// pub mod ffi;

// [::TICKET::] P0-2: runtime/ — Reactor, Command, Handle
pub mod runtime;

// [::TICKET::] P1-2: security/ — SecretString, Authorization redaction, platform build notes
pub mod security;
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.

// [::TICKET::] P1-3: build/ — CI/CD matrix, Docker Integration, Prebuilt Pipeline (N0054)
pub mod build;

// [::TICKET::] P1-3: tests/ — 4-Layer Test Strategy & Dual Client Utility (N0052, N0053)
pub mod tests;

// [::STUB::] P4-1: util/ — ID, Time, Sync utilities (newtype IDs in P4-1)
// pub mod util;

// [::TICKET::] P2-3: model/sqlite_schema — SQLite persistence schema & DatabasePool
// Only compiled when `sqlite-storage` feature is enabled.
#[cfg(feature = "sqlite-storage")]
pub mod model;

// ── Public API re-exports ──────────────────────────────────────────
//
// These re-exports form the crate's public API surface. Application code
// should use these types via `siprs::SipClient`, `siprs::ClientConfig`, etc.

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
pub use client::SipClient;
pub use config::{
    AuthConfig, AuthCredentials, AuthMode, ClientConfig, ClientConfigBuilder, ConfigError,
    LogLevel, ServerConfig, StunServerConfig,
};
pub use error::SipError;
pub use error::SipErrorKind;
// [::TICKET::] P1-2: SecretString re-export from security module
pub use security::SecretString;
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
// [::TICKET::] P0-5: event types and EventBus re-exports
pub use event::{
    AccountEventReceiver, AccountInfoSnapshot, CallMediaState, CallState, ConnectedCallInfo,
    DtmfReceivedInfo, DtmfSentInfo, EventBus, EventDirection, EventMeta, EventTimestamp,
    MediaActiveInfo, MediaErrorInfo, NativeEvent, RegistrationFailure, RegistrationInfo,
    SentDtmfError, SipEvent, SipEventPayload,
};
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
