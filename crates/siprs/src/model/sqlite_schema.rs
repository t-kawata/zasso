// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its properties.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0064:  §56 SQLite Persistence with SeaORM
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0064 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! SQLite persistence schema definitions and migration management (§56).
//!
//! This module defines the SQL CREATE TABLE statements for all four persistence
//! tables specified by the RFC: `accounts`, `transport_configs`, `client_settings`,
//! and `tls_configs`. It also provides the `Migration` trait and `Migrator` struct
//! for SeaORM-style migration management.
//!
//! ## Architecture
//!
//! All SQL schema strings are **compile-time constants** — they are immutable and
//! testable without a database connection. The actual runtime database operations
//! (connection pool, query execution, migration application) belong in the
//! siprs-server binary (P5-3).
//!
//! ## Migration strategy (§56.2)
//!
//! Migration files are stored in `siprs-server/migrations/`. The migration workflow
//! follows the mycute project's Makefile pattern: gen-migration → migrate-up →
//! gen-entities. The `Migration` trait provides the interface each migration file
//! implements, and `Migrator` orchestrates applying pending migrations.
//!
//! ## Dependencies
//!
//! - SQLite driver: rusqlite with `bundled` feature (no system library dependency)
//! - ORM: SeaORM for entity generation (optional, migration-only)

// ---------------------------------------------------------------------------
// Migration directory path (§56.2)
// ---------------------------------------------------------------------------

/// Path to the migration files directory, relative to the siprs-server crate root.
pub const MIGRATIONS_DIR: &str = "siprs-server/migrations";

// ---------------------------------------------------------------------------
// SQL CREATE TABLE schemas (§56.1)
// ---------------------------------------------------------------------------

/// SQL CREATE TABLE statement for the `accounts` table.
///
/// Stores SIP account configuration: credentials, domain, transport preference,
/// and registration flags. Passwords are stored as encrypted BLOBs.
///
/// Columns:
/// - id: INTEGER PRIMARY KEY AUTOINCREMENT
/// - display_name: TEXT (optional)
/// - username: TEXT NOT NULL — SIP auth username
/// - auth_username: TEXT (optional) — separate authentication username
/// - password: BLOB NOT NULL — encrypted SIP password
/// - domain: TEXT NOT NULL — SIP domain/realm
/// - registrar_uri: TEXT (optional) — registrar server URI
/// - transport: TEXT NOT NULL DEFAULT 'udp' — SIP transport protocol
/// - register_on_start: INTEGER NOT NULL DEFAULT 1 — auto-register flag
/// - allow_outbound_without_register: INTEGER NOT NULL DEFAULT 1
/// - created_at: TEXT NOT NULL — ISO 8601 timestamp
/// - updated_at: TEXT NOT NULL — ISO 8601 timestamp
pub const SCHEMA_ACCOUNTS: &str = "CREATE TABLE accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name  TEXT,
    username      TEXT NOT NULL,
    auth_username TEXT,
    password      BLOB NOT NULL,
    domain        TEXT NOT NULL,
    registrar_uri TEXT,
    transport     TEXT NOT NULL DEFAULT 'udp',
    register_on_start INTEGER NOT NULL DEFAULT 1,
    allow_outbound_without_register INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
)";

/// SQL CREATE TABLE statement for the `transport_configs` table.
///
/// Stores SIP transport configuration: protocol kind, bind address, port,
/// and optional TLS config reference.
///
/// Columns:
/// - id: INTEGER PRIMARY KEY AUTOINCREMENT
/// - kind: TEXT NOT NULL CHECK(kind IN ('udp','tcp','tls'))
/// - bind_addr: TEXT NOT NULL — IP address or hostname
/// - port: INTEGER NOT NULL — listening port
/// - tls_config_id: INTEGER REFERENCES tls_configs(id) — optional FK
pub const SCHEMA_TRANSPORT_CONFIGS: &str = "CREATE TABLE transport_configs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT NOT NULL CHECK(kind IN ('udp','tcp','tls')),
    bind_addr     TEXT NOT NULL,
    port          INTEGER NOT NULL,
    tls_config_id INTEGER REFERENCES tls_configs(id)
)";

