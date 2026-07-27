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
//   - NODE_ID=N0009:  §7 Concurrency Model & Execution Contexts
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0009 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Concurrency model and execution contexts for the siprs crate.
//!
//! This module defines the four execution contexts that form the threading
//! foundation of the crate:
//!
//! - **User async context** — Consumer's tokio task. Submits `RuntimeCommand`
//!   variants via `CommandSender`. All public API methods are async.
//! - **Core reactor** — A dedicated OS thread (`std::thread::JoinHandle`).
//!   Single-threaded, owns all mutable runtime state, and executes every
//!   `pjsua_*` control API call sequentially via command dispatch.
//! - **PJSIP native callbacks** — C callbacks fired by PJSUA on its own
//!   internal threads. May only perform minimal work-enqueue operations:
//!   no locking, no allocation, no `.await`.
//! - **Audio worker tasks** — One per `AudioMixer` instance, running on the
//!   tokio blocking pool or a dedicated thread. Handles audio pull, mixing,
//!   resampling, pair alignment, and frame writes into a lock-free queue
//!   for the PJSIP real-time audio callback.
//!
//! ## Command serialization
//!
//! All PJSUA-facing operations are serialized through an unbounded MPSC
//! (multi-producer, single-consumer) channel. The public API sends
//! `RuntimeCommand` values into the channel; the core reactor receives and
//! executes them in FIFO order, returning results via one-shot reply channels.
//!
//! This serialization guarantees:
//! - **Send + Sync** — the `RuntimeCommand` enum and its sender handle
//!   implement `Send`, allowing thread-safe command submission.
//! - **No PJSUA exposure** — consumers never interact with PJSUA thread
//!   safety constraints directly.
//! - **Ordered execution** — commands execute sequentially on the reactor,
//!   eliminating data races on shared PJSUA state.
//!
//! ## Scalability note
//!
//! The single-reactor design targets ~30 concurrent calls (Tauri desktop app,
//! AI phone agent). For >300 concurrent calls, reactor partitioning by
//! account group would be required (RFC §7.1a).

pub mod command_serialization;

// [::TICKET::] P0-2: Public API for RuntimeCommand serialization.
// [::STUB::] P2: unused until runtime/ module consumes these types.
#[allow(unused_imports)]
pub(crate) use self::command_serialization::{CommandReceiver, CommandSender};

// [::STUB::] P2: unused until runtime/ module calls new_command_channel().
#[allow(unused_imports)]
pub(crate) use self::command_serialization::new_command_channel;
