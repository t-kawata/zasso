---
type: "Rule"
title: "REST-21 — OpenAPI operations and schemas MUST be generated from the same operation and validation manifest used at runtime."
description: "OpenAPI operations and schemas MUST be generated from the same operation and validation manifest used at runtime."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-21"
    title: "REST-21"
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
x-rule-id: "REST-21"
x-source-part: "Part III.6"
x-source-span: "276-276"
x-verification: "V3 equality test."
---
# REST-21

OpenAPI operations and schemas MUST be generated from the same operation and validation manifest used at runtime.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 equality test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/30-rest/11-implementation-contract.md)

[^rest-21]: sources/30-REST.md

