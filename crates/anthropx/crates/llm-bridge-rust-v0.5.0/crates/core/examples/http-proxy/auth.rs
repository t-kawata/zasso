//! Authentication helpers for the HTTP proxy example.
//!
//! This module contains the auth middleware used to validate inbound client
//! requests against the optional `PROXY_API_KEY` environment variable. The
//! comparison is performed in **constant time** to prevent timing side-channels
//! that would otherwise let an attacker recover the expected secret one byte at
//! a time by measuring response latency.

use axum::http::{HeaderMap, StatusCode};
use subtle::ConstantTimeEq;

use super::ProxyConfig;

/// Compare two strings in constant time.
///
/// # Why constant-time comparison?
///
/// The standard `==` operator for strings (and byte slices) short-circuits on
/// the first mismatched byte. An attacker who can measure response latency with
/// sufficient resolution can therefore determine how many leading bytes of a
/// guessed secret are correct, reducing a brute-force attack from O(256ⁿ) to
/// O(256 · n), where *n* is the secret length.
///
/// [`subtle::ConstantTimeEq::ct_eq`] always compares every byte of both inputs
/// regardless of where the first difference occurs, eliminating this timing
/// side-channel. The inputs are also required to be of equal length for the
/// comparison to succeed, which is acceptable here because the expected secret
/// has a known, fixed length.
///
/// # Arguments
///
/// * `a` - First string (typically the attacker-supplied value).
/// * `b` - Second string (typically the expected secret).
///
/// # Returns
///
/// `true` iff `a` and `b` are byte-for-byte identical.
pub(crate) fn constant_time_eq(a: &str, b: &str) -> bool {
    a.as_bytes().ct_eq(b.as_bytes()).into()
}

/// Validate the client-supplied API key, if authentication is enabled.
///
/// Authentication is enabled when [`ProxyConfig::proxy_api_key`] is `Some`. When
/// it is `None`, every request is allowed through and the function returns
/// `None`.
///
/// The client may provide the key in one of two ways:
///
/// * As a bare token in the `x-api-key` header (Anthropic convention).
/// * As a `Bearer <token>` value in the `Authorization` header (`OpenAI` / generic HTTP
///   convention).
///
/// Both forms are accepted so the same proxy can sit in front of either kind
/// of upstream client SDK without requiring client-side changes.
///
/// # Arguments
///
/// * `config` - The active proxy configuration.
/// * `headers` - The inbound request headers.
///
/// # Returns
///
/// * `None` when the request is authorised (or when auth is disabled).
/// * `Some(StatusCode::UNAUTHORIZED)` when the key is missing or does not match, so the caller can
///   short-circuit with a `401` response.
pub(crate) fn check_auth(config: &ProxyConfig, headers: &HeaderMap) -> Option<StatusCode> {
    let Some(ref expected) = config.proxy_api_key else {
        return None; // no auth required
    };

    let provided = headers
        .get("x-api-key")
        .or_else(|| headers.get("authorization"))
        .and_then(|v| v.to_str().ok());

    match provided {
        Some(key)
            if constant_time_eq(key, expected)
                || constant_time_eq(key, &format!("Bearer {expected}")) =>
        {
            None
        }
        _ => Some(StatusCode::UNAUTHORIZED),
    }
}

#[cfg(test)]
mod tests {
    use axum::http::HeaderMap;

    use super::*;

    fn config_with_key(key: &str) -> ProxyConfig {
        ProxyConfig {
            upstream_url: String::new(),
            upstream_api_key: String::new(),
            proxy_api_key: Some(key.to_string()),
            router: None,
        }
    }

    fn config_without_key() -> ProxyConfig {
        ProxyConfig {
            upstream_url: String::new(),
            upstream_api_key: String::new(),
            proxy_api_key: None,
            router: None,
        }
    }

    #[test]
    fn test_should_return_none_when_auth_disabled() {
        let config = config_without_key();
        let headers = HeaderMap::new();
        assert!(check_auth(&config, &headers).is_none());
    }

    #[test]
    fn test_should_accept_matching_x_api_key() {
        let config = config_with_key("secret");
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", "secret".parse().unwrap());
        assert!(check_auth(&config, &headers).is_none());
    }

    #[test]
    fn test_should_accept_matching_bearer_token() {
        let config = config_with_key("secret");
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer secret".parse().unwrap());
        assert!(check_auth(&config, &headers).is_none());
    }

    #[test]
    fn test_should_reject_missing_key() {
        let config = config_with_key("secret");
        let headers = HeaderMap::new();
        assert_eq!(
            check_auth(&config, &headers),
            Some(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn test_should_reject_wrong_key() {
        let config = config_with_key("secret");
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", "wrong".parse().unwrap());
        assert_eq!(
            check_auth(&config, &headers),
            Some(StatusCode::UNAUTHORIZED)
        );
    }

    #[test]
    fn test_constant_time_eq_should_match_equal_strings() {
        assert!(constant_time_eq("hello", "hello"));
    }

    #[test]
    fn test_constant_time_eq_should_reject_different_strings() {
        assert!(!constant_time_eq("hello", "hell0"));
    }

    #[test]
    fn test_constant_time_eq_should_reject_different_lengths() {
        assert!(!constant_time_eq("short", "much longer"));
    }
}
