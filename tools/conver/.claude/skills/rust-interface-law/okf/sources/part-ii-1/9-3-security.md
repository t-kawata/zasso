---
type: "Section"
title: "9.3 Security"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/9-3-security"
    title: "9.3 Security"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/9-3-security"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "870-870"
---
### 9.3 Security

| ID | Rule | Verification |
|---|---|---|
| SEC-01 | Transport MUST use TLS outside loopback-only local mode. | V2 config check. |
| SEC-02 | Authentication endpoints and mutating operations MUST be rate-limited. | V3 load test. |
| SEC-03 | Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them. | V2 secret scan. |
| SEC-04 | Dependencies MUST be audited for known vulnerabilities before release. | V2 audit command. |
| SEC-05 | Debug output MUST NOT leak request bodies or credentials. | V2 scan; V3 test. |

---

## 10. Conformance

## Rules in this section

- [SEC-01 — Transport MUST use TLS outside loopback-only local mode.](../../rules/c/sec-01.md)
- [SEC-02 — Authentication endpoints and mutating operations MUST be rate-limited.](../../rules/c/sec-02.md)
- [SEC-03 — Configuration and secrets MUST come from environment or a secret store; sourc...](../../rules/c/sec-03.md)
- [SEC-04 — Dependencies MUST be audited for known vulnerabilities before release.](../../rules/c/sec-04.md)
- [SEC-05 — Debug output MUST NOT leak request bodies or credentials.](../../rules/c/sec-05.md)

