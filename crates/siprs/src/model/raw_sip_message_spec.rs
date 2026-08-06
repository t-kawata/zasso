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
//   - NODE_ID=N0024:  §16 Raw SIP Message Specification
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0024 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::config::client_config_spec::RawSipEventConfig;
use crate::config::observability_metrics::TransportKind;
use crate::error::SipError;

/// Redaction placeholder for secret header values.
///
/// RFC §16 shows `***REDACTED***`; the crate's established constant (used by the
/// P1-2 redaction tests) is `[REDACTED]` — kept for compatibility.
const REDACTED: &str = "[REDACTED]";

/// Direction of a SIP message, derived from its start line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SipMessageDirection {
    /// A SIP request — start line begins with a method token (e.g. `INVITE`).
    Request,
    /// A SIP response — start line begins with `SIP/2.0`.
    Response,
}

/// A parsed raw SIP message per RFC §16 (NODE_ID=N0024).
///
/// The raw bytes are not exposed directly; callers reach message content through
/// the typed fields and accessors (`start_line`, `headers`, `body`, `text`, ...).
#[derive(Debug, Clone)]
pub struct RawSipMessage {
    pub direction: SipMessageDirection,
    pub transport: TransportKind,
    pub start_line: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
    pub text: String,
    pub content_length: usize,
    pub remote_addr: Option<std::net::SocketAddr>,
    pub local_addr: Option<std::net::SocketAddr>,
}

// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
impl RawSipMessage {
    /// Parse a raw SIP message, retaining the full body with no redaction.
    pub fn parse(bytes: &[u8]) -> Result<Self, SipError> {
        Self::parse_impl(bytes, true, usize::MAX, false)
    }

    /// Parse honoring `RawSipEventConfig`: body retention, truncation, redaction.
    pub fn parse_with_config(bytes: &[u8], config: &RawSipEventConfig) -> Result<Self, SipError> {
        Self::parse_impl(
            bytes,
            config.include_bodies,
            config.max_body_bytes,
            config.redact_authorization,
        )
    }

// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn parse_impl(
        bytes: &[u8],
        include_bodies: bool,
        max_body_bytes: usize,
        redact_authorization: bool,
    ) -> Result<Self, SipError> {
        let text = String::from_utf8_lossy(bytes).into_owned();
        let (start_line, rest) = split_start_line(&text);
        let (direction, start_line) = parse_start_line(start_line)?;
        let (header_block, body_text) = split_body(rest);
        let headers = parse_headers(header_block);
        let mut body = if body_text.is_empty() {
            None
        } else {
            Some(body_text.as_bytes().to_vec())
        };
        if !include_bodies {
            body = None;
        } else if let Some(ref mut body_bytes) = body {
            body_bytes.truncate(max_body_bytes);
        }
        let content_length = body.as_ref().map(|b| b.len()).unwrap_or(0);
        let mut msg = Self {
            direction,
            transport: TransportKind::Udp,
            start_line,
            headers,
            body,
            text,
            content_length,
            remote_addr: None,
            local_addr: None,
        };
        if redact_authorization {
            msg = msg.redact_authorization();
        }
        Ok(msg)
    }

    /// The start line, e.g. `INVITE sip:alice@example.com SIP/2.0`.
    pub fn start_line(&self) -> &str {
        &self.start_line
    }

    /// All parsed headers, preserving original name casing and order.
    pub fn headers(&self) -> &[(String, String)] {
        &self.headers
    }

    /// First header value whose name matches `name` (case-insensitive).
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(n, _)| n.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }

    /// The message body as raw bytes, when present.
    pub fn body(&self) -> Option<&[u8]> {
        self.body.as_deref()
    }

    /// The full message text (lossy UTF-8 of the input bytes).
    pub fn text(&self) -> &str {
        &self.text
    }

    /// Number of bytes in the body; always `body().map(|b| b.len()).unwrap_or(0)`.
    pub fn content_length(&self) -> usize {
        self.content_length
    }

    pub fn direction(&self) -> SipMessageDirection {
        self.direction
    }

    pub fn transport(&self) -> TransportKind {
        self.transport.clone()
    }

    pub fn remote_addr(&self) -> Option<std::net::SocketAddr> {
        self.remote_addr
    }

    pub fn local_addr(&self) -> Option<std::net::SocketAddr> {
        self.local_addr
    }

    /// Immutably redact password values in `Authorization` / `Proxy-Authorization`.
    ///
    /// Returns a new `RawSipMessage`; the original is unchanged. The redacted
    /// `text` is rebuilt from `start_line` + redacted `headers` + `body`.
    pub fn redact_authorization(&self) -> Self {
        let headers: Vec<(String, String)> = self
            .headers
            .iter()
            .map(|(name, value)| {
                if is_redactable_header(name) {
                    (name.clone(), redact_password_value(value))
                } else {
                    (name.clone(), value.clone())
                }
            })
            .collect();
        let text = serialize_text(&self.start_line, &headers, self.body.as_deref());
        Self {
            headers,
            text,
            ..self.clone()
        }
    }
}

