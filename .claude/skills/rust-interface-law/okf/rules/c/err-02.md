---
type: "Rule"
title: "ERR-02 — Error codes MUST be stable identifiers; adapters MUST map them to protocol statuses."
description: "Error codes MUST be stable identifiers; adapters MUST map them to protocol statuses."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "err-02"
    title: "ERR-02"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "mapping / redaction / audit tests"
x-parent: "ERR"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "ERR-02"
x-source-part: "Part II"
x-source-span: "226-226"
x-verification: "V3 mapping test."
---
# ERR-02

Error codes MUST be stable identifiers; adapters MUST map them to protocol statuses.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | ERR |
| Source part | Part II |
| Verification | V3 mapping test. |
| Enforcement | mapping / redaction / audit tests |

[9.1 Error model](../../sources/part-ii-1/9-1-error-model.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [ERR-01 — Operations MUST return a protocol-independent error value with `code`, `domai...](err-01.md)
- [ERR-03 — Error values MUST NOT contain secrets, tokens, passwords, or raw provider res...](err-03.md)
- [ERR-04 — Retryability MUST be explicit. Validation and authentication errors are not r...](err-04.md)
- [ERR-05 — Each interface MUST have one error-mapping table and one test per code.](err-05.md)

[^err-02]: sources/EXPERT-REVIEW-PACKAGE.md

