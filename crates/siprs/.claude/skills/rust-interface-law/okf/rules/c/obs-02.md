---
type: "Rule"
title: "OBS-02 — Logs MUST NOT include tokens, secrets, authorization codes, or passwords."
description: "Logs MUST NOT include tokens, secrets, authorization codes, or passwords."
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "obs-02"
    title: "OBS-02"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "all"
x-enforcement: "mapping / redaction / audit tests"
x-parent: "OBS"
x-phase: "operation"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "OBS-02"
x-source-part: "Part II"
x-source-span: "303-303"
x-verification: "V2 scan; V3 test."
---
# OBS-02

Logs MUST NOT include tokens, secrets, authorization codes, or passwords.

| Field | Value |
|---|---|
| Class | C |
| Applies to | all |
| Parent | OBS |
| Source part | Part II |
| Verification | V2 scan; V3 test. |
| Enforcement | mapping / redaction / audit tests |

[9.2 Observability](../../sources/part-ii-1/9-2-observability.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [OBS-01 — Logs MUST be structured and include `request_id`, `operation_id`, `subject`, ...](obs-01.md)
- [OBS-03 — Metrics MUST cover operation latency, error rate, authentication failures, an...](obs-03.md)
- [OBS-04 — Metrics and logs MUST distinguish interface, operation, and error code.](obs-04.md)
- [OBS-05 — Health endpoints MUST be minimal in public mode; detailed readiness is privil...](obs-05.md)

[^obs-02]: sources/EXPERT-REVIEW-PACKAGE.md

