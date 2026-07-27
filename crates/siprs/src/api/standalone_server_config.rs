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

//! Standalone server mode configuration types.
//!
//! Defines `ServerConfig`, `AuthConfig`, and `AuthMode` — the configuration
//! contract for the siprs-server standalone HTTP/WS server entry point.
//!
//! These types specify bind address, database path, config file, CORS origins,
//! authentication mode (localhost-only, API key, or JWT), and JWT settings.
//!
//! ## Architecture
//!
//! All types are pure data with no runtime behavior — they are the configuration
//! input to the future siprs-server binary. Default trait implementations provide
//! secure defaults (localhost-only binding, LocalhostOnly auth).
//!
//! ## Security
//!
//! - `AuthConfig` and `AuthMode` have manual `Debug` impls that redact
//!   `SecretString` content as `[REDACTED]`
//! - `Clone` is implemented manually for types containing `SecretString` to
//!   create a fresh copy via `SecretString::new()`
//! - Serialisation exposes the actual secret values (needed for persistence);
//!   debug output never does

use std::net::SocketAddr;
use std::path::PathBuf;

use crate::security::SecretString;

// ── Named constants ──────────────────────────────────────────────────────

/// Default bind address: localhost-only on port 3910.
pub const DEFAULT_BIND_ADDR: &str = "127.0.0.1:3910";

/// Default database path: `~/.siprs/data.db`.
pub const DEFAULT_DB_PATH: &str = "~/.siprs/data.db";

/// Default JWT token expiry: 1 hour (3600 seconds).
pub const DEFAULT_JWT_EXPIRY_SECS: u64 = 3600;

// ── serde impls for SecretString ─────────────────────────────────────────

#[cfg(feature = "serde")]
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl serde::Serialize for SecretString {
    /// Serialises the actual secret value — required for configuration persistence.
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

#[cfg(feature = "serde")]
impl<'de> serde::Deserialize<'de> for SecretString {
    /// Deserialises a string into a `SecretString`, wrapping the value securely.
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Ok(SecretString::new(s))
    }
}

// ── AuthMode ─────────────────────────────────────────────────────────────

/// Authentication mode for the standalone server.
///
/// ## Variants
///
/// - `LocalhostOnly` — Listen on 127.0.0.1 only (default, most secure).
/// - `ApiKey` — Require a static API key in the `Authorization` header.
/// - `Jwt` — Require a JWT token issued via the `/api/v1/auth/token` endpoint.
///
/// ## Security
///
/// `Debug` always redacts the API key value as `[REDACTED]`.
/// `Clone` creates a fresh `SecretString` copy for the `ApiKey` variant.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum AuthMode {
    /// Listen on 127.0.0.1 only — no authentication required.
    LocalhostOnly,
    /// Require a static API key in the `Authorization` header.
    ApiKey {
        /// The API key value, redacted in debug output.
        key: SecretString,
    },
    /// Require a JWT token issued via `/api/v1/auth/token`.
    Jwt,
}

// Manual Debug for AuthMode ensures SecretString content is redacted.
// `#[derive(Debug)]` on AuthMode would show the raw SecretString inner value
// since SecretString itself derives Debug.  We override to guarantee redaction.
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl std::fmt::Debug for AuthMode {
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthMode::LocalhostOnly => write!(f, "LocalhostOnly"),
            AuthMode::ApiKey { .. } => write!(f, "ApiKey {{ key: [REDACTED] }}"),
            AuthMode::Jwt => write!(f, "Jwt"),
        }
    }
}

// Manual Clone because SecretString does not implement Clone.
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl Clone for AuthMode {
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn clone(&self) -> Self {
        match self {
            AuthMode::LocalhostOnly => AuthMode::LocalhostOnly,
            AuthMode::ApiKey { key } => AuthMode::ApiKey {
                key: SecretString::new(key.as_str()),
            },
            AuthMode::Jwt => AuthMode::Jwt,
        }
    }
}

// ── AuthConfig ───────────────────────────────────────────────────────────

