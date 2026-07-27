// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        RFC-ROOT-GRAPH.json
// Directory:    RFC-ROOT-Dirs-Tree.json
// Original RFC: RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0001:  §1 Purpose — Responsibilities of this crate
//     → To show details: node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0001 --hops=2
//
// Cross-referenced design context:
//   - requirement/§1a M20 Implementation Priority Map [NODE_ID=N0002]
//     (refines ← src/lib.rs)
//   - architecture/§2 Non-goals & Tauri Integration Boundary [NODE_ID=N0003]
//     (constrains ← src/lib.rs)
//   - glossary/§3 Terminology [NODE_ID=N0004]
//     (references ← src/lib.rs)
//   - requirement/§4 Compliance Requirements [NODE_ID=N0005]
//     (constrains ← src/lib.rs)
//   - requirement/§5 Functional Requirements — Normative Scope [NODE_ID=N0007]
//     (implements ← src/lib.rs)
//   - architecture/§6 Module Structure & Crate Responsibility [NODE_ID=N0008]
//     (part_of ← src/lib.rs)
//   - architecture/§7 Concurrency Model & Execution Contexts [NODE_ID=N0009]
//     (depends_on ← src/lib.rs)
//   - requirement/§32 Shutdown Specification [NODE_ID=N0043]
//     (depends_on ← src/lib.rs)
//   - requirement/§34 Observability — Tracing, Metrics & Capabilities [NODE_ID=N0046]
//     (references ← src/lib.rs)
//   - requirement/§35 Security & §36 Platform Differences [NODE_ID=N0047]
//     (constrains ← src/lib.rs)
//   - architecture/§40 Audio Device Policy & §41 Usage Examples [NODE_ID=N0050]
//     (references ← src/lib.rs)
//   - architecture/§45 Implementation Challenges & §46 Panic Policy [NODE_ID=N0055]
//     (references ← src/lib.rs)
//   - architecture/§51 Conclusion [NODE_ID=N0058]
//     (references ← src/lib.rs)
//   - architecture/§61 I/O Boundary Reference Information [NODE_ID=N0067]
//     (references ← src/lib.rs)
//
// Full graph exploration:
//   (cd .. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! # siprs — Safe asynchronous SIP voice communication via PJSUA
//!
//! siprs provides a safe Rust async wrapper around PJSUA (PJSIP) for SIP-based
//! voice communication. It wraps PJSUA FFI bindings in a safe Rust layer and
//! provides an asynchronous event-driven SIP client.
//!
//! ## Design constraints
//!
//! - **Audio-only**: This crate provides audio communication only — no video,
//!   recording files, or GUI.
//! - **Async-first**: All public APIs are async (tokio-native), with a
//!   single-threaded reactor core.
//! - **FFI-safe**: Unsafe PJSUA access is isolated to the `ffi` module.
//!
//! ## Module structure
//!
//! The crate follows a layered architecture:
//! - `config` — Configuration types (ClientConfig, AccountConfig, versioning policy)
//! - `ffi` — PJSIP FFI bindings and safe wrappers
//! - `runtime` — Async reactor, command dispatch, and event handling
//! - `audio` — Audio pipeline (chunk, format, mixer, source, resampler, bridge)
//! - `util` — Shared utilities (ID types, time, synchronization)
//!
//! ## Feature flags
//!
//! - `serde` — Enables serde Serialize/Deserialize on public types
//! - `tls` — Enables TLS transport support
//! - `srtp` — Enables SRTP support

#![forbid(unsafe_code)]
// [::STUB::] P0-4: unsafe_code will be allowed once ffi/ module is implemented

pub mod concurrency_contexts;
pub mod config;
// [::TICKET::] P0-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
