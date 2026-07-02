# Security Audit Report — llm-bridge-rust

**Date:** 2026-06-11
**Auditor:** Automated security review
**Scope:** Full workspace — `crates/core/src/` (library), `crates/core/examples/http-proxy.rs` (reference proxy server), `apps/server/` (stub)
**Commit baseline:** `647a61c`

---

## Executive Summary

The `llm-bridge-core` library demonstrates a strong security posture: `unsafe_code` is forbidden, production code contains zero `unwrap()`/`expect()` calls, input validation is layered (JSON depth, message count, SSE byte limits), and error messages are sanitized before client exposure.

The `http-proxy` example (4 436 lines, effectively a reference proxy server) has several findings that range from **Critical** (TLS verification disabled in one handler) to **Low** (generous body limits). Most findings are confined to the example and do not affect the library crate.

---

## Findings

### 1. TLS Certificate Validation Disabled (Critical)

| Field | Value |
|---|---|
| **Severity** | **Critical** |
| **Location** | `crates/core/examples/http-proxy.rs:2130` |
| **Type** | CWE-295: Improper Certificate Validation |
| **Affects** | `http-proxy` example only |

```rust
let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(30))
    .connect_timeout(Duration::from_secs(10))
    .pool_idle_timeout(Duration::from_secs(30))
    .danger_accept_invalid_certs(true)   // ← TLS verification disabled
    .http1_only()
    .build()
    .expect("build reqwest client");
```

**Context:** This occurs in the OpenAI request handler (`handle_openai_request`). The Anthropic passthrough handler (line 1355) and the Anthropic-to-OpenAI handler (line 1596) do **not** disable TLS verification — they use the default safe configuration. Only the OpenAI → Anthropic upstream path is affected.

**Risk:** An attacker performing a man-in-the-middle attack between the proxy and the upstream Anthropic API could intercept all traffic, including API keys and user prompts/responses. Self-signed or expired certificates would be silently accepted.

**Recommendation:** Remove `.danger_accept_invalid_certs(true)`. If a specific upstream requires a custom CA certificate, use `.add_root_certificate()` with a certificate loaded from an environment variable or file.

---

### 2. Timing-Vulnerable API Key Comparison (High)

| Field | Value |
|---|---|
| **Severity** | **High** |
| **Location** | `crates/core/examples/http-proxy.rs:1295` |
| **Type** | CWE-208: Observable Timing Discrepancy |
| **Affects** | `http-proxy` example only |

```rust
fn check_auth(config: &ProxyConfig, headers: &HeaderMap) -> Option<StatusCode> {
    let Some(ref expected) = config.proxy_api_key else {
        return None;
    };
    let provided = headers
        .get("x-api-key")
        .or_else(|| headers.get("authorization"))
        .and_then(|v| v.to_str().ok());
    match provided {
        Some(key) if key == expected || key == format!("Bearer {expected}") => None,
        _ => Some(StatusCode::UNAUTHORIZED),
    }
}
```

**Risk:** The `==` operator on `&str` short-circuits on the first differing byte. An attacker can determine the correct API key one byte at a time by measuring response latency differences. While network jitter makes this impractical over high-latency links, it is feasible on localhost or LAN connections.

**Recommendation:** Use a constant-time comparison. Add the `subtle` crate and use `subtle::ConstantTimeEq`, or compare via `ring::constant_time::verify_slices_are_equal`. Example:

```rust
use subtle::ConstantTimeEq;

fn constant_time_eq(a: &str, b: &str) -> bool {
    a.as_bytes().ct_eq(b.as_bytes()).into()
}
```

---

### 3. Internal Error Details Leaked to Clients (Medium)

| Field | Value |
|---|---|
| **Severity** | **Medium** |
| **Location** | `crates/core/examples/http-proxy.rs:1539`, `2101`, `1387–1390`, `1949` |
| **Type** | CWE-209: Generation of Error Message Containing Sensitive Information |
| **Affects** | `http-proxy` example only |

```rust
// Line 1539 — transform error
format!("transform error: {e}")

// Line 1387 — upstream timeout
format!("upstream timeout: {e}")

// Line 1949 — body read failure
format!("failed to read upstream body: {e}")
```

**Risk:** The `Display` implementation of `TransformError` includes internal field names, buffer sizes, and upstream URL fragments. These are embedded verbatim into HTTP error responses sent to clients. An attacker can use this information to map internal architecture, discover buffer limits, or identify the transform library version.

**Note:** The core library already provides `TransformError::sanitized_message()` (model.rs:231–242) which strips internal details. The proxy does not use it.

**Recommendation:** Use `e.sanitized_message()` instead of `{e}` when building client-facing error responses. Log the full error server-side (already done via `error!()`) but return only the sanitized version.

---

### 4. No Rate Limiting (Medium)

| Field | Value |
|---|---|
| **Severity** | **Medium** |
| **Location** | `crates/core/examples/http-proxy.rs:2466–2474` (router setup) |
| **Type** | CWE-770: Allocation of Resources Without Limits or Throttling |
| **Affects** | `http-proxy` example only |