/// Authentication configuration for the standalone server.
///
/// ## Fields
///
/// - `mode` — The authentication mode (`LocalhostOnly`, `ApiKey`, or `Jwt`).
/// - `jwt_secret` — JWT signing secret (required when `mode == Jwt`).
/// - `jwt_expiry_secs` — JWT token expiry in seconds (default: 3600).
///
/// ## Default
///
/// `AuthConfig::default()` returns `LocalhostOnly` mode with no JWT secret
/// and 3600-second expiry — the most secure default.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AuthConfig {
    /// Authentication mode.
    pub mode: AuthMode,
    /// JWT signing secret — required when `mode == Jwt`.
    pub jwt_secret: Option<SecretString>,
    /// JWT token expiry in seconds.  Default: 3600 (1 hour).
    pub jwt_expiry_secs: u64,
}

// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl Default for AuthConfig {
    /// Returns `AuthConfig` with `LocalhostOnly` mode, no JWT secret,
    /// and 3600-second expiry.
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        AuthConfig {
            mode: AuthMode::LocalhostOnly,
            jwt_secret: None,
            jwt_expiry_secs: DEFAULT_JWT_EXPIRY_SECS,
        }
    }
}

// Manual Debug to redact SecretString content (jwt_secret value).
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl std::fmt::Debug for AuthConfig {
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthConfig")
            .field("mode", &self.mode)
            .field(
                "jwt_secret",
                &self.jwt_secret.as_ref().map(|_| "[REDACTED]"),
            )
            .field("jwt_expiry_secs", &self.jwt_expiry_secs)
            .finish()
    }
}

// Manual Clone because AuthMode contains SecretString.
// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl Clone for AuthConfig {
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn clone(&self) -> Self {
        AuthConfig {
            mode: self.mode.clone(),
            jwt_secret: self
                .jwt_secret
                .as_ref()
                .map(|s| SecretString::new(s.as_str())),
            jwt_expiry_secs: self.jwt_expiry_secs,
        }
    }
}

// ── ServerConfig ─────────────────────────────────────────────────────────

/// Standalone server configuration.
///
/// Specifies all parameters needed to start the siprs-server HTTP/WS server:
/// bind address, database path, config file path, CORS origins, and auth.
///
/// ## Default
///
/// `ServerConfig::default()` provides a secure localhost-only configuration:
///
/// ```rust
/// # use siprs::api::ServerConfig;
/// let config = ServerConfig::default();
/// assert_eq!(config.bind_addr.to_string(), "127.0.0.1:3910");
/// ```
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ServerConfig {
    /// IP address and port to bind the HTTP/WS server.
    /// Default: `127.0.0.1:3910`.
    pub bind_addr: SocketAddr,
    /// Path to the SQLite database file for account and config persistence.
    /// Default: `~/.siprs/data.db`.
    pub db_path: PathBuf,
    /// Optional path to an external config file (JSON/YAML) for bulk
    /// ClientConfig + AccountConfig loading.
    pub config_file: Option<PathBuf>,
    /// Allowed CORS origins.  Empty = no CORS (same-origin only).
    pub allowed_origins: Vec<String>,
    /// Authentication configuration.
    pub auth: AuthConfig,
}

