---
type: "Rule"
title: "REST-12 — The OpenAPI document lists exactly the routes the router serves."
description: "The OpenAPI document lists exactly the routes the router serves."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-12"
    title: "REST-12"
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
x-rule-id: "REST-12"
x-source-part: "Part III.6"
x-source-span: "163-163"
x-verification: "V2 diff; V3 test."
---
# REST-12

The OpenAPI document lists exactly the routes the router serves.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V2 diff; V3 test. |
| Enforcement | conformance driver |

[6. HTTP Rules](../../sources/30-rest/6-http-rules.md)

[^rest-12]: sources/30-REST.md

