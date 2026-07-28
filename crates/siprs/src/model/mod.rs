// [::TICKET::] P2-3: model module — SQLite persistence schema & DatabasePool.
// The model/ directory also contains AudioChunkPair, ID design, and memory/ownership
// stubs for future tickets (P1+, P0-7).

/// SQLite persistence schema with SeaORM entities and DatabasePool.
///
/// Only compiled when the `sqlite-storage` feature is enabled.
pub mod sqlite_schema;

pub use sqlite_schema::*;