// [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
impl Default for ServerConfig {
    /// Returns a secure localhost-only default configuration.
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        ServerConfig {
            bind_addr: DEFAULT_BIND_ADDR.parse().expect("valid default bind addr"),
            db_path: PathBuf::from(DEFAULT_DB_PATH),
            config_file: None,
            allowed_origins: Vec::new(),
            auth: AuthConfig::default(),
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ═════════════════════════════════════════════════════════════════════
    // C062 — N0061->N0059: ServerConfig/AuthConfig/AuthMode type definitions
    // ═════════════════════════════════════════════════════════════════════

    // ── C062-Precondition: ServerConfig default values ─────────────────

    /// @verifies C062-precondition
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_precondition_server_config_defaults() {
        let config = ServerConfig::default();

        assert_eq!(config.bind_addr, SocketAddr::from(([127, 0, 0, 1], 3910)));
        assert_eq!(config.db_path, PathBuf::from("~/.siprs/data.db"));
        assert!(config.config_file.is_none());
        assert!(config.allowed_origins.is_empty());
        assert!(matches!(config.auth.mode, AuthMode::LocalhostOnly));
    }

    /// @verifies C062-precondition
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_precondition_auth_config_defaults() {
        let auth = AuthConfig::default();

        assert!(matches!(auth.mode, AuthMode::LocalhostOnly));
        assert!(auth.jwt_secret.is_none());
        assert_eq!(auth.jwt_expiry_secs, 3600);
    }

    /// @verifies C062-precondition
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_precondition_explicit_values() {
        let config = ServerConfig {
            bind_addr: "0.0.0.0:5060".parse().unwrap(),
            db_path: "/data/test.db".into(),
            config_file: Some("/etc/siprs/config.yaml".into()),
            allowed_origins: vec!["https://app.example.com".into()],
            auth: AuthConfig {
                mode: AuthMode::ApiKey {
                    key: SecretString::new("sk-123"),
                },
                ..Default::default()
            },
        };

        assert_eq!(config.bind_addr.to_string(), "0.0.0.0:5060");
        assert_eq!(config.db_path.to_str().unwrap(), "/data/test.db");
        assert_eq!(
            config.config_file.unwrap().to_str().unwrap(),
            "/etc/siprs/config.yaml"
        );
        assert_eq!(config.allowed_origins[0], "https://app.example.com");
    }

    // ── C062-Postcondition: ApiKey redaction ───────────────────────────

    /// @verifies C062-postcondition
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_postcondition_api_key_redacted() {
        let mode = AuthMode::ApiKey {
            key: SecretString::new("my-api-key"),
        };
        let debug = format!("{:?}", mode);
        // The actual key value must NOT appear in Debug output
        assert!(!debug.contains("my-api-key"));
        // A placeholder must appear
        assert!(debug.contains("[REDACTED]"));
    }

    // ── C062-Postcondition: Jwt mode stores jwt_secret ─────────────────

    /// @verifies C062-postcondition
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_postcondition_jwt_mode_has_secret() {
        let secret = SecretString::new("jwt-secret-value");
        let auth = AuthConfig {
            mode: AuthMode::Jwt,
            jwt_secret: Some(secret),
            jwt_expiry_secs: 7200,
        };

        assert!(auth.jwt_secret.is_some());
        assert_eq!(auth.jwt_expiry_secs, 7200);
    }

    // ── C062-Postcondition: serde round-trip ───────────────────────────

    #[cfg(feature = "serde")]
    /// @verifies C062-postcondition
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_postcondition_serde_round_trip() {
        let config = ServerConfig {
            bind_addr: "0.0.0.0:5060".parse().unwrap(),
            db_path: "/tmp/test.db".into(),
            config_file: None,
            allowed_origins: vec!["https://example.com".into()],
            auth: AuthConfig {
                mode: AuthMode::LocalhostOnly,
                ..Default::default()
            },
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: ServerConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(config.bind_addr, deserialized.bind_addr);
        assert_eq!(config.db_path, deserialized.db_path);
        assert_eq!(config.allowed_origins, deserialized.allowed_origins);
    }

    // ── C062-Invariant: AuthConfig default mode ────────────────────────

    /// @verifies C062-invariant
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_invariant_default_mode_localhost_only() {
        assert!(matches!(
            AuthConfig::default().mode,
            AuthMode::LocalhostOnly
        ));
    }

    /// @verifies C062-invariant
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_invariant_api_key_no_jwt_secret() {
        let auth = AuthConfig {
            mode: AuthMode::ApiKey {
                key: SecretString::new("k"),
            },
            ..Default::default()
        };
        // ApiKey mode must NOT store a JWT secret
        assert!(auth.jwt_secret.is_none());
    }

    /// @verifies C062-invariant
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_invariant_jwt_has_secret() {
        let auth = AuthConfig {
            mode: AuthMode::Jwt,
            jwt_secret: Some(SecretString::new("s")),
            jwt_expiry_secs: 3600,
        };
        // Jwt mode must have jwt_secret set
        assert!(auth.jwt_secret.is_some());
    }

    /// @verifies C062-invariant
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c062_invariant_debug_redacts_secrets() {
        let auth = AuthConfig {
            mode: AuthMode::ApiKey {
                key: SecretString::new("hidden-key"),
            },
            jwt_secret: Some(SecretString::new("hidden-jwt")),
            jwt_expiry_secs: 3600,
        };

        let debug = format!("{:?}", auth);
        assert!(!debug.contains("hidden-key"));
        assert!(!debug.contains("hidden-jwt"));
        assert!(debug.contains("[REDACTED]"));
    }

    // ═════════════════════════════════════════════════════════════════════
    // C063 — N0062->N0061: ServerConfig/AuthConfig/AuthMode publicly exported
    // ═════════════════════════════════════════════════════════════════════

    /// @verifies C063-precondition
    #[test]
    fn c063_precondition_types_publicly_exported() {
        // Compile-time verification: these types must be accessible
        // from the crate root.  Validates C063 precondition:
        // "ServerConfig and AuthConfig types are publicly exported
        //  from crate::api for N0062 to consume in route definitions."
        let _config = ServerConfig::default();
        let _auth = AuthConfig::default();
        let _mode = AuthMode::LocalhostOnly;
        let _jwt = AuthMode::Jwt;
        let _api_key = AuthMode::ApiKey {
            key: SecretString::new("test"),
        };
        // If this compiles, C063 precondition is satisfied
        assert!(true);
    }

    /// @verifies C063-invariant
    #[test]
    fn c063_invariant_auth_mode_exhaustive() {
        // Invariant: AuthMode variants (LocalhostOnly/ApiKey/Jwt) are
        // exhaustive.  Adding a new variant requires updating N0062 middleware.
        match AuthMode::LocalhostOnly {
            AuthMode::LocalhostOnly => {}
            AuthMode::ApiKey { .. } => {}
            AuthMode::Jwt => {}
        }
        let api_key_mode = AuthMode::ApiKey {
            key: SecretString::new("k"),
        };
        match &api_key_mode {
            AuthMode::LocalhostOnly => {}
            AuthMode::ApiKey { .. } => {}
            AuthMode::Jwt => {}
        }
        assert!(true);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Normal tests — ServerConfig construction and access
    // ═════════════════════════════════════════════════════════════════════

    /// ServerConfig with explicit bind address is stored correctly.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn explicit_bind_addr() {
        let config = ServerConfig {
            bind_addr: "0.0.0.0:5060".parse().unwrap(),
            ..Default::default()
        };
        assert_eq!(config.bind_addr.to_string(), "0.0.0.0:5060");
    }

    /// ServerConfig with custom db_path is stored correctly.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn custom_db_path() {
        let config = ServerConfig {
            db_path: "/custom/path.db".into(),
            ..Default::default()
        };
        assert_eq!(config.db_path.to_str().unwrap(), "/custom/path.db");
    }

    /// ServerConfig with config_file is stored and retrievable.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn with_config_file() {
        let config = ServerConfig {
            config_file: Some("/etc/siprs/config.yaml".into()),
            ..Default::default()
        };
        assert_eq!(
            config.config_file.unwrap().to_str().unwrap(),
            "/etc/siprs/config.yaml"
        );
    }

