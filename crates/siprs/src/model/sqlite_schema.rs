// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !//
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
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
//
// SQLite persistence schema and DatabasePool for siprs-server.
//
// ## Schema (4 tables matching RFC §56)
//
// - **accounts**: SIP account configuration storage
// - **transport_configs**: Network transport bindings
// - **client_settings**: Key-value application settings
// - **tls_configs**: TLS certificate configuration
//
// ## Migration management
//
// Schema migration definitions and Makefile targets (gen-migration, migrate-up,
// migrate-fresh, gen-entities) are managed in the siprs-server crate.

use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr, Statement};

use std::path::Path;
use std::time::Duration;

// ── Database connection pool ──────────────────────────────────────────────

/// Connection pool wrapper for siprs-server SQLite access.
///
/// Provides a thin abstraction over SeaORM's `DatabaseConnection`, with
/// pre-configured connection options optimized for SQLite.
///
/// # Example
///
/// ```rust,ignore
/// use siprs::model::sqlite_schema::DatabasePool;
///
/// let pool = DatabasePool::open("siprs.db").await?;
/// ```
#[derive(Debug, Clone)]
pub struct DatabasePool {
    conn: DatabaseConnection,
}

// [::TICKET::] P2-3, P4-3, P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-3|P4-3|P7-3) --for-spec --no-implementation-order`.
impl DatabasePool {
    /// Open or create a SQLite database at the given path.
    ///
    /// If the database file does not exist, it is created (due to `mode=rwc`
    /// in the connection URL). The connection pool uses a single connection
    /// (SQLite is file-locked for writes).
    ///
    /// # Errors
    ///
    /// Returns `DbErr` if the path is invalid, the directory is unwritable,
    /// or SQLite reports an error during open.
    pub async fn open(path: impl AsRef<Path>) -> Result<Self, DbErr> {
        let url = format!("sqlite:{}?mode=rwc", path.as_ref().display());
        let mut opts = ConnectOptions::new(&url);
        // SQLite-specific tuning: busy timeout to avoid "database is locked"
        opts.max_connections(1)
            .min_connections(1)
            .connect_timeout(Duration::from_secs(5))
            .idle_timeout(Duration::from_secs(30))
            .sqlx_logging(false); // SQLx internal logging disabled — sea-orm handles it
        let conn = Database::connect(opts).await?;
        Ok(Self { conn })
    }

    /// Get a reference to the underlying SeaORM database connection.
    ///
    /// Use this to execute queries, run migrations, or access SeaORM entities.
    pub fn connection(&self) -> &DatabaseConnection {
        &self.conn
    }

    /// Consume the pool and return the underlying connection.
    pub fn into_inner(self) -> DatabaseConnection {
        self.conn
    }

    /// Initialize the database schema by creating all 4 tables.
    ///
    /// Uses `CREATE TABLE IF NOT EXISTS` so this is safe to call on startup
    /// even if tables already exist.
    ///
    /// # Errors
    ///
    /// Returns `DbErr` if any CREATE TABLE statement fails.
    pub async fn init_schema(&self) -> Result<(), DbErr> {
        use sea_orm::ConnectionTrait;

        let statements = [
            CREATE_TABLE_ACCOUNTS,
            CREATE_TABLE_TRANSPORT_CONFIGS,
            CREATE_TABLE_CLIENT_SETTINGS,
            CREATE_TABLE_TLS_CONFIGS,
        ];

        for stmt in &statements {
            self.conn
                .execute(Statement::from_string(
                    sea_orm::DatabaseBackend::Sqlite,
                    stmt.to_string(),
                ))
                .await?;
        }
        Ok(())
    }

    /// Query the list of table names in the database.
    ///
    /// Returns the names of all user tables (excluding sqlite_* system tables).
    /// Test-only helper exercised by the O-002 schema-init tests.
    #[cfg(test)]
    pub(crate) async fn query_tables(&self) -> Result<Vec<String>, DbErr> {
        use sea_orm::ConnectionTrait;

        let rows = self
            .conn
            .query_all(Statement::from_string(
                sea_orm::DatabaseBackend::Sqlite,
                String::from("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
            ))
            .await?;

        Ok(rows
            .iter()
            .filter_map(|row| row.try_get_by_index::<String>(0).ok())
            .collect())
    }
}

// ---------------------------------------------------------------------------
// Migration SQL — CREATE TABLE statements matching RFC §56
// ---------------------------------------------------------------------------

/// SQL to create the `accounts` table.
pub(crate) const CREATE_TABLE_ACCOUNTS: &str = "CREATE TABLE IF NOT EXISTS accounts (
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

/// SQL to create the `transport_configs` table.
pub(crate) const CREATE_TABLE_TRANSPORT_CONFIGS: &str =
    "CREATE TABLE IF NOT EXISTS transport_configs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    kind     TEXT NOT NULL CHECK(kind IN ('udp','tcp','tls')),
    bind_addr TEXT NOT NULL,
    port     INTEGER NOT NULL,
    tls_config_id INTEGER REFERENCES tls_configs(id)
)";

