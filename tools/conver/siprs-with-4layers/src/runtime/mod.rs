// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.

// [::TICKET::] P0-2: runtime module — entry point for reactor, command, handle, state, backend
// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.

// ============================================================================
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
//   - NODE_ID=N0009: §7 Concurrency Model & Execution Contexts
//   - NODE_ID=N0010: §7.2 RuntimeCommand & Command Serialization
//   - NODE_ID=N0045: §33 Runtime Internal State & Lock Rules
//
// Full graph exploration:
//   (cd .. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
//   (cd .. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx --hops=N)
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
// ============================================================================

// [::TICKET::] P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-4 --for-spec --no-implementation-order`.
// [::TICKET::] P19-4: §62.41 — AddAudioSource 時の RustMediaPort conf bridge 再登録 (N0110).
pub mod add_audio_source;
pub mod audio_worker;
pub mod backend;
pub mod backend_selection;
// [::TICKET::] P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-3 --for-spec --no-implementation-order`.
pub mod command;
// [::TICKET::] P16-4: §62.13 — FFI native-event drain + raw SIP publisher wiring.
pub mod event_path_wiring;
// [::TICKET::] P16-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-4 --for-spec --no-implementation-order`.
pub mod handle;
// [::TICKET::] P19-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-3 --for-spec --no-implementation-order`.
pub mod push_media_frame;
pub mod reactor;
pub mod state;

pub use audio_worker::{AsyncAudioSource, AudioMixer, AudioWorkerTask, MockAsyncAudioSource};
pub use backend::SipBackend;
// [::TICKET::] P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-4 --for-spec --no-implementation-order`.
pub use command::{DebugBox, Reply, RuntimeCommand};
pub use handle::RuntimeHandle;
pub use reactor::CoreReactor;
pub use state::ClientState;
