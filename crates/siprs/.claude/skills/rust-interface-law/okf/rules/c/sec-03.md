---
type: "Rule"
title: "SEC-03 — Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them."
description: "Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "sec-03"
    title: "SEC-03"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "mapping / redaction / audit tests"
x-parent: "SEC"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "SEC-03"
x-source-part: "Part II"
x-source-span: "381-381"
x-verification: "V2 secret scan."
---
# SEC-03

Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | SEC |
| Source part | Part II |
| Verification | V2 secret scan. |
| Enforcement | mapping / redaction / audit tests |

[9.3 Security](../../sources/part-ii-1/9-3-security.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [SEC-01 — Transport MUST use TLS outside loopback-only local mode.](sec-01.md)
- [SEC-02 — Authentication endpoints and mutating operations MUST be rate-limited.](sec-02.md)
- [SEC-04 — Dependencies MUST be audited for known vulnerabilities before release.](sec-04.md)
- [SEC-05 — Debug output MUST NOT leak request bodies or credentials.](sec-05.md)

[^sec-03]: sources/EXPERT-REVIEW-PACKAGE.md

