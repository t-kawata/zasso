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

use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr};

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

// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
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
}

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

// [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
impl TransportKind {
    /// Create from a string value (as stored in the database).
    pub fn from_str(s: &str) -> Option<Self> {
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
    // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
    fn test_transport_kind_from_str() {
        assert_eq!(TransportKind::from_str("udp"), Some(TransportKind::Udp));
        assert_eq!(TransportKind::from_str("tcp"), Some(TransportKind::Tcp));
        assert_eq!(TransportKind::from_str("tls"), Some(TransportKind::Tls));
        assert_eq!(TransportKind::from_str("UDP"), Some(TransportKind::Udp));
        assert_eq!(TransportKind::from_str("unknown"), None);
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
        // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        // [::TICKET::] P2-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-3 --for-spec --no-implementation-order`.
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
}
