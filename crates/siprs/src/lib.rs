


// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.

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

// Module declarations matching RFC §6 Module Structure (N0008).
// Each module is stub-gated behind its responsible ticket.

/// Facade layer — SipClient, SipError, ClientConfig.
/// The top-level API that application code interacts with.
pub mod client;
pub mod config;
pub mod error;

/// Account and Transport type stubs; Call is implemented (P9-3).
///
// [::STUB::] P10-3: account/call/transport lifecycle methods are deferred -- Implement account and transport configuration lifecycle methods (make, answer, hangup) per the P3-1 specification
pub mod account;
pub mod call;
pub mod transport;
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.

// [::TICKET::] P0-5: event.rs, api/, state/ — event types, bus, conversion, routing
pub mod api;
pub mod event;
pub mod state;

// [::TICKET::] P3-2: Audio mixer (mix_i16_frame) implemented in runtime/audio_worker.rs.
// [::STUB::] P11-12: audio/ module is commented out; format types exist in model/ -- Uncomment and implement higher-level audio orchestration in the audio module once model/ format types are stable
// The audio/ module remains commented out — reserved for future higher-level audio orchestration (P5+).
// pub mod audio;

// [::TICKET::] P3-2: ffi/ — PJSIP FFI bindings (safe wrappers)
pub mod ffi;

// [::TICKET::] P0-2: runtime/ — Reactor, Command, Handle
pub mod runtime;

// [::TICKET::] P1-2: security/ — SecretString, Authorization redaction, platform build notes
pub mod security;
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.

// [::TICKET::] P1-3: build/ — CI/CD matrix, Docker Integration, Prebuilt Pipeline (N0054)
pub mod build;

// [::TICKET::] P1-3: tests/ — 4-Layer Test Strategy & Dual Client Utility (N0052, N0053)
pub mod tests;

// [::TICKET::] P2-3: model/sqlite_schema — SQLite persistence schema & DatabasePool
// model/ module is unconditionally compiled — only sqlite_schema submodule
// is gated behind `sqlite-storage` feature inside model/mod.rs.
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
    RegistrationState, SentDtmfError, SipEvent, SipEventPayload,
};
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
// [::TICKET::] P3-1: Public API surface re-exports — account, call, transport config types
pub use account::SipAccountHandle;
pub use api::call_types::{AuthOverride, CallMediaPreferences, Codec, OutgoingCallRequest};
// [::TICKET::] P9-3: SipCall and the call lifecycle contract re-exports
pub use api::call_api_semantics::CallApiSemantics;
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
pub use call::{HangupReason, SipCall};
// [::TICKET::] P9-2: Audio Subscribe API re-exports
pub use api::audio_subscribe_bp::{AudioTapHandle, AudioTapMode, AudioTapSender};
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
pub use config::account_config_spec::{
    AccountCodecPolicy, AccountConfig, AccountMediaConfig, AccountTransportPolicy, DtmfMethod,
    DtmfPolicy, OpusConfig, SrtpPolicy,
};
pub use config::client_config_spec::{ClientAudioConfig, RawSipEventConfig, TimeoutConfig};
pub use config::transport_ice_spec::{
    IceConfig, TcpTransportConfig, TlsConfig, TransportConfig, TurnServerConfig, TurnTransport,
    UdpTransportConfig,
};
// StunServerConfig is NOT re-exported from transport_ice_spec to avoid name collision
// with the existing config::StunServerConfig. Use the transport_ice_spec version
// via `siprs::config::transport_ice_spec::StunServerConfig` for the RFC definition.
