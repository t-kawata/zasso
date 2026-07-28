// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.

// [::TICKET::] P2-3: model module — SQLite persistence schema & DatabasePool.
// The model/ directory also contains AudioChunkPair, ID design, and memory/ownership
// stubs for future tickets (P1+, P0-7).

/// ID newtypes — unconditionally compiled (not behind sqlite-storage feature)
/// since AccountId, CallId, AudioSourceId are used across the entire crate.
pub mod id_design_newtype;

pub use id_design_newtype::{AccountId, AudioSourceId, CallId};

/// SQLite persistence schema with SeaORM entities and DatabasePool.
///
/// Only compiled when the `sqlite-storage` feature is enabled.
#[cfg(feature = "sqlite-storage")]
pub mod sqlite_schema;

#[cfg(feature = "sqlite-storage")]
pub use sqlite_schema::*;