The proxy has no request rate limiting. A single client (or botnet) can send unlimited requests, each of which triggers an upstream API call. This creates:
- Financial risk: each request costs money via upstream LLM API billing.
- Denial of service: upstream rate limits may be hit, causing legitimate requests to fail.
- Resource exhaustion: even with the 16 MB body limit, concurrent connections are unbounded.

**Recommendation:** Add a rate limiter middleware (e.g., `tower-http` rate limiting or a token-bucket implementation). Apply per-client-IP and optionally per-API-key limits.

---

### 5. No CORS Configuration (Medium)

| Field | Value |
|---|---|
| **Severity** | **Medium** |
| **Location** | `crates/core/examples/http-proxy.rs:2466–2474` |
| **Type** | CWE-942: Overly Permissive Cross-domain Whitelist |
| **Affects** | `http-proxy` example only |

No CORS headers are set. While this implicitly prevents browser-based cross-origin requests (browsers will block responses without `Access-Control-Allow-Origin`), the absence of explicit CORS configuration means:
- If a reverse proxy or load balancer adds permissive CORS headers, the proxy will not override them.
- Pre-flight `OPTIONS` requests are not handled (the router only defines `POST` and `GET /health`).

**Recommendation:** Add explicit CORS middleware via `tower-http::cors::CorsLayer` with a restrictive origin policy, even if it is `CorsLayer::very_restrictive()`.

---

### 6. Debug Environment Variable Can Log Sensitive Stream Content (Medium)

| Field | Value |
|---|---|
| **Severity** | **Medium** |
| **Location** | `crates/core/examples/http-proxy.rs:947–979` |
| **Type** | CWE-532: Insertion of Sensitive Information into Log File |
| **Affects** | `http-proxy` example only |

```rust
fn should_log_raw_anthropic_sse() -> bool {
    env::var("DEBUG_ANTHROPIC_SSE")
        .is_ok_and(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
}

fn maybe_log_raw_anthropic_sse_chunk(label: &str, bytes: &[u8]) {
    // ...
    info!(label, raw_sse = %raw, "← downstream anthropic SSE raw");
}
```

When `DEBUG_ANTHROPIC_SSE=1` is set, the proxy logs the **full raw SSE stream content** at `INFO` level. This includes:
- User prompts sent to the LLM
- LLM-generated responses (which may contain PII, secrets, or proprietary content)
- Tool use inputs/outputs

**Risk:** In a production deployment, if this env var is accidentally enabled (or if log levels are set to capture INFO), sensitive user data and model outputs will be written to log files.

**Recommendation:** Gate raw content logging behind `DEBUG`/`TRACE` level instead of `INFO`. Add a startup warning when `DEBUG_ANTHROPIC_SSE` is enabled. Consider redacting content blocks and only logging metadata.

---

### 7. Streaming JSON Parsing Skips Depth Validation (Low)

| Field | Value |
|---|---|
| **Severity** | **Low** |
| **Location** | `crates/core/src/stream/openai_stream.rs:36`, `frame_dispatch.rs:40`, `openai_to_responses.rs:44`, `responses_to_anthropic_stream.rs:106` |
| **Type** | CWE-400: Uncontrolled Resource Consumption |
| **Affects** | `llm-bridge-core` library |

The non-streaming transform functions (`parse_anthropic_body`, `parse_openai_body`, etc.) all call `validate_json_depth(&value)` before processing. However, the streaming parsers deserialize individual SSE frame payloads directly via `serde_json::from_str(data)` without depth validation.

**Mitigating factors:**
- The overall SSE stream byte limit (`MAX_SSE_STREAM_BYTES = 1 MB`) is enforced before streaming begins.
- `serde_json` has a default recursion depth limit of 128 in its parser, which prevents stack overflow.
- Each frame is a single SSE `data:` line, limiting practical nesting depth.

**Recommendation:** Add `validate_json_depth()` calls to stream frame parsers for defense-in-depth consistency, or document the deliberate omission.

---

### 8. Configurable Bind Address Without Validation (Low)

| Field | Value |
|---|---|
| **Severity** | **Low** |
| **Location** | `crates/core/examples/http-proxy.rs:2534` |
| **Type** | CWE-200: Exposure of Sensitive Information |
| **Affects** | `http-proxy` example only |

```rust
let listen = env::var("PROXY_LISTEN")
    .unwrap_or_else(|_| "127.0.0.1:3000".to_string());
```

