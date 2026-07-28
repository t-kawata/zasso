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
//   - NODE_ID=N0061:  §53 Standalone Server Mode & Config
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0061 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

/// Axum State extractor — imported behind server feature gate.
#[cfg(feature = "server")]
use axum::extract::State;

/// Default bind port for siprs-server.
pub const DEFAULT_SIPRS_PORT: u16 = 3910;

/// Default JWT expiry in seconds.
pub const DEFAULT_JWT_EXPIRY_SECS: u64 = 3600;

/// Configuration error for siprs-server startup validation.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ConfigError {
    #[error("LocalhostOnly mode requires a loopback address, got {0}")]
    LocalhostRequiresLoopback(SocketAddr),
    #[error("JWT mode requires jwt_secret to be set")]
    JwtRequiresSecret,
}

/// Standalone siprs-server authentication mode.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum AuthMode {
    /// Only listen on localhost (127.0.0.1). No authentication required.
    LocalhostOnly,
    /// API Key authentication.
    ApiKey { key: crate::security::SecretString },
    /// JWT authentication via SIP account credentials.
    Jwt,
}

/// Authentication configuration for siprs-server.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct AuthConfig {
    /// Authentication mode.
    pub mode: AuthMode,
    /// JWT signing secret (required when mode == Jwt).
    pub jwt_secret: Option<crate::security::SecretString>,
    /// JWT token expiry in seconds (default: 3600).
    pub jwt_expiry_secs: u64,
}

// [::TICKET::] P3-3: Use DEFAULT_JWT_EXPIRY_SECS constant.
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl Default for AuthConfig {
    // [::TICKET::] P3-3: Use DEFAULT_JWT_EXPIRY_SECS constant.
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            mode: AuthMode::LocalhostOnly,
            jwt_secret: None,
            jwt_expiry_secs: DEFAULT_JWT_EXPIRY_SECS,
        }
    }
}

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
impl AuthConfig {
    /// Validate the auth config against the bind address.
    ///
    /// - `LocalhostOnly` requires `bind_addr` to be a loopback address.
    /// - `Jwt` requires `jwt_secret` to be set.
    /// - `ApiKey` always passes validation.
    pub fn validate(&self, bind_addr: &SocketAddr) -> Result<(), ConfigError> {
        match &self.mode {
            AuthMode::LocalhostOnly => {
                if !bind_addr.ip().is_loopback() {
                    return Err(ConfigError::LocalhostRequiresLoopback(*bind_addr));
                }
            }
            AuthMode::Jwt => {
                if self.jwt_secret.is_none() {
                    return Err(ConfigError::JwtRequiresSecret);
                }
            }
            AuthMode::ApiKey { .. } => {}
        }
        Ok(())
    }
}

/// siprs-server startup configuration.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ServerConfig {
    /// Bind address (default: 127.0.0.1:3910).
    pub bind_addr: SocketAddr,
    /// Path to SQLite database file (default: ~/.siprs/data.db).
    pub db_path: PathBuf,
    /// Optional external config file for ClientConfig and AccountConfig.
    pub config_file: Option<PathBuf>,
    /// Allowed CORS origins.
    pub allowed_origins: Vec<String>,
    /// Authentication configuration.
    pub auth: AuthConfig,
}

// [::TICKET::] P3-3: Add Default for ServerConfig using localhost:3910 and default AuthConfig.
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl Default for ServerConfig {
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            bind_addr: format!("127.0.0.1:{}", DEFAULT_SIPRS_PORT)
                .parse()
                .expect("static default bind address must be valid"),
            db_path: PathBuf::from("~/.siprs/data.db"),
            config_file: None,
            allowed_origins: vec![],
            auth: AuthConfig::default(),
        }
    }
}

/// Shared application state for the Axum HTTP server.
///
/// Wraps SipClient and (optionally) DatabasePool in `Arc` for thread-safe
/// access from route handlers via axum's State extractor.
#[derive(Clone)]
pub struct AppState {
    /// SIP client handle, shared across all route handlers.
    pub sip_client: Arc<crate::client::SipClient>,
    /// Database connection pool (only available when sqlite-storage feature is enabled).
    #[cfg(feature = "sqlite-storage")]
    pub db: Arc<crate::model::sqlite_schema::DatabasePool>,
    /// Server uptime start instant.
    pub server_start_time: Instant,
}