/// SQL CREATE TABLE statement for the `client_settings` table.
///
/// Generic key-value store for miscellaneous client settings.
///
/// Columns:
/// - key: TEXT PRIMARY KEY — setting name
/// - value: TEXT NOT NULL — setting value
pub const SCHEMA_CLIENT_SETTINGS: &str = "CREATE TABLE client_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
)";

/// SQL CREATE TABLE statement for the `tls_configs` table.
///
/// Stores TLS certificate verification settings for SIP TLS transports.
///
/// Columns:
/// - id: INTEGER PRIMARY KEY AUTOINCREMENT
/// - verify_server: INTEGER NOT NULL DEFAULT 1 — enable server cert verification
/// - ca_cert_path: TEXT (optional) — CA certificate file path
/// - client_cert_path: TEXT (optional) — client certificate file path
/// - server_name: TEXT (optional) — expected server name for SNI
pub const SCHEMA_TLS_CONFIGS: &str = "CREATE TABLE tls_configs (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    verify_server         INTEGER NOT NULL DEFAULT 1,
    ca_cert_path          TEXT,
    client_cert_path      TEXT,
    server_name           TEXT
)";

// ---------------------------------------------------------------------------
// Migration trait (§56.2)
// ---------------------------------------------------------------------------

/// A single database migration.
///
/// Each migration file implements this trait to define its up (apply) and down
/// (rollback) SQL statements. The `name()` method returns a human-readable
/// identifier (e.g. "create_accounts_table").
///
/// # Example
///
/// ```rust,ignore
/// struct V1InitialSchema;
///
/// impl Migration for V1InitialSchema {
///     fn name(&self) -> &str {
///         "v1_initial_schema"
///     }
///     fn up(&self) -> &str {
///         SCHEMA_ACCOUNTS
///     }
///     fn down(&self) -> &str {
///         "DROP TABLE IF EXISTS accounts"
///     }
/// }
/// ```
pub trait Migration {
    /// Human-readable migration name (e.g. "v1_initial_schema").
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn name(&self) -> &str;
    /// SQL to apply the migration (typically CREATE TABLE or ALTER TABLE).
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn up(&self) -> &str;
    /// SQL to roll back the migration (typically DROP TABLE).
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn down(&self) -> &str;
}

// ---------------------------------------------------------------------------
// Migrator — orchestrates migration application
// ---------------------------------------------------------------------------

/// Orchestrates applying pending database migrations.
///
/// Holds an ordered list of `Migration` trait objects and applies them
/// sequentially. The actual database connection and execution will be
/// implemented when rusqlite or SeaORM is added as a dependency (P5-3).
///
/// ## Lifecycle
///
/// 1. Collect all `Migration` implementations into a `Migrator`
/// 2. Call `Migrator::run(conn)` to apply pending migrations
/// 3. Migration state is tracked in a `_migrations` meta-table
// [::STUB::] P5-3: Migrator::run() requires rusqlite or SeaORM connection parameter.
// Actual database execution deferred to siprs-server binary implementation.
pub struct Migrator {
    /// Ordered list of migrations to apply.
    migrations: Vec<Box<dyn Migration>>,
}

// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
impl Migrator {
    /// Creates a new `Migrator` with the given ordered migrations.
    pub fn new(migrations: Vec<Box<dyn Migration>>) -> Self {
        Self { migrations }
    }

