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
//   - NODE_ID=N0063:  §55 Auth Model — JWT & Axum Middleware
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0063 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

/// JWT payload claims.
///
/// Contains SIP account identity and authorization scope.
/// The `exp` field is set at issuance and validated on every request.
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct Claims {
    /// SIP account ID (sub claim).
    pub sub: String,
    /// SIP account username.
    pub username: String,
    /// SIP domain (e.g., "pbx.example.com").
    pub domain: String,
    /// Token expiry as Unix timestamp (seconds since epoch).
    pub exp: u64,
    /// Authorization scope (e.g., "sip:all").
    pub scope: String,
}

/// Errors returned by JWT validation.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum JwtError {
    /// Token has expired.
    #[error("Token has expired")]
    Expired,
    /// Token signature does not match.
    #[error("Invalid token signature")]
    InvalidSignature,
    /// Token is structurally malformed.
    #[error("Malformed token: {0}")]
    Malformed(String),
}

/// Validates JWT bearer tokens using a shared secret.
///
/// This type is Send + Sync and can be shared across threads.
/// It performs no I/O — all operations are pure CPU.
#[derive(Debug, Clone)]
pub struct JwtValidator {
    secret: String,
}

// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
impl JwtValidator {
    /// Create a new JWT validator with the given secret.
    pub fn new(secret: impl Into<String>) -> Self {
        Self { secret: secret.into() }
    }

    /// Issue a JWT token for the given claims.
    ///
    /// The token is signed with HS256 using the configured secret.
    pub fn issue_token(&self, claims: &Claims) -> Result<String, JwtError> {
        encode(
            &Header::default(),
            claims,
            &EncodingKey::from_secret(self.secret.as_ref()),
        )
        .map_err(|e| JwtError::Malformed(e.to_string()))
    }

    /// Validate and decode a JWT token.
    ///
    /// Returns the decoded claims if the token is valid,
    /// or a `JwtError` describing the failure.
    pub fn validate_token(&self, token: &str) -> Result<Claims, JwtError> {
        let mut validation = Validation::default();
        validation.validate_exp = true;
        decode::<Claims>(token, &DecodingKey::from_secret(self.secret.as_ref()), &validation)
            .map(|data| data.claims)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => JwtError::Expired,
                jsonwebtoken::errors::ErrorKind::InvalidSignature => JwtError::InvalidSignature,
                _ => JwtError::Malformed(e.to_string()),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: JWT encode/decode round-trip ───────────────────────────

    #[test]
// @verifies C064
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_jwt_roundtrip() -> Result<(), JwtError> {
        let validator = JwtValidator::new("test-secret");
        let claims = Claims {
            sub: "42".to_string(),
            username: "alice".to_string(),
            domain: "pbx.example.com".to_string(),
            exp: 9999999999,
            scope: "sip:all".to_string(),
        };
        let token = validator.issue_token(&claims)?;
        let decoded = validator.validate_token(&token)?;
        assert_eq!(decoded.sub, claims.sub);
        assert_eq!(decoded.username, claims.username);
        assert_eq!(decoded.domain, claims.domain);
        assert_eq!(decoded.exp, claims.exp);
        assert_eq!(decoded.scope, claims.scope);
        Ok(())
    }

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_claims_serialization() -> Result<(), Box<dyn std::error::Error>> {
        let claims = Claims {
            sub: "42".to_string(),
            username: "alice".to_string(),
            domain: "pbx.example.com".to_string(),
            exp: 9999999999,
            scope: "sip:all".to_string(),
        };
        let json = serde_json::to_value(&claims)?;
        assert_eq!(json["sub"], "42");
        assert_eq!(json["username"], "alice");
        assert_eq!(json["scope"], "sip:all");
        Ok(())
    }

    // ── Error: JWT validation failures ─────────────────────────────────

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_jwt_wrong_secret_rejected() {
        let issuer = JwtValidator::new("secret1");
        let claims = Claims {
            sub: "1".to_string(),
            username: "bob".to_string(),
            domain: "test.com".to_string(),
            exp: 9999999999,
            scope: "sip:all".to_string(),
        };
        let token = issuer.issue_token(&claims).unwrap();
        let verifier = JwtValidator::new("secret2");
        let result = verifier.validate_token(&token);
        assert!(matches!(result, Err(JwtError::InvalidSignature)));
    }

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_jwt_expired_rejected() {
        let validator = JwtValidator::new("test-secret");
        let claims = Claims {
            sub: "1".to_string(),
            username: "bob".to_string(),
            domain: "test.com".to_string(),
            exp: 100, // past
            scope: "sip:all".to_string(),
        };
        let token = validator.issue_token(&claims).unwrap();
        let result = validator.validate_token(&token);
        assert!(matches!(result, Err(JwtError::Expired)));
    }

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_jwt_malformed_rejected() {
        let validator = JwtValidator::new("test-secret");
        let result = validator.validate_token("not-a-jwt-token");
        assert!(matches!(result, Err(JwtError::Malformed(_))));
    }

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_jwt_expiry_zero() {
        let validator = JwtValidator::new("test-secret");
        let claims = Claims {
            sub: "1".to_string(),
            username: "bob".to_string(),
            domain: "test.com".to_string(),
            exp: 0,
            scope: "sip:all".to_string(),
        };
        let token = validator.issue_token(&claims).unwrap();
        let result = validator.validate_token(&token);
        assert!(matches!(result, Err(JwtError::Expired)),
            "exp=0 must be rejected as expired");
    }

    // ── Invariant: Send + Sync ─────────────────────────────────────────

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_jwt_validator_send_sync() {
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<JwtValidator>();
        assert_sync::<JwtValidator>();
    }

    // ── Boundary: Empty username round-trips ───────────────────────────

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_claims_empty_username_roundtrip() -> Result<(), JwtError> {
        let validator = JwtValidator::new("test-secret");
        let claims = Claims {
            sub: "0".to_string(),
            username: String::new(), // empty
            domain: "test.com".to_string(),
            exp: 9999999999,
            scope: "sip:all".to_string(),
        };
        let token = validator.issue_token(&claims)?;
        let decoded = validator.validate_token(&token)?;
        assert_eq!(decoded.username, "");
        Ok(())
    }
}