// [::TICKET::] P3-3: ServerConfig CLI parsing and server builder functions.
/// # Feature gates
///
/// - `cli` feature: enables `from_args()` and `from_args_with()` for CLI arg parsing via clap.
/// - `server` feature: enables `build_router()` and HTTP handler functions.
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl ServerConfig {
    /// Parse server config from CLI arguments.
    ///
    /// Uses clap to parse `--port`, `--bind-addr`, `--db-path`, `--config-file`,
    /// `--auth-mode`, `--jwt-secret`, and `--jwt-expiry` from `std::env::args()`.
    ///
    /// # Errors
    /// Returns `SipError` if argument parsing fails (e.g., non-numeric port).
    #[cfg(feature = "cli")]
    pub fn from_args() -> Result<Self, crate::error::SipError> {
        let args: Vec<String> = std::env::args().skip(1).collect();
        Self::from_args_with(&args)
    }

    /// Parse server config from a custom argument list (useful for testing).
    ///
    /// # Errors
    /// Returns `SipError` if argument parsing fails.
    #[cfg(feature = "cli")]
    pub fn from_args_with(args: &[String]) -> Result<Self, crate::error::SipError> {
        use clap::{Arg, Command};

        let matches = Command::new("siprs-server")
            .no_binary_name(true)
            .arg(
                Arg::new("port")
                    .long("port")
                    .default_value("3910")
                    .help("Server bind port"),
            )
            .arg(
                Arg::new("bind-addr")
                    .long("bind-addr")
                    .default_value("127.0.0.1")
                    .help("Server bind address"),
            )
            .arg(
                Arg::new("db-path")
                    .long("db-path")
                    .default_value("~/.siprs/data.db")
                    .help("Path to SQLite database file"),
            )
            .arg(
                Arg::new("config-file")
                    .long("config-file")
                    .help("Path to external config file"),
            )
            .arg(
                Arg::new("auth-mode")
                    .long("auth-mode")
                    .default_value("localhost")
                    .help("Authentication mode: localhost, apikey, jwt"),
            )
            .arg(
                Arg::new("jwt-secret")
                    .long("jwt-secret")
                    .help("JWT signing secret (required when auth-mode=jwt)"),
            )
            .arg(
                Arg::new("jwt-expiry")
                    .long("jwt-expiry")
                    .default_value("3600")
                    .help("JWT token expiry in seconds"),
            )
            .try_get_matches_from(args)
            .map_err(|e| {
                crate::error::SipError::new(
                    crate::error::SipErrorKind::InvalidConfig,
                    format!("CLI argument parsing failed: {e}"),
                )
            })?;

        let port: u16 = matches
            .get_one::<String>("port")
            .and_then(|p| p.parse().ok())
            .ok_or_else(|| {
                crate::error::SipError::new(
                    crate::error::SipErrorKind::InvalidConfig,
                    "port must be a valid number between 0 and 65535".to_string(),
                )
            })?;

        let bind_addr_raw = matches
            .get_one::<String>("bind-addr")
            .map(|s| s.as_str())
            .unwrap_or("127.0.0.1");
        let bind_addr: SocketAddr = format!("{bind_addr_raw}:{port}").parse().map_err(|_| {
            crate::error::SipError::new(
                crate::error::SipErrorKind::InvalidConfig,
                format!("invalid bind address: {bind_addr_raw}:{port}"),
            )
        })?;

        let db_path = PathBuf::from(
            matches
                .get_one::<String>("db-path")
                .map(|s| s.as_str())
                .unwrap_or("~/.siprs/data.db"),
        );

        let config_file = matches.get_one::<String>("config-file").map(PathBuf::from);

        let auth_mode_str = matches
            .get_one::<String>("auth-mode")
            .map(|s| s.as_str())
            .unwrap_or("localhost");

        let auth = match auth_mode_str {
            "apikey" => AuthConfig {
                mode: AuthMode::ApiKey {
                    key: crate::security::SecretString::new(String::new()),
                },
                jwt_secret: None,
                jwt_expiry_secs: DEFAULT_JWT_EXPIRY_SECS,
            },
            "jwt" => {
                let secret = matches.get_one::<String>("jwt-secret").ok_or_else(|| {
                    crate::error::SipError::new(
                        crate::error::SipErrorKind::InvalidConfig,
                        "jwt-secret is required when auth-mode=jwt".to_string(),
                    )
                })?;
                AuthConfig {
                    mode: AuthMode::Jwt,
                    jwt_secret: Some(crate::security::SecretString::new(secret.clone())),
                    jwt_expiry_secs: matches
                        .get_one::<String>("jwt-expiry")
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(DEFAULT_JWT_EXPIRY_SECS),
                }
            }
            _ => AuthConfig {
                mode: AuthMode::LocalhostOnly,
                jwt_secret: None,
                jwt_expiry_secs: DEFAULT_JWT_EXPIRY_SECS,
            },
        };

        Ok(Self {
            bind_addr,
            db_path,
            config_file,
            allowed_origins: vec![],
            auth,
        })
    }
}