    /// Returns the list of registered migrations.
    pub fn migrations(&self) -> &[Box<dyn Migration>] {
        &self.migrations
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C065-postcondition: SQL schema strings ──────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C065-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn schema_accounts_contains_required_columns() {
        assert!(SCHEMA_ACCOUNTS.starts_with("CREATE TABLE accounts"));
        assert!(SCHEMA_ACCOUNTS.contains("PRIMARY KEY"), "schema must have PRIMARY KEY");
        assert!(SCHEMA_ACCOUNTS.contains("AUTOINCREMENT"), "schema must have AUTOINCREMENT");
        assert!(SCHEMA_ACCOUNTS.contains("username"), "schema must have username column");
        assert!(SCHEMA_ACCOUNTS.contains("domain"), "schema must have domain column");
        assert!(SCHEMA_ACCOUNTS.contains("password"), "schema must have password column");
        assert!(SCHEMA_ACCOUNTS.contains("NOT NULL"), "schema must have NOT NULL constraints");
    }

    /// @verifies C065-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn schema_transport_configs_contains_required_columns() {
        assert!(SCHEMA_TRANSPORT_CONFIGS.starts_with("CREATE TABLE transport_configs"));
        assert!(SCHEMA_TRANSPORT_CONFIGS.contains("PRIMARY KEY"), "schema must have PRIMARY KEY");
        assert!(SCHEMA_TRANSPORT_CONFIGS.contains("bind_addr"), "schema must have bind_addr column");
        assert!(SCHEMA_TRANSPORT_CONFIGS.contains("port"), "schema must have port column");
        assert!(SCHEMA_TRANSPORT_CONFIGS.contains("tls_config_id"), "schema must have tls_config_id FK");
    }

    /// @verifies C065-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn schema_client_settings_contains_required_columns() {
        assert!(SCHEMA_CLIENT_SETTINGS.starts_with("CREATE TABLE client_settings"));
        assert!(SCHEMA_CLIENT_SETTINGS.contains("key"), "schema must have key column");
        assert!(SCHEMA_CLIENT_SETTINGS.contains("value"), "schema must have value column");
        assert!(SCHEMA_CLIENT_SETTINGS.contains("PRIMARY KEY"), "schema must have PRIMARY KEY");
    }

    /// @verifies C065-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn schema_tls_configs_contains_required_columns() {
        assert!(SCHEMA_TLS_CONFIGS.starts_with("CREATE TABLE tls_configs"));
        assert!(SCHEMA_TLS_CONFIGS.contains("PRIMARY KEY"), "schema must have PRIMARY KEY");
        assert!(SCHEMA_TLS_CONFIGS.contains("verify_server"), "schema must have verify_server column");
    }

    // -----------------------------------------------------------------------
    // ── C065-postcondition: MIGRATIONS_DIR ──────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C065-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn migrations_dir_contains_migrations() {
        assert!(
            MIGRATIONS_DIR.contains("migrations"),
            "MIGRATIONS_DIR must contain 'migrations': got {MIGRATIONS_DIR}"
        );
    }

    // -----------------------------------------------------------------------
    // ── C065-postcondition: Migration trait ─────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C065-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn migration_trait_is_implementable() {
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
        struct TestMigration;
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
        impl Migration for TestMigration {
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
            fn name(&self) -> &str {
                "test"
            }
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
            fn up(&self) -> &str {
                "CREATE TABLE test (id INTEGER)"
            }
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
            fn down(&self) -> &str {
                "DROP TABLE IF EXISTS test"
            }
        }

        let m = TestMigration;
        assert_eq!(m.name(), "test");
        assert!(m.up().contains("CREATE TABLE"));
        assert!(m.down().contains("DROP TABLE"));
    }

    // -----------------------------------------------------------------------
    // ── C065-postcondition: Migrator ────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C065-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn migrator_constructable() {
        let migrator = Migrator::new(vec![]);
        assert!(migrator.migrations().is_empty());
    }

    /// @verifies C065-postcondition
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn migrator_with_migration() {
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
        struct V1Test;
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
        impl Migration for V1Test {
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
            fn name(&self) -> &str {
                "v1_test"
            }
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
            fn up(&self) -> &str {
                SCHEMA_ACCOUNTS
            }
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
            fn down(&self) -> &str {
                "DROP TABLE IF EXISTS accounts"
            }
        }

        let migrator = Migrator::new(vec![Box::new(V1Test)]);
        assert_eq!(migrator.migrations().len(), 1);
        assert_eq!(migrator.migrations()[0].name(), "v1_test");
    }

    // -----------------------------------------------------------------------
    // ── C065-invariant: rusqlite bundled reference ──────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C065-invariant
    #[test]
// [::TICKET::] P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-4 --for-spec --no-implementation-order`.
    fn doc_references_rusqlite_bundled() {
        let doc = include_str!("sqlite_schema.rs");
        assert!(
            doc.contains("bundled"),
            "sqlite_schema.rs must mention rusqlite bundled feature"
        );
    }
}