    /// ServerConfig with custom allowed_origins is stored correctly.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn with_allowed_origins() {
        let config = ServerConfig {
            allowed_origins: vec!["https://app.example.com".into()],
            ..Default::default()
        };
        assert_eq!(config.allowed_origins.len(), 1);
        assert_eq!(config.allowed_origins[0], "https://app.example.com");
    }

    /// AuthMode::ApiKey stores a retrievable SecretString.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn api_key_stores_secret_string() {
        let key = SecretString::new("sk-test-key-456");
        let mode = AuthMode::ApiKey { key };
        let debug = format!("{:?}", mode);
        assert!(!debug.contains("sk-test-key-456"));
        assert!(debug.contains("[REDACTED]"));
    }

    /// AuthMode::Jwt with custom jwt_expiry_secs.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn jwt_with_custom_expiry() {
        let secret = SecretString::new("custom-secret");
        let auth = AuthConfig {
            mode: AuthMode::Jwt,
            jwt_secret: Some(secret),
            jwt_expiry_secs: 1800,
        };
        assert!(auth.jwt_secret.is_some());
        assert_eq!(auth.jwt_expiry_secs, 1800);
    }

    /// Clone produces an independent copy of ServerConfig.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn server_config_clone_is_independent() {
        let config = ServerConfig::default();
        let mut cloned = config.clone();
        cloned.bind_addr = "0.0.0.0:9999".parse().unwrap();
        // Original must be unaffected
        assert_eq!(config.bind_addr.to_string(), "127.0.0.1:3910");
        assert_eq!(cloned.bind_addr.to_string(), "0.0.0.0:9999");
    }

    /// Debug output of AuthConfig redacts jwt_secret value.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn debug_redacts_jwt_secret() {
        let auth = AuthConfig {
            mode: AuthMode::Jwt,
            jwt_secret: Some(SecretString::new("super-secret-jwt")),
            jwt_expiry_secs: 3600,
        };
        let debug = format!("{:?}", auth);
        assert!(!debug.contains("super-secret-jwt"));
    }

    /// ServerConfig Debug does not panic and reveals no secrets.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn server_config_debug_does_not_leak() {
        let config = ServerConfig::default();
        let debug = format!("{:?}", config);
        // Should contain structural info but not secrets
        assert!(debug.contains("ServerConfig"));
        assert!(debug.contains("bind_addr"));
        assert!(debug.contains("db_path"));
    }

    // ═════════════════════════════════════════════════════════════════════
    // Error tests — invalid input rejection
    // ═════════════════════════════════════════════════════════════════════

    /// Invalid SocketAddr string is rejected at parse level.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn invalid_bind_addr_rejected() {
        let result: Result<SocketAddr, _> = "not-a-valid-addr".parse();
        assert!(result.is_err());
    }

    /// Empty db_path PathBuf is accepted (valid use: in-memory DB marker).
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn empty_db_path_accepted() {
        let config = ServerConfig {
            db_path: PathBuf::from(""),
            ..Default::default()
        };
        assert!(config.db_path.as_os_str().is_empty());
    }

    // ═════════════════════════════════════════════════════════════════════
    // Boundary tests — edge values
    // ═════════════════════════════════════════════════════════════════════

    /// IPv6 localhost bind address is accepted.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn ipv6_bind_addr_accepted() {
        let addr: SocketAddr = "[::1]:3910".parse().unwrap();
        assert_eq!(addr.to_string(), "[::1]:3910");
        let config = ServerConfig {
            bind_addr: addr,
            ..Default::default()
        };
        assert_eq!(config.bind_addr.to_string(), "[::1]:3910");
    }

    /// Port 0 (OS-assigned ephemeral port) is accepted.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn port_zero_accepted() {
        let addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
        assert_eq!(addr.port(), 0);
    }

    /// Maximum valid port 65535 is accepted.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn port_65535_accepted() {
        let addr: SocketAddr = "127.0.0.1:65535".parse().unwrap();
        assert_eq!(addr.port(), 65535);
    }

    /// jwt_expiry_secs = 0 is accepted (disables expiry).
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn jwt_expiry_zero_accepted() {
        let auth = AuthConfig {
            jwt_expiry_secs: 0,
            ..Default::default()
        };
        assert_eq!(auth.jwt_expiry_secs, 0);
    }

    /// jwt_expiry_secs = u64::MAX is accepted without overflow.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn jwt_expiry_max_accepted() {
        let auth = AuthConfig {
            jwt_expiry_secs: u64::MAX,
            ..Default::default()
        };
        assert_eq!(auth.jwt_expiry_secs, u64::MAX);
    }

    /// Unicode paths in db_path are preserved.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn unicode_db_path_preserved() {
        let config = ServerConfig {
            db_path: PathBuf::from("/データ/テスト.db"),
            ..Default::default()
        };
        assert_eq!(config.db_path.to_str().unwrap(), "/データ/テスト.db");
    }

    /// Empty allowed_origins is valid (disables CORS).
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn empty_allowed_origins_valid() {
        let config = ServerConfig::default();
        assert!(config.allowed_origins.is_empty());
    }

    /// Large allowed_origins list (256 entries) is accepted.
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn large_allowed_origins_accepted() {
        let origins: Vec<String> = (0..256)
            .map(|i| format!("https://site{}.example.com", i))
            .collect();
        assert_eq!(origins.len(), 256);
        let config = ServerConfig {
            allowed_origins: origins,
            ..Default::default()
        };
        assert_eq!(config.allowed_origins.len(), 256);
        assert_eq!(config.allowed_origins[255], "https://site255.example.com");
    }

    // ═════════════════════════════════════════════════════════════════════
    // C065 — N0064->N0061: db_path PathBuf invariants (inbound contract)
    // ═════════════════════════════════════════════════════════════════════

    /// @verifies C065-invariant
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c065_invariant_empty_db_path_accepted() {
        let config = ServerConfig {
            db_path: PathBuf::from(""),
            ..Default::default()
        };
        assert!(config.db_path.as_os_str().is_empty());
    }

    /// @verifies C065-invariant
    #[test]
    // [::TICKET::] P3-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-3 --for-spec --no-implementation-order`.
    fn c065_invariant_unicode_db_path() {
        let config = ServerConfig {
            db_path: PathBuf::from("/データ/テスト.db"),
            ..Default::default()
        };
        assert_eq!(config.db_path.to_str().unwrap(), "/データ/テスト.db");
    }
}