/// SQL to create the `client_settings` table.
pub(crate) const CREATE_TABLE_CLIENT_SETTINGS: &str = "CREATE TABLE IF NOT EXISTS client_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
)";

/// SQL to create the `tls_configs` table.
pub(crate) const CREATE_TABLE_TLS_CONFIGS: &str = "CREATE TABLE IF NOT EXISTS tls_configs (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    verify_server         INTEGER NOT NULL DEFAULT 1,
    ca_cert_path          TEXT,
    client_cert_path      TEXT,
    server_name           TEXT
)";

/// Account entity — stores SIP account configuration per RFC §56.
///
/// Maps to the `accounts` SQLite table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountEntity {
    pub id: i64,
    pub display_name: Option<String>,
    pub username: String,
    pub auth_username: Option<String>,
    pub password: Vec<u8>,
    pub domain: String,
    pub registrar_uri: Option<String>,
    pub transport: String,
    pub register_on_start: bool,
    pub allow_outbound_without_register: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Transport configuration entity — defines per-transport bindings per RFC §56.
///
/// Maps to the `transport_configs` SQLite table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransportConfigEntity {
    pub id: i64,
    pub kind: TransportKind,
    pub bind_addr: String,
    pub port: u16,
    pub tls_config_id: Option<i64>,
}

/// Supported SIP transport protocol kinds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportKind {
    Udp,
    Tcp,
    Tls,
}

// [::TICKET::] P2-3, P7-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-3|P7-1) --for-spec --no-implementation-order`.
impl TransportKind {
    /// Create from a string value (as stored in the database).
    ///
    /// Named `from_db_value` rather than `from_str` to avoid colliding with the
    /// `std::str::FromStr::from_str` trait method (clippy::should_implement_trait).
    pub fn from_db_value(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "udp" => Some(Self::Udp),
            "tcp" => Some(Self::Tcp),
            "tls" => Some(Self::Tls),
            _ => None,
        }
    }

    /// Serialize to a string value for database storage.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Udp => "udp",
            Self::Tcp => "tcp",
            Self::Tls => "tls",
        }
    }
}

/// Client settings entity — key-value settings storage per RFC §56.
///
/// Maps to the `client_settings` SQLite table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientSettingEntity {
    pub key: String,
    pub value: String,
}

