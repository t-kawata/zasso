---
type: "Rule"
title: "REST-20 — Every REST rejection path MUST use the shared semantic error renderer and the canonical request_id."
description: "Every REST rejection path MUST use the shared semantic error renderer and the canonical request_id."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-20"
    title: "REST-20"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "rest"
x-enforcement: "conformance driver"
x-parent: "REST"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "REST-20"
x-source-part: "Part III.6"
x-source-span: "275-275"
x-verification: "V3 rejection fixtures."
---
# REST-20

Every REST rejection path MUST use the shared semantic error renderer and the canonical request_id.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 rejection fixtures. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/30-rest/11-implementation-contract.md)

[^rest-20]: sources/30-REST.md