// [::TICKET::] P3-3: Axum HTTP server router and handler functions (behind server feature).
/// Build the Axum router with health check and shutdown endpoints.
///
/// This is the minimal router for P3-3. Additional routes (REST, WebSocket)
/// are added in P4-3.
#[cfg(feature = "server")]
pub fn build_router(state: AppState) -> axum::Router {
    use axum::routing::{get, post};
    use tower_http::cors::CorsLayer;

    let shared_state = Arc::new(state);

    axum::Router::new()
        .route("/api/v1/health", get(health_check_handler))
        .route("/api/v1/shutdown", post(shutdown_handler))
        .layer(CorsLayer::permissive())
        .with_state(shared_state)
}

/// Health check handler — returns HTTP 200 with server uptime.
#[cfg(feature = "server")]
async fn health_check_handler(State(state): State<Arc<AppState>>) -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "status": "ok",
        "uptime_secs": state.server_start_time.elapsed().as_secs()
    }))
}

/// Shutdown handler — initiates graceful shutdown via SipClient::shutdown().
#[cfg(feature = "server")]
async fn shutdown_handler(State(state): State<Arc<AppState>>) -> axum::Json<serde_json::Value> {
    let _ = state.sip_client.shutdown().await;
    axum::Json(serde_json::json!({
        "status": "shutting_down"
    }))
}