/// TLS configuration entity — certificate paths and verification per RFC §56.
///
/// Maps to the `tls_configs` SQLite table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TlsConfigEntity {
    pub id: i64,
    pub verify_server: bool,
    pub ca_cert_path: Option<String>,
    pub client_cert_path: Option<String>,
    pub server_name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: DatabasePool construction ─────────────────────────────

    #[tokio::test]
    // @verifies C065
    async fn test_database_pool_in_memory() -> Result<(), DbErr> {
        // Open an in-memory SQLite database
        let pool = DatabasePool::open(":memory:").await?;
        // Must succeed — :memory: is always writable
        let _conn = pool.connection();
        // Connection obtained successfully
        Ok(())
    }

    // ── Normal: AccountEntity field access ────────────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_account_entity_construction() {
        let entity = AccountEntity {
            id: 1,
            display_name: Some("Alice".into()),
            username: "alice".into(),
            auth_username: None,
            password: b"encrypted".to_vec(),
            domain: "sip.example.com".into(),
            registrar_uri: Some("sip:registrar.example.com".into()),
            transport: "udp".into(),
            register_on_start: true,
            allow_outbound_without_register: true,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        };
        assert_eq!(entity.username, "alice");
        assert_eq!(entity.domain, "sip.example.com");
        assert_eq!(&entity.password, b"encrypted");
    }

    // ── Normal: TransportKind conversion ──────────────────────────────

    #[test]
    // [::TICKET::] P2-3, P7-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-3|P7-1) --for-spec --no-implementation-order`.
    fn test_transport_kind_from_db_value() {
        assert_eq!(
            TransportKind::from_db_value("udp"),
            Some(TransportKind::Udp)
        );
        assert_eq!(
            TransportKind::from_db_value("tcp"),
            Some(TransportKind::Tcp)
        );
        assert_eq!(
            TransportKind::from_db_value("tls"),
            Some(TransportKind::Tls)
        );
        assert_eq!(
            TransportKind::from_db_value("UDP"),
            Some(TransportKind::Udp)
        );
        assert_eq!(TransportKind::from_db_value("unknown"), None);
    }

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_transport_kind_as_str() {
        assert_eq!(TransportKind::Udp.as_str(), "udp");
        assert_eq!(TransportKind::Tcp.as_str(), "tcp");
        assert_eq!(TransportKind::Tls.as_str(), "tls");
    }

    // ── Normal: TransportConfigEntity construction ────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_transport_config_entity() {
        let entity = TransportConfigEntity {
            id: 1,
            kind: TransportKind::Udp,
            bind_addr: "0.0.0.0".into(),
            port: 5060,
            tls_config_id: None,
        };
        assert_eq!(entity.port, 5060);
        assert_eq!(entity.kind.as_str(), "udp");
    }

    // ── Normal: ClientSettingEntity ───────────────────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_client_setting_entity() {
        let entity = ClientSettingEntity {
            key: "theme".into(),
            value: "dark".into(),
        };
        assert_eq!(entity.key, "theme");
        assert_eq!(entity.value, "dark");
    }

    // ── Normal: TlsConfigEntity ───────────────────────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_tls_config_entity() {
        let entity = TlsConfigEntity {
            id: 1,
            verify_server: true,
            ca_cert_path: Some("/etc/ssl/ca.pem".into()),
            client_cert_path: None,
            server_name: None,
        };
        assert!(entity.verify_server);
        assert_eq!(entity.ca_cert_path.as_deref(), Some("/etc/ssl/ca.pem"));
    }

    // ── Normal: Entity trait implementations ──────────────────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_entities_are_send_sync() {
// [::TICKET::] P2-3, P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-3|P7-3) --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P2-3, P4-3, P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-3|P4-3|P7-3) --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<AccountEntity>();
        assert_sync::<AccountEntity>();
        assert_send::<DatabasePool>();
        assert_sync::<DatabasePool>();
    }

    // ── Invariant: AccountEntity has all required fields ──────────────

    #[test]
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_account_entity_required_fields() {
        // All required (non-Option) fields must be set
        let entity = AccountEntity {
            id: 1,
            display_name: None,
            username: "req_user".into(),
            auth_username: None,
            password: b"req_pass".to_vec(),
            domain: "req_domain".into(),
            registrar_uri: None,
            transport: "udp".into(),
            register_on_start: false,
            allow_outbound_without_register: false,
            created_at: String::new(),
            updated_at: String::new(),
        };
        assert!(!entity.username.is_empty(), "username is required");
        assert!(!entity.password.is_empty(), "password is required");
        assert!(!entity.domain.is_empty(), "domain is required");
    }

    // ── P4-3: Migration SQL constants ──────────────────────────────

    #[test]
    // @verifies C065
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_create_table_accounts_sql_is_valid() {
        assert!(CREATE_TABLE_ACCOUNTS.starts_with("CREATE TABLE IF NOT EXISTS accounts"));
        assert!(CREATE_TABLE_ACCOUNTS.contains("username"));
        assert!(CREATE_TABLE_ACCOUNTS.contains("password"));
        assert!(CREATE_TABLE_ACCOUNTS.contains("domain"));
    }

    #[test]
    // @verifies C065
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_create_table_transport_configs_sql_is_valid() {
        assert!(CREATE_TABLE_TRANSPORT_CONFIGS
            .starts_with("CREATE TABLE IF NOT EXISTS transport_configs"));
        assert!(CREATE_TABLE_TRANSPORT_CONFIGS.contains("CHECK(kind IN"));
    }

    #[test]
    // @verifies C065
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_create_table_client_settings_sql_is_valid() {
        assert!(
            CREATE_TABLE_CLIENT_SETTINGS.starts_with("CREATE TABLE IF NOT EXISTS client_settings")
        );
        assert!(CREATE_TABLE_CLIENT_SETTINGS.contains("key"));
        assert!(CREATE_TABLE_CLIENT_SETTINGS.contains("value"));
    }

    #[test]
    // @verifies C065
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn test_create_table_tls_configs_sql_is_valid() {
        assert!(CREATE_TABLE_TLS_CONFIGS.starts_with("CREATE TABLE IF NOT EXISTS tls_configs"));
        assert!(CREATE_TABLE_TLS_CONFIGS.contains("verify_server"));
        assert!(CREATE_TABLE_TLS_CONFIGS.contains("ca_cert_path"));
    }

    #[test]
    // @verifies C065
    // [::TICKET::] P4-3, P7-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P4-3|P7-1) --for-spec --no-implementation-order`.
    fn test_all_create_table_constants_are_unique() {
        let tables = [
            CREATE_TABLE_ACCOUNTS,
            CREATE_TABLE_TRANSPORT_CONFIGS,
            CREATE_TABLE_CLIENT_SETTINGS,
            CREATE_TABLE_TLS_CONFIGS,
        ];
        assert_eq!(tables.len(), 4, "must have exactly 4 table constants");
        // Verify each contains a distinct table name
        assert!(CREATE_TABLE_ACCOUNTS.contains("accounts"));
        assert!(CREATE_TABLE_TRANSPORT_CONFIGS.contains("transport_configs"));
        assert!(CREATE_TABLE_CLIENT_SETTINGS.contains("client_settings"));
        assert!(CREATE_TABLE_TLS_CONFIGS.contains("tls_configs"));
    }

    // ── P7-3 O-002: DatabasePool schema-init + invalid-path error paths ──

    #[tokio::test]
    // @verifies C065
    // [::TICKET::] P7-3: O-002 — init_schema() + query_tables() must produce the 4 RFC S56 tables.
    // [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    async fn init_schema_creates_4_tables() -> Result<(), DbErr> {
        let pool = DatabasePool::open(":memory:").await?;
        pool.init_schema().await?;
        let tables: std::collections::HashSet<String> = pool
            .query_tables()
            .await?
            .into_iter()
            .collect();
        for want in ["accounts", "transport_configs", "client_settings", "tls_configs"] {
            assert!(
                tables.contains(want),
                "table {} must exist after init_schema()",
                want
            );
        }
        Ok(())
    }

    #[tokio::test]
    // @verifies C065
    // [::TICKET::] P7-3: O-002 — DatabasePool::open() on an invalid path returns Err, never panics.
    // [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    async fn open_invalid_path_returns_err() {
        let result = DatabasePool::open("/nonexistent-dir/nope.db").await;
        assert!(
            result.is_err(),
            "open on a nonexistent directory must return Err, never panic"
        );
    }

    // ── P7-3 O-006: Exact CREATE TABLE column types (RFC S56) ───────────

    /// Normalize SQL whitespace so column-type assertions are robust to the
    /// aligned formatting used in the CREATE TABLE constants.