The default bind address `127.0.0.1:3000` is safe (loopback only). However, `PROXY_LISTEN` can be set to `0.0.0.0:3000` or any other address, exposing the proxy to the network. Since the proxy has no TLS termination, no rate limiting, and uses timing-vulnerable auth (finding #2), binding to a public interface would be dangerous.

**Recommendation:** Add a startup warning if the bind address is not a loopback address. Document the security requirements in the example header comments.

---

### 9. 16 MB Request Body Limit Is Generous (Low)

| Field | Value |
|---|---|
| **Severity** | **Low** |
| **Location** | `crates/core/examples/http-proxy.rs:2472` |
| **Type** | CWE-770: Allocation of Resources Without Limits |
| **Affects** | `http-proxy` example only |

```rust
.layer(RequestBodyLimitLayer::new(16 * 1024 * 1024)) // 16 MB
```

A 16 MB request body is large for an LLM API proxy. Typical requests are 1–100 KB. An attacker could send many 16 MB requests to exhaust server memory.

**Mitigating factors:** The core library enforces `MAX_MESSAGES_COUNT = 10_000` and `MAX_JSON_DEPTH = 64`, which limit the effective processing cost regardless of body size.

**Recommendation:** Reduce to 2–4 MB unless large request bodies (e.g., base64-encoded images) are explicitly needed.

---

### 10. Uses `native-tls` Instead of `rustls` (Low)

| Field | Value |
|---|---|
| **Severity** | **Low** |
| **Location** | `Cargo.toml:24` (workspace dependency) |
| **Type** | Best-practice deviation |
| **Affects** | Workspace (dev-dependency only for core; example proxy uses it) |

The workspace `reqwest` dependency uses `native-tls` (OpenSSL on Linux). The project guidelines specify `rustls` with `aws-lc-rs` backend. `native-tls` pulls in platform-specific C libraries (OpenSSL), which have a larger attack surface and supply chain risk than the pure-Rust `rustls`.

**Recommendation:** Switch the reqwest feature from `native-tls` to `rustls-tls` for production deployments. This is a dev-dependency of the core crate so the library itself is not affected.

---

## Positive Security Observations

The following security practices are correctly implemented:

| Practice | Location | Status |
|---|---|---|
| `#![forbid(unsafe_code)]` | `crates/core/src/lib.rs:7` | ✅ |
| No `unwrap()`/`expect()` in production library code | `crates/core/src/**` | ✅ |
| No `println!`/`dbg!` in production library code | `crates/core/src/**` | ✅ |
| JSON depth validation (`MAX_JSON_DEPTH = 64`) | `model.rs:470`, used in all body parsers | ✅ |
| Message count limits (`MAX_MESSAGES_COUNT = 10_000`) | Enforced in all 5 transform entry points | ✅ |
| SSE stream buffer limit (`MAX_SSE_STREAM_BYTES = 1 MB`) | `streaming_entry.rs`, `stream/mod.rs` | ✅ |
| Client-safe error sanitization (`sanitized_message()`) | `model.rs:231–242` | ✅ |
| Sensitive header redaction in logs (`redact_headers()`) | `http-proxy.rs:234–253` | ✅ |
| Auth headers stripped before forwarding upstream | `http-proxy.rs:1073–1089` | ✅ |
| Upstream auth never uses client-supplied keys | `http-proxy.rs:1133–1137` | ✅ |
| `.env` excluded via `.gitignore` | `.gitignore:10` | ✅ |
| No file system operations in library code | `crates/core/src/**` | ✅ |
| No `env::var()` in library code | `crates/core/src/**` | ✅ |
| Reqwest timeouts configured (30s request, 10s connect) | `http-proxy.rs:1597–1599` | ✅ |
| Request body limit layer (16 MB) | `http-proxy.rs:2472` | ✅ |
| Hop-by-hop headers correctly stripped | `http-proxy.rs:1073–1089` | ✅ |
| Saturating arithmetic for sequence numbers | `stream_helpers.rs:36` | ✅ |
| `#[non_exhaustive]` on public enums | `model.rs` (`ApiFormat`, `ContentBlock`, etc.) | ✅ |

---

## Summary Table

| # | Finding | Severity | Component | CWE |
|---|---|---|---|---|
| 1 | TLS certificate validation disabled | **Critical** | http-proxy | CWE-295 |
| 2 | Timing-vulnerable API key comparison | **High** | http-proxy | CWE-208 |
| 3 | Internal error details leaked to clients | Medium | http-proxy | CWE-209 |
| 4 | No rate limiting | Medium | http-proxy | CWE-770 |
| 5 | No CORS configuration | Medium | http-proxy | CWE-942 |
| 6 | Debug env var logs sensitive stream content | Medium | http-proxy | CWE-532 |
| 7 | Streaming JSON parsing skips depth validation | Low | core library | CWE-400 |
| 8 | Configurable bind address without validation | Low | http-proxy | CWE-200 |
| 9 | 16 MB request body limit is generous | Low | http-proxy | CWE-770 |
| 10 | Uses `native-tls` instead of `rustls` | Low | workspace | Best practice |

---

## Remediation Priority

1. **Immediate:** Fix #1 (remove `danger_accept_invalid_certs`) — this is a single-line change with significant security impact.
2. **Short-term:** Fix #2 (constant-time comparison) and #3 (use `sanitized_message()`).
3. **Medium-term:** Add rate limiting (#4) and CORS (#5) if the proxy is deployed beyond local development.
4. **Backlog:** Address Low-severity findings (#7–#10) as part of ongoing hardening.

---

*Note: `cargo audit` could not be run during this review due to sandbox restrictions. A manual dependency audit should be performed separately using `cargo audit` and `cargo-deny`.*