/// Split the start line from the remainder of the message.
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
fn split_start_line(text: &str) -> (&str, &str) {
    if let Some(pos) = text.find("\r\n") {
        (&text[..pos], &text[pos + 2..])
    } else if let Some(pos) = text.find('\n') {
        (&text[..pos], &text[pos + 1..])
    } else {
        (text, "")
    }
}

/// Classify a start line as a request or a response.
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
fn parse_start_line(line: &str) -> Result<(SipMessageDirection, String), SipError> {
    if line.starts_with("SIP/2.0") {
        let rest = &line["SIP/2.0".len()..];
        if !rest.trim_start().starts_with(|c: char| c.is_ascii_digit()) {
            return Err(SipError::invalid_argument(
                "SIP response start line must carry a status code",
            ));
        }
        Ok((SipMessageDirection::Response, line.to_string()))
    } else {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 || parts[2] != "SIP/2.0" {
            return Err(SipError::invalid_argument(
                "request start line must be '<METHOD> <target> SIP/2.0'",
            ));
        }
        Ok((SipMessageDirection::Request, line.to_string()))
    }
}

/// Split the header block from the body at the first blank line.
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
fn split_body(text: &str) -> (&str, &str) {
    if let Some(pos) = text.find("\r\n\r\n") {
        (&text[..pos], &text[pos + 4..])
    } else if let Some(pos) = text.find("\n\n") {
        (&text[..pos], &text[pos + 2..])
    } else {
        (text, "")
    }
}

/// Parse the header block into `(name, value)` pairs.
///
/// Continuation lines (leading space/tab) are folded into the previous value;
/// lines without a `:` are skipped (best-effort, total parser).
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
fn parse_headers(block: &str) -> Vec<(String, String)> {
    let mut headers: Vec<(String, String)> = Vec::new();
    for raw_line in block.lines() {
        let line = raw_line.trim_end_matches('\r');
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some(last) = headers.last_mut() {
                last.1.push(' ');
                last.1.push_str(line.trim());
            }
            continue;
        }
        if line.trim().is_empty() {
            continue;
        }
        if let Some(colon) = line.find(':') {
            let name = line[..colon].trim().to_string();
            let value = line[colon + 1..].trim().to_string();
            if !name.is_empty() {
                headers.push((name, value));
            }
        }
    }
    headers
}

/// Rebuild the message text from its parsed parts.
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
fn serialize_text(start_line: &str, headers: &[(String, String)], body: Option<&[u8]>) -> String {
    let mut out = String::new();
    out.push_str(start_line);
    out.push_str("\r\n");
    for (name, value) in headers {
        out.push_str(name);
        out.push_str(": ");
        out.push_str(value);
        out.push_str("\r\n");
    }
    out.push_str("\r\n");
    if let Some(bytes) = body {
        out.push_str(&String::from_utf8_lossy(bytes));
    }
    out
}

/// Whether a header name is one whose value must be redacted.
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
fn is_redactable_header(name: &str) -> bool {
    name.eq_ignore_ascii_case("Authorization") || name.eq_ignore_ascii_case("Proxy-Authorization")
}