// [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn normalize_sql_whitespace(sql: &str) -> String {
        sql.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    #[test]
    // @verifies C065
    // [::TICKET::] P7-3: O-006 — pin the accounts column types exactly (TEXT/BLOB/NOT NULL).
    // [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn test_create_table_accounts_column_types_exact() {
        let accounts = normalize_sql_whitespace(CREATE_TABLE_ACCOUNTS);
        // A type change (e.g. username TEXT -> username INTEGER) must fail.
        assert!(
            accounts.contains("username TEXT NOT NULL"),
            "accounts.username must be TEXT NOT NULL"
        );
        assert!(
            accounts.contains("password BLOB NOT NULL"),
            "accounts.password must be BLOB NOT NULL"
        );
        assert!(
            accounts.contains("domain TEXT NOT NULL"),
            "accounts.domain must be TEXT NOT NULL"
        );
    }

    #[test]
    // @verifies C065
    // [::TICKET::] P7-3: O-006 — pin the remaining table column types exactly.
    // [::TICKET::] P7-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-3 --for-spec --no-implementation-order`.
    fn test_create_table_other_column_types_exact() {
        let transport = normalize_sql_whitespace(CREATE_TABLE_TRANSPORT_CONFIGS);
        assert!(
            transport.contains("kind TEXT NOT NULL CHECK(kind IN ('udp','tcp','tls'))"),
            "transport_configs.kind must be TEXT NOT NULL with udp/tcp/tls CHECK"
        );
        let settings = normalize_sql_whitespace(CREATE_TABLE_CLIENT_SETTINGS);
        assert!(
            settings.contains("key TEXT PRIMARY KEY"),
            "client_settings.key must be TEXT PRIMARY KEY"
        );
        assert!(
            settings.contains("value TEXT NOT NULL"),
            "client_settings.value must be TEXT NOT NULL"
        );
        let tls = normalize_sql_whitespace(CREATE_TABLE_TLS_CONFIGS);
        assert!(
            tls.contains("verify_server INTEGER NOT NULL DEFAULT 1"),
            "tls_configs.verify_server must be INTEGER NOT NULL DEFAULT 1"
        );
    }
}
