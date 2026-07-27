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
//   - NODE_ID=N0065:  §57 Test Strategy Layer 5 — API Integration
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0065 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! # §57 Test Strategy Layer 5 — API Integration
//!
//! This module defines the Layer 5 API Integration test infrastructure for
//! the siprs ecosystem, as defined by N0065. It extends the 4-layer test
//! strategy (N0052) with an additional layer for HTTP/WS API-level tests.
//!
//! ```text
//! Layer 5: API Integration Tests  ← New, Axum TestResponse + WebSocket client
//!   ├── REST API tests (Axum Router request → response)
//!   ├── WebSocket event stream tests
//!   ├── Audio binary frame send/receive tests
//!   ├── JWT auth flow tests (token issue → verify → reject)
//!   └── SIP combined tests (Docker Asterisk + HTTP/WS API → SIP signaling)
//! ```
//!
//! ## Layer 5 properties
//!
//! - **PJSIP-free**: Uses HTTP client only, no PJSIP dependency.
//! - **CI-compatible**: No Docker, no external PBX required for core API tests.
//! - **Deferred runtime execution**: Actual `axum_test::TestServer` tests
//!   require the future `siprs-server` crate (P3-4) and are documented
//!   as patterns in the spec file (`specs/P2-5.md`).
//!
//! ## Test directory layout (RFC §57.2)
//!
//! ```text
//! siprs-server/tests/
//!   api/            ← REST API tests
//!     auth_test.rs, accounts_test.rs, calls_test.rs, health_test.rs
//!   ws/             ← WebSocket tests
//!     event_stream_test.rs, audio_frame_test.rs, auth_test.rs
//!   integration/    ← Combined tests
//!     sip_via_api_test.rs
//! ```

use crate::TestLayer;

/// Configuration for Layer 5 API integration test endpoints.
///
/// Stores the base URL for API test requests and provides validation.
/// Actual runtime HTTP tests (using `axum_test::TestServer`) are deferred
/// to the `siprs-server` crate (see specs/P2-5.md). This struct serves as
/// a documented configuration placeholder within the siprs core crate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestLayer5Config {
    /// Base URL of the API endpoint (e.g. "http://127.0.0.1:3910").
    endpoint: String,
}

/// Errors that can occur during `TestLayer5Config` construction.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    /// The provided endpoint string was empty or malformed.
    #[error("invalid endpoint URL: {0}")]
    InvalidEndpoint(String),
}

// [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
impl TestLayer5Config {
    /// Creates a new `TestLayer5Config`, validating the endpoint URL.
    ///
    /// Accepts well-formed HTTP(S) URLs. Rejects empty strings and
    /// strings that do not start with `http://` or `https://`.
    ///
    /// # Errors
    ///
    /// Returns `ConfigError::InvalidEndpoint` if the endpoint is empty
    /// or does not have a valid HTTP(S) scheme prefix.
    pub fn new(endpoint: &str) -> Result<Self, ConfigError> {
        let trimmed = endpoint.trim();
        if trimmed.is_empty() {
            return Err(ConfigError::InvalidEndpoint("empty URL".into()));
        }
        if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
            return Err(ConfigError::InvalidEndpoint(
                "must start with http:// or https://".into(),
            ));
        }
        Ok(Self {
            endpoint: trimmed.to_string(),
        })
    }

    /// Returns the validated endpoint URL.
    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LAYER5_LABEL: &str = "API Integration (axum-test)";
    const TEST_ENDPOINT: &str = "http://127.0.0.1:3910";

    #[test]
    // @verifies C066-postcondition
    // [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn layer5_is_pjsip_free() {
        assert!(TestLayer::ApiIntegration.is_pjsip_free());
    }

    #[test]
    // @verifies C066-invariant
    // [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn layer5_is_ci_compatible() {
        assert!(TestLayer::ApiIntegration.is_ci_compatible());
    }

    #[test]
    // @verifies C066-postcondition
    // [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn layer5_has_descriptive_label() {
        assert_eq!(TestLayer::ApiIntegration.label(), LAYER5_LABEL);
    }

    #[test]
    // @verifies C068-postcondition
    // [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn valid_endpoint_accepted() {
        let config = TestLayer5Config::new(TEST_ENDPOINT).unwrap();
        assert_eq!(config.endpoint(), TEST_ENDPOINT);
    }

    #[test]
// [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn https_endpoint_accepted() {
        let config = TestLayer5Config::new("https://api.example.com").unwrap();
        assert_eq!(config.endpoint(), "https://api.example.com");
    }

    #[test]
    // @verifies C068-invariant — empty URL is an invalid config
    // [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn empty_endpoint_rejected() {
        let err = TestLayer5Config::new("").unwrap_err();
        assert!(matches!(err, ConfigError::InvalidEndpoint(_)));
    }

    #[test]
    // @verifies C068-invariant — malformed URL is an invalid config
    // [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn malformed_endpoint_rejected() {
        let err = TestLayer5Config::new("not-a-url").unwrap_err();
        assert!(matches!(err, ConfigError::InvalidEndpoint(_)));
    }

    #[test]
// [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn whitespace_only_rejected() {
        let err = TestLayer5Config::new("   ").unwrap_err();
        assert!(matches!(err, ConfigError::InvalidEndpoint(_)));
    }

    #[test]
    // @verifies C066-postcondition
    // [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn layer5_is_distinct_from_sip_integration() {
        assert_ne!(TestLayer::ApiIntegration, TestLayer::SipIntegration);
    }

    #[test]
    // @verifies C066-invariant
    // [::TICKET::] P2-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-5 --for-spec --no-implementation-order`.
    fn layer5_is_distinct_from_interop() {
        assert_ne!(TestLayer::ApiIntegration, TestLayer::Interop);
    }
}
