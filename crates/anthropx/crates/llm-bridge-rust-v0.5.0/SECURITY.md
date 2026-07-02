# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow responsible disclosure practices.

### What to Report

- Buffer overflows or memory safety issues
- Injection vulnerabilities (SQL, command, etc.)
- Authentication/authorization bypasses
- Sensitive data exposure (API keys, tokens, PII)
- Denial of service vulnerabilities
- Insecure cryptographic practices
- Supply chain / dependency vulnerabilities

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please:

1. **Email:** Send details to [baoyx19870908@gmail.com](mailto:baoyx19870908@gmail.com)
   - Include a description of the vulnerability
   - Steps to reproduce (if applicable)
   - Potential impact
   - Suggested fix (if you have one)

2. **Wait for response:** We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

3. **Do not disclose:** Please do not disclose the vulnerability publicly until we have had a chance to address it.

### What to Expect

1. **Acknowledgment:** We will confirm receipt of your report within 48 hours.
2. **Assessment:** We will evaluate the severity and impact within 7 days.
3. **Fix development:** We will work on a fix and coordinate release with you.
4. **Disclosure:** We will coordinate public disclosure with you (typically after a fix is available).

### Scope

**In scope:**
- `llm-bridge-core` library (`crates/core/src/`)
- Official examples (`crates/core/examples/`)
- Server application (`apps/server/`)
- Build scripts and CI/CD

**Out of scope:**
- Third-party dependencies (report to the respective maintainers)
- Issues that require physical access to the user's system
- Social engineering attacks

## Security Best Practices

When using `llm-bridge-rust`, follow these best practices:

### API Key Management

- Store API keys in environment variables or secret managers
- Never hardcode API keys in source code
- Use different API keys for development and production
- Rotate API keys regularly

### TLS Configuration

- Use TLS 1.2 or higher for all upstream connections
- Verify TLS certificates (do not disable certificate validation)
- Use strong cipher suites

### Input Validation

The library implements multiple layers of input validation:
- JSON nesting depth limit (64 levels)
- Message count limit (10,000 messages)
- SSE stream buffer limit (1 MB)

Do not disable these limits unless you understand the implications.

### Error Handling

The library provides sanitized error messages via `TransformError::sanitized_message()`. Use this method when returning errors to clients to avoid leaking internal details.

### Dependencies

- Keep dependencies up to date
- Run `cargo audit` regularly
- Review `cargo deny` output for license compliance

## Security Features

`llm-bridge-rust` implements several security features:

- **Memory safety:** `#![forbid(unsafe_code)]` enforced
- **Error handling:** Zero `unwrap()`/`expect()` in production code
- **Input validation:** Layered boundary checks (depth, size, count)
- **Error sanitization:** Safe error messages for client exposure
- **No secrets in logs:** API keys and sensitive data are redacted
- **Constant-time comparison:** API key validation uses `subtle::ConstantTimeEq`

## Security Audits

This project undergoes regular security reviews. Recent audit reports:

- [Security Audit Report](docs/security-audit-report.md) — 2026-06-11

## Contact

For security-related questions or concerns:
- Email: [baoyx19870908@gmail.com](mailto:baoyx19870908@gmail.com)
- GitHub: [@baoyx19870908](https://github.com/baoyx19870908)

## Acknowledgments

We appreciate the work of security researchers who help keep this project safe. Contributors who report vulnerabilities will be acknowledged (with their permission) in our release notes.
