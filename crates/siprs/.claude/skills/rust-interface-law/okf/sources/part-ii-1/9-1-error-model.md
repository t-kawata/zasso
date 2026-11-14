---
type: "Section"
title: "9.1 Error model"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/9-1-error-model"
    title: "9.1 Error model"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/9-1-error-model"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "850-850"
---
### 9.1 Error model

| ID | Rule | Verification |
|---|---|---|
| ERR-01 | Operations MUST return a protocol-independent error value with `code`, `domain`, `retryable`, and optional structured details. | V1 type. |
| ERR-02 | Error codes MUST be stable identifiers; adapters MUST map them to protocol statuses. | V3 mapping test. |
| ERR-03 | Error values MUST NOT contain secrets, tokens, passwords, or raw provider responses. | V2 scan; V3 redaction test. |
| ERR-04 | Retryability MUST be explicit. Validation and authentication errors are not retryable. | V3 test. |
| ERR-05 | Each interface MUST have one error-mapping table and one test per code. | V3 coverage test. |

### 9.2 Observability

## Rules in this section

- [ERR-01 — Operations MUST return a protocol-independent error value with `code`, `domai...](../../rules/c/err-01.md)
- [ERR-02 — Error codes MUST be stable identifiers; adapters MUST map them to protocol st...](../../rules/c/err-02.md)
- [ERR-03 — Error values MUST NOT contain secrets, tokens, passwords, or raw provider res...](../../rules/c/err-03.md)
- [ERR-04 — Retryability MUST be explicit. Validation and authentication errors are not r...](../../rules/c/err-04.md)
- [ERR-05 — Each interface MUST have one error-mapping table and one test per code.](../../rules/c/err-05.md)

