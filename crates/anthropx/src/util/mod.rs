//! # ユーティリティ関数
//!
//! HTTP ヘッダ処理、リクエスト ID 生成など、ルーティングに付随する純粋ロジック関数群。

pub mod ids;

use http::header::{self, HeaderValue};
use http::HeaderMap;

/// 転送が禁止される hop-by-hop header 一覧（RFC §3.2）。
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
/// - hop-by-hop header（転送禁止）
/// - クライアント由来の認証情報（`authorization`, `x-api-key`）
pub fn build_upstream_headers(client_headers: &HeaderMap, provider_api_key: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();

    for (name, value) in client_headers {
        let name_str = name.as_str().to_ascii_lowercase();

        // hop-by-hop header を除外
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
        HeaderValue::from_str(&format!("Bearer {}", provider_api_key))
            .expect("valid Bearer token header"),
    );

    headers
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Authorization header が provider の Bearer で上書きされること。
    #[test]
    fn build_upstream_headers_filters_auth() {
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

        let result = build_upstream_headers(&client, "provider-key");

        // クライアント由来の x-api-key は除去されている
        assert!(!result.contains_key("x-api-key"));

        // Authorization は provider の Bearer で上書きされている（client の値ではない）
        assert_eq!(
            result.get(header::AUTHORIZATION).unwrap(),
            "Bearer provider-key"
        );

        // content-type は維持されている
        assert_eq!(
            result.get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
    }

    /// hop-by-hop header が除去されること。
    #[test]
    fn build_upstream_headers_filters_hop_by_hop() {
        let mut client = HeaderMap::new();
        client.insert(header::CONNECTION, HeaderValue::from_static("keep-alive"));
        client.insert(
            header::HeaderName::from_static("keep-alive"),
            HeaderValue::from_static("timeout=5"),
        );
        client.insert(header::ACCEPT, HeaderValue::from_static("application/json"));

        let result = build_upstream_headers(&client, "key");

        // hop-by-hop は除去
        assert!(!result.contains_key(header::CONNECTION));
        assert!(!result.contains_key("keep-alive"));

        // 通常ヘッダは維持
        assert_eq!(result.get(header::ACCEPT).unwrap(), "application/json");
    }

    /// 安全なヘッダは維持されること。
    #[test]
    fn build_upstream_headers_preserves_other() {
        let mut client = HeaderMap::new();
        client.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        client.insert(header::USER_AGENT, HeaderValue::from_static("test-client"));
        client.insert(header::ACCEPT, HeaderValue::from_static("text/plain"));

        let result = build_upstream_headers(&client, "key");

        assert_eq!(
            result.get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        assert_eq!(result.get(header::USER_AGENT).unwrap(), "test-client");
        assert_eq!(result.get(header::ACCEPT).unwrap(), "text/plain");
    }

    /// 空の client_headers でも Bearer のみが設定されること。
    #[test]
    fn build_upstream_headers_empty_client() {
        let client = HeaderMap::new();
        let result = build_upstream_headers(&client, "just-key");
        assert_eq!(result.len(), 1);
        assert_eq!(
            result.get(header::AUTHORIZATION).unwrap(),
            "Bearer just-key"
        );
    }
}
