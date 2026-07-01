//! # HTTP ヘッダ処理
//!
//! upstream リクエスト用のヘッダ構築および hop-by-hop ヘッダのフィルタリング。
//! RFC 7230 §6.1 で定義された hop-by-hop ヘッダはプロキシを越えて転送してはならない。

use http::HeaderMap;
/// server feature 有効時（reqwest + http crate 利用可能時）のみコンパイルされる。
use http::header::{self, HeaderValue};

use crate::config::ConfigError;

/// 転送が禁止される hop-by-hop header 一覧（RFC 7230 §6.1）。
///
/// これらのヘッダはプロキシを越えて転送されるべきではなく、
/// `build_upstream_headers` で除去される。
pub(crate) const HOP_BY_HOP_HEADERS: &[&str] = &[
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
];

/// upstream へ送信する header を構築する。
///
/// クライアント由来のヘッダから以下を除去した上で、provider の API key を
/// `Authorization: Bearer` として注入する:
///
/// - hop-by-hop header（RFC 7230 §6.1 — 転送禁止）
/// - クライアント由来の認証情報（`authorization`, `x-api-key`）
pub fn build_upstream_headers(
    client_headers: &HeaderMap,
    provider_api_key: &str,
) -> Result<HeaderMap, ConfigError> {
    let mut headers = HeaderMap::new();

    for (name, value) in client_headers {
        let name_str = name.as_str().to_ascii_lowercase();

        // hop-by-hop header を除外（プロキシ転送禁止）
        if HOP_BY_HOP_HEADERS.contains(&name_str.as_str()) {
            continue;
        }
        // クライアント由来の認証 header は常に除外
        if name_str == "authorization" || name_str == "x-api-key" {
            continue;
        }

        headers.insert(name.clone(), value.clone());
    }

    // provider の認証情報で上書き
    headers.insert(
        header::AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", provider_api_key)).map_err(|_| {
            ConfigError::InvalidValue("invalid Authorization header value".to_string())
        })?,
    );

    Ok(headers)
}
// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Authorization header が provider の Bearer で上書きされること。
    #[test]
    fn build_upstream_headers_filters_auth() -> Result<(), ConfigError> {
        let mut client = HeaderMap::new();
        client.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer client-token"),
        );
        client.insert(
            header::HeaderName::from_static("x-api-key"),
            HeaderValue::from_static("client-key"),
        );
        client.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );

        let result = build_upstream_headers(&client, "provider-key")?;

        // クライアント由来の x-api-key は除去されている
        assert!(!result.contains_key("x-api-key"));

        // Authorization は provider の Bearer で上書きされている（client の値ではない）
        assert_eq!(
            result.get(header::AUTHORIZATION),
            Some(&HeaderValue::from_static("Bearer provider-key"))
        );

        // content-type は維持されている
        assert_eq!(
            result.get(header::CONTENT_TYPE),
            Some(&HeaderValue::from_static("application/json"))
        );

        Ok(())
    }

    /// hop-by-hop header が除去されること。
    #[test]
    fn build_upstream_headers_filters_hop_by_hop() -> Result<(), ConfigError> {
        let mut client = HeaderMap::new();
        client.insert(header::CONNECTION, HeaderValue::from_static("keep-alive"));
        client.insert(
            header::HeaderName::from_static("keep-alive"),
            HeaderValue::from_static("timeout=5"),
        );
        client.insert(header::ACCEPT, HeaderValue::from_static("application/json"));

        let result = build_upstream_headers(&client, "key")?;

        // hop-by-hop は除去
        assert!(!result.contains_key(header::CONNECTION));
        assert!(!result.contains_key("keep-alive"));

        // 通常ヘッダは維持
        assert_eq!(
            result.get(header::ACCEPT),
            Some(&HeaderValue::from_static("application/json"))
        );

        Ok(())
    }

    /// 安全なヘッダは維持されること。
    #[test]
    fn build_upstream_headers_preserves_other() -> Result<(), ConfigError> {
        let mut client = HeaderMap::new();
        client.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        client.insert(header::USER_AGENT, HeaderValue::from_static("test-client"));
        client.insert(header::ACCEPT, HeaderValue::from_static("text/plain"));

        let result = build_upstream_headers(&client, "key")?;

        assert_eq!(
            result.get(header::CONTENT_TYPE),
            Some(&HeaderValue::from_static("application/json"))
        );
        assert_eq!(
            result.get(header::USER_AGENT),
            Some(&HeaderValue::from_static("test-client"))
        );
        assert_eq!(
            result.get(header::ACCEPT),
            Some(&HeaderValue::from_static("text/plain"))
        );

        Ok(())
    }

    /// 空の client_headers でも Bearer のみが設定されること。
    #[test]
    fn build_upstream_headers_empty_client() -> Result<(), ConfigError> {
        let client = HeaderMap::new();
        let result = build_upstream_headers(&client, "just-key")?;
        assert_eq!(result.len(), 1);
        assert_eq!(
            result.get(header::AUTHORIZATION),
            Some(&HeaderValue::from_static("Bearer just-key"))
        );

        Ok(())
    }
}
