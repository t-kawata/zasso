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

/// Default bind port for siprs-server.
pub const DEFAULT_SIPRS_PORT: u16 = 3910;

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

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
impl Default for AuthConfig {
    // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self {
            mode: AuthMode::LocalhostOnly,
            jwt_secret: None,
            jwt_expiry_secs: 3600,
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
        assert!(true, "AuthMode has exactly 3 variants");
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
        // [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<ServerConfig>();
        assert_sync::<ServerConfig>();
        assert_send::<AuthConfig>();
        assert_sync::<AuthConfig>();
    }
}