/// Replace `password="<value>"` with `password="[REDACTED]"` in a header value.
///
/// Preserves the auth scheme (e.g. `Digest`, `Basic`) and all other parameters.
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
fn redact_password_value(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut pos = 0;
    while let Some(pw_start) = value[pos..].to_ascii_lowercase().find("password=\"") {
        result.push_str(&value[pos..pos + pw_start]);
        result.push_str("password=\"");
        let after_pw_eq = pos + pw_start + "password=\"".len();
        if let Some(quote_end) = value[after_pw_eq..].find('"') {
            result.push_str(REDACTED);
            result.push('"');
            pos = after_pw_eq + quote_end + 1;
        } else {
            result.push_str(&value[after_pw_eq..]);
            pos = value.len();
            break;
        }
    }
    result.push_str(&value[pos..]);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::SipErrorKind;

    // ── C025-Post: RFC §16 happy path ──────────────────────────────────

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_post_parse_invite_asserts_all_fields() {
        let bytes = b"INVITE sip:alice@example.com SIP/2.0\r\nVia: SIP/2.0/UDP 192.0.2.1\r\nFrom: <sip:alice@example.com>\r\nTo: <sip:bob@example.com>\r\nCall-ID: abc123\r\nContent-Length: 5\r\n\r\nhello";
        let msg = RawSipMessage::parse(bytes).expect("valid INVITE parses");
        assert_eq!(msg.direction, SipMessageDirection::Request);
        assert_eq!(msg.transport, TransportKind::Udp);
        assert_eq!(msg.start_line, "INVITE sip:alice@example.com SIP/2.0");
        assert_eq!(msg.headers.len(), 5);
        assert_eq!(msg.header("Call-ID"), Some("abc123"));
        assert_eq!(msg.body(), Some(&b"hello"[..]));
        assert_eq!(msg.content_length, 5);
        assert_eq!(msg.text(), String::from_utf8_lossy(bytes));
        assert_eq!(msg.remote_addr, None);
        assert_eq!(msg.local_addr, None);
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_post_parse_response_200_ok() {
        let msg = RawSipMessage::parse(b"SIP/2.0 200 OK\r\nCall-ID: abc\r\nContent-Length: 0\r\n\r\n")
            .expect("valid 200 OK parses");
        assert_eq!(msg.direction, SipMessageDirection::Response);
        assert_eq!(msg.start_line, "SIP/2.0 200 OK");
        assert_eq!(msg.body(), None);
        assert_eq!(msg.content_length, 0);
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_post_header_lookup_is_case_insensitive() {
        let msg = RawSipMessage::parse(b"INVITE sip:alice@example.com SIP/2.0\r\nFrom: <sip:alice@example.com>\r\n\r\n")
            .expect("parses");
        assert_eq!(msg.header("from"), Some("<sip:alice@example.com>"));
        assert_eq!(msg.header("FROM"), Some("<sip:alice@example.com>"));
        assert_eq!(msg.header("Missing"), None);
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_post_body_present_yields_some() {
        let msg = RawSipMessage::parse(b"INVITE sip:x SIP/2.0\r\nContent-Length: 3\r\n\r\nabc")
            .expect("parses");
        assert_eq!(msg.body(), Some(&b"abc"[..]));
        assert_eq!(msg.content_length, 3);
    }

    // ── C025: Error cases ──────────────────────────────────────────────

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_error_empty_input_returns_invalid_argument() {
        let err = RawSipMessage::parse(b"").expect_err("empty input must fail");
        assert_eq!(err.kind, SipErrorKind::InvalidArgument);
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_error_non_sip_start_line_returns_err() {
        assert!(RawSipMessage::parse(b"HELLO\r\n\r\n").is_err());
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_error_response_missing_status_code_returns_err() {
        assert!(RawSipMessage::parse(b"SIP/2.0\r\n\r\n").is_err());
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_error_truncated_request_still_parses() {
        let msg = RawSipMessage::parse(b"INVITE sip:x SIP/2.0").expect("truncated but valid start line parses");
        assert_eq!(msg.direction, SipMessageDirection::Request);
        assert_eq!(msg.body(), None);
        assert!(msg.headers().is_empty());
    }

    // ── C025: Boundary cases ───────────────────────────────────────────

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_boundary_no_body_yields_none() {
        let msg = RawSipMessage::parse(b"INVITE sip:x SIP/2.0\r\nVia: SIP/2.0/UDP 192.0.2.1\r\n\r\n")
            .expect("parses");
        assert_eq!(msg.body(), None);
        assert_eq!(msg.content_length, 0);
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_boundary_empty_header_block() {
        let msg = RawSipMessage::parse(b"INVITE sip:x SIP/2.0\r\n\r\n").expect("parses");
        assert!(msg.headers().is_empty());
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_boundary_content_length_absent_derives_from_body() {
        let msg = RawSipMessage::parse(b"INVITE sip:x SIP/2.0\r\nVia: SIP/2.0/UDP 192.0.2.1\r\n\r\nhello")
            .expect("parses");
        assert_eq!(msg.content_length, 5);
        assert_eq!(msg.body(), Some(&b"hello"[..]));
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_boundary_content_length_header_larger_than_body() {
        let msg = RawSipMessage::parse(b"INVITE sip:x SIP/2.0\r\nContent-Length: 999\r\n\r\nhi")
            .expect("parses");
        assert_eq!(msg.content_length, 2, "actual body length wins over header hint");
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_boundary_max_body_bytes_truncates() {
        let config = RawSipEventConfig {
            max_body_bytes: 2,
            ..RawSipEventConfig::default()
        };
        let msg = RawSipMessage::parse_with_config(b"INVITE sip:x SIP/2.0\r\nContent-Length: 5\r\n\r\nhello", &config)
            .expect("parses");
        assert_eq!(msg.body(), Some(&b"he"[..]));
        assert_eq!(msg.content_length, 2);
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_boundary_include_bodies_false_drops_body() {
        let config = RawSipEventConfig {
            include_bodies: false,
            ..RawSipEventConfig::default()
        };
        let msg = RawSipMessage::parse_with_config(b"INVITE sip:x SIP/2.0\r\nContent-Length: 5\r\n\r\nhello", &config)
            .expect("parses");
        assert_eq!(msg.body(), None);
        assert_eq!(msg.content_length, 0);
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_boundary_lf_only_separator_accepted() {
        let msg = RawSipMessage::parse(b"INVITE sip:x SIP/2.0\nVia: SIP/2.0/UDP 192.0.2.1\n\nhello")
            .expect("LF-only separator accepted as best-effort");
        assert_eq!(msg.start_line, "INVITE sip:x SIP/2.0");
        assert_eq!(msg.headers.len(), 1);
        assert_eq!(msg.body(), Some(&b"hello"[..]));
    }

    // ── C025-Inv: Invariants ───────────────────────────────────────────

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_inv_clone_and_debug_compile_time() {
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<RawSipMessage>();
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_inv_content_length_matches_body() {
        let fixtures: [&[u8]; 3] = [
            b"INVITE sip:x SIP/2.0\r\n\r\n",
            b"INVITE sip:x SIP/2.0\r\nContent-Length: 3\r\n\r\nabc",
            b"SIP/2.0 200 OK\r\n\r\n",
        ];
        for fixture in fixtures {
            let msg = RawSipMessage::parse(fixture).expect("parses");
            assert_eq!(msg.content_length, msg.body().map(|b| b.len()).unwrap_or(0));
        }
    }

    /// @verifies C025
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_inv_parse_is_total_never_panics() {
        let inputs: [&[u8]; 6] = [
            b"",
            b"HELLO\r\n\r\n",
            b"SIP/2.0\r\n\r\n",
            b"INVITE sip:x SIP/2.0",
            b"\xff\xfe\x00INVITE",
            b"INVITE sip:x SIP/2.0\r\nBad Header No Colon\r\n\r\n",
        ];
        for input in inputs {
            let outcome = std::panic::catch_unwind(|| RawSipMessage::parse(input));
            assert!(outcome.is_ok(), "parse must never panic");
        }
    }

    /// @verifies C025, C048
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_inv_redaction_immutable_covers_both_headers() {
        let bytes = b"INVITE sip:alice@example.com SIP/2.0\r\nAuthorization: Digest password=\"s3cret!\"\r\nProxy-Authorization: Digest password=\"p4ss\"\r\nContent-Length: 0\r\n\r\n";
        let original = RawSipMessage::parse(bytes).expect("parses");
        let redacted = original.redact_authorization();
        // Immutable pattern: the original is unchanged.
        assert_eq!(
            original.header("Authorization").expect("auth header"),
            "Digest password=\"s3cret!\""
        );
        // Redacted output hides both passwords.
        assert!(!redacted.text().contains("s3cret!"), "Authorization password redacted");
        assert!(!redacted.text().contains("p4ss"), "Proxy-Authorization password redacted");
        assert!(redacted.text().contains("[REDACTED]"), "redaction placeholder present");
        assert_eq!(redacted.content_length, redacted.body().map(|b| b.len()).unwrap_or(0));
    }

    /// @verifies C025, C048
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_inv_redaction_is_idempotent() {
        let bytes = b"INVITE sip:alice@example.com SIP/2.0\r\nAuthorization: Digest password=\"s3cret!\"\r\n\r\n";
        let msg = RawSipMessage::parse(bytes).expect("parses");
        let once = msg.redact_authorization();
        let twice = once.redact_authorization();
        assert_eq!(once.text(), twice.text());
    }

    /// @verifies C025, C048
    #[test]
// [::TICKET::] P9-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-4 --for-spec --no-implementation-order`.
    fn c025_inv_redaction_preserves_other_fields() {
        let bytes = b"INVITE sip:alice@example.com SIP/2.0\r\nAuthorization: Digest password=\"s3cret!\"\r\nContent-Length: 5\r\n\r\nhello";
        let msg = RawSipMessage::parse(bytes).expect("parses");
        let redacted = msg.redact_authorization();
        assert_eq!(redacted.body(), msg.body());
        assert_eq!(redacted.direction, msg.direction);
        assert_eq!(redacted.transport, msg.transport);
        assert_eq!(redacted.content_length, msg.content_length);
    }
}