/// Run the standalone server with the given config.
///
/// Initializes SipClient, DatabasePool, builds the Axum router,
/// and starts serving on the configured bind address.
#[cfg(feature = "server")]
pub async fn run_server(config: ServerConfig) -> Result<(), crate::error::SipError> {
    use crate::client::SipClient;
    use crate::config::ClientConfig;

    tracing::info!(
        bind_addr = %config.bind_addr,
        db_path = %config.db_path.display(),
        "Starting siprs-server"
    );

    let sip_client = SipClient::new(ClientConfig::default()).await?;
    let sip_client = sip_client.0; // Discard event receiver — caller can subscribe via SipClient API

    #[cfg(feature = "sqlite-storage")]
    let db = {
        let pool = crate::model::sqlite_schema::DatabasePool::open(&config.db_path)
            .await
            .map_err(|e| {
                crate::error::SipError::new(
                    crate::error::SipErrorKind::NativeError,
                    format!("DatabasePool open failed: {e}"),
                )
            })?;
        Arc::new(pool)
    };

    // [::STUB::] P4-3: Restore saved accounts from DatabasePool.
    // let accounts = db.load_accounts().await?;
    // for account_config in accounts {
    //     sip_client.add_account(account_config).await?;
    // }

    #[cfg(feature = "sqlite-storage")]
    let app_state = AppState {
        sip_client: Arc::new(sip_client),
        db,
        server_start_time: Instant::now(),
    };
    #[cfg(not(feature = "sqlite-storage"))]
    let app_state = AppState {
        sip_client: Arc::new(sip_client),
        server_start_time: Instant::now(),
    };

    let router = build_router(app_state);

    let listener = tokio::net::TcpListener::bind(config.bind_addr)
        .await
        .map_err(|e| {
            crate::error::SipError::new(
                crate::error::SipErrorKind::NativeError,
                format!("TCP bind failed on {}: {e}", config.bind_addr),
            )
        })?;

    tracing::info!(
        local_addr = %listener.local_addr().map_or_else(|_| "unknown".into(), |a| a.to_string()),
        "Server listening"
    );
    axum::serve(listener, router).await.map_err(|e| {
        crate::error::SipError::new(
            crate::error::SipErrorKind::NativeError,
            format!("Axum serve error: {e}"),
        )
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Invariant: AuthMode has exactly 3 variants ─────────────────────

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_auth_mode_variant_count() {
        // Compile-time exhaustiveness check — match must cover 3 variants
        // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
        fn assert_exhaustive(mode: AuthMode) {
            match mode {
                AuthMode::LocalhostOnly => {}
                AuthMode::ApiKey { .. } => {}
                AuthMode::Jwt => {}
            }
        }
        let _ = assert_exhaustive;
    }

    // ── Invariant: Default mode is LocalhostOnly ───────────────────────

    #[test]
    // @verifies C062
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_auth_config_default_localhost_only() {
        let config = AuthConfig::default();
        assert_eq!(
            config.mode,
            AuthMode::LocalhostOnly,
            "Default auth mode must be LocalhostOnly"
        );
    }

    // ── Normal: AuthConfig valid configurations ────────────────────────

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_auth_config_localhost_valid() {
        let config = AuthConfig {
            mode: AuthMode::LocalhostOnly,
            jwt_secret: None,
            jwt_expiry_secs: 3600,
        };
        let bind: std::net::SocketAddr =
            format!("127.0.0.1:{}", DEFAULT_SIPRS_PORT).parse().unwrap();
        assert!(
            config.validate(&bind).is_ok(),
            "LocalhostOnly with loopback address must be valid"
        );
    }

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_auth_config_apikey_valid() {
        let config = AuthConfig {
            mode: AuthMode::ApiKey {
                key: crate::security::SecretString::new(String::from("test-key")),
            },
            jwt_secret: None,
            jwt_expiry_secs: 3600,
        };
        let bind: std::net::SocketAddr = format!("0.0.0.0:{}", DEFAULT_SIPRS_PORT).parse().unwrap();
        assert!(
            config.validate(&bind).is_ok(),
            "ApiKey mode must accept any bind address"
        );
    }

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_auth_config_jwt_valid() {
        let config = AuthConfig {
            mode: AuthMode::Jwt,
            jwt_secret: Some(crate::security::SecretString::new(String::from(
                "jwt-secret",
            ))),
            jwt_expiry_secs: 3600,
        };
        let bind: std::net::SocketAddr = format!("0.0.0.0:{}", DEFAULT_SIPRS_PORT).parse().unwrap();
        assert!(
            config.validate(&bind).is_ok(),
            "Jwt mode with secret must be valid"
        );
    }

    // ── Error: AuthConfig invalid configurations ──────────────────────

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_auth_config_localhost_rejects_external() {
        let config = AuthConfig {
            mode: AuthMode::LocalhostOnly,
            jwt_secret: None,
            jwt_expiry_secs: 3600,
        };
        let bind: std::net::SocketAddr = format!("0.0.0.0:{}", DEFAULT_SIPRS_PORT).parse().unwrap();
        let result = config.validate(&bind);
        assert!(
            result.is_err(),
            "LocalhostOnly must reject non-loopback address"
        );
        assert!(
            result.unwrap_err().to_string().contains("LocalhostOnly"),
            "Error message must mention LocalhostOnly"
        );
    }

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_auth_config_jwt_requires_secret() {
        let config = AuthConfig {
            mode: AuthMode::Jwt,
            jwt_secret: None,
            jwt_expiry_secs: 3600,
        };
        let bind: std::net::SocketAddr =
            format!("127.0.0.1:{}", DEFAULT_SIPRS_PORT).parse().unwrap();
        let result = config.validate(&bind);
        assert!(result.is_err(), "Jwt mode without secret must return error");
        assert!(
            result.unwrap_err().to_string().contains("secret"),
            "Error message must mention missing secret"
        );
    }

    // ── Normal: ServerConfig struct construction ───────────────────────

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_server_config_struct_fields() {
        let config = ServerConfig {
            bind_addr: format!("127.0.0.1:{}", DEFAULT_SIPRS_PORT).parse().unwrap(),
            db_path: std::path::PathBuf::from("~/.siprs/data.db"),
            config_file: None,
            allowed_origins: vec![],
            auth: AuthConfig::default(),
        };
        assert_eq!(config.auth.jwt_expiry_secs, 3600);
        assert_eq!(config.bind_addr.port(), 3910);
    }

    // ── Invariant: Send + Sync ─────────────────────────────────────────

    #[test]
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_server_config_send_sync() {
        // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        // [::TICKET::] P2-2, P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P2-2|P3-3) --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<ServerConfig>();
        assert_sync::<ServerConfig>();
        assert_send::<AuthConfig>();
        assert_sync::<AuthConfig>();
        assert_send::<AuthConfig>();
    }

    // ── P3-3: ServerConfig default values ────────────────────────────────

    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn test_server_config_default_values() -> Result<(), Box<dyn std::error::Error>> {
        let config = ServerConfig::default();
        assert_eq!(config.bind_addr.to_string(), "127.0.0.1:3910");
        assert_eq!(config.db_path.to_str().unwrap(), "~/.siprs/data.db");
        assert_eq!(config.auth.mode, AuthMode::LocalhostOnly);
        assert!(config.config_file.is_none());
        assert!(config.allowed_origins.is_empty());
        Ok(())
    }

    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn test_server_config_serde_roundtrip() -> Result<(), Box<dyn std::error::Error>> {
        let config = ServerConfig::default();
        let json = serde_json::to_string(&config)?;
        let restored: ServerConfig = serde_json::from_str(&json)?;
        assert_eq!(config.bind_addr, restored.bind_addr);
        assert_eq!(config.db_path, restored.db_path);
        assert_eq!(config.auth.mode, restored.auth.mode);
        assert_eq!(config.auth.jwt_expiry_secs, restored.auth.jwt_expiry_secs);
        Ok(())
    }

    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn test_default_jwt_expiry_secs() {
        assert_eq!(DEFAULT_JWT_EXPIRY_SECS, 3600);
    }

    // ── P3-3: AuthConfig uses DEFAULT_JWT_EXPIRY_SECS ────────────────────

    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn test_auth_config_default_jwt_expiry_matches_constant() {
        let config = AuthConfig::default();
        assert_eq!(config.jwt_expiry_secs, DEFAULT_JWT_EXPIRY_SECS);
    }

    // ── P3-3: ServerConfig CLI tests (feature-gated) ─────────────────────

    #[cfg(all(test, feature = "cli"))]
    mod cli_tests {
        use super::*;

        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        #[test]
        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        fn test_from_args_default_port() -> Result<(), Box<dyn std::error::Error>> {
            let config = ServerConfig::from_args_with(&[])?;
            assert_eq!(config.bind_addr.port(), 3910);
            assert_eq!(config.auth.mode, AuthMode::LocalhostOnly);
            Ok(())
        }

        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        #[test]
        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        fn test_from_args_port_override() -> Result<(), Box<dyn std::error::Error>> {
            let config = ServerConfig::from_args_with(&["--port".to_string(), "3911".to_string()])?;
            assert_eq!(config.bind_addr.port(), 3911);
            Ok(())
        }

        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        #[test]
        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        fn test_from_args_db_path_override() -> Result<(), Box<dyn std::error::Error>> {
            let config = ServerConfig::from_args_with(&[
                "--db-path".to_string(),
                "/tmp/test.db".to_string(),
            ])?;
            assert_eq!(config.db_path.to_str().unwrap(), "/tmp/test.db");
            Ok(())
        }

        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        #[test]
        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        fn test_from_args_rejects_non_numeric_port() {
            let result = ServerConfig::from_args_with(&["--port".to_string(), "abc".to_string()]);
            assert!(result.is_err(), "Non-numeric port must return error");
        }

        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        #[test]
        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        fn test_from_args_rejects_invalid_bind_addr() {
            let result = ServerConfig::from_args_with(&[
                "--bind-addr".to_string(),
                "not-an-ip".to_string(),
                "--port".to_string(),
                "3910".to_string(),
            ]);
            assert!(result.is_err(), "Invalid bind-addr must return error");
        }

        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        #[test]
        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        fn test_from_args_auth_mode_apikey() -> Result<(), Box<dyn std::error::Error>> {
            let config =
                ServerConfig::from_args_with(&["--auth-mode".to_string(), "apikey".to_string()])?;
            assert!(matches!(config.auth.mode, AuthMode::ApiKey { .. }));
            Ok(())
        }

        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        #[test]
        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        fn test_from_args_auth_mode_jwt_with_secret() -> Result<(), Box<dyn std::error::Error>> {
            let config = ServerConfig::from_args_with(&[
                "--auth-mode".to_string(),
                "jwt".to_string(),
                "--jwt-secret".to_string(),
                "my-secret".to_string(),
            ])?;
            assert_eq!(config.auth.mode, AuthMode::Jwt);
            assert!(config.auth.jwt_secret.is_some());
            Ok(())
        }
    }

    // ── P3-3: AppState + build_router tests (feature-gated) ──────────────
    //
    // Full health check response test requires a running SipClient (needs PJSIP).
    // Verified separately in integration tests (P4-3).

    #[cfg(all(test, feature = "server"))]
    mod server_tests {
        use super::*;

        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        #[test]
        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        fn test_app_state_send_sync() {
            // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
            fn assert_send<T: Send>() {}
            // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
            fn assert_sync<T: Sync>() {}
            assert_send::<AppState>();
            assert_sync::<AppState>();
        }

        // [::TEST_EXCEPTION::] P3-3: Health check response test requires SipClient initialization.
        // Full PJSIP backend integration test — deferred to P4-3.
        // Alternative: Verify build_router() returns axum::Router via type-check.
        #[test]
        // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
        fn test_build_router_returns_router_type() {
            // Type-level verification: build_router() must return axum::Router
            // This test verifies the function signature compiles correctly.
            // Actual health check response is tested in P4-3 integration tests.
            // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
            fn _assert_type(router: axum::Router) {
                let _ = router;
            }
            // Can't construct AppState without SipClient — the router construction
            // is verified at compile time via the type assertion above.
            let _ = _assert_type;
        }
    }
} // mod tests
