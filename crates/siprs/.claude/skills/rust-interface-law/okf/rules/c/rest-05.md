---
type: "Rule"
title: "REST-05 — All REST success replies use 200 with the semantic envelope. 201, 202, and 204 are not used; aliases use 200."
description: "All REST success replies use 200 with the semantic envelope. 201, 202, and 204 are not used; aliases use 200."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-05"
    title: "REST-05"
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
x-rule-id: "REST-05"
x-source-part: "Part III.6"
x-source-span: "156-156"
x-verification: "V3 contract test."
---
# REST-05

All REST success replies use 200 with the semantic envelope. 201, 202, and 204 are not used; aliases use 200.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 contract test. |
| Enforcement | conformance driver |

[6. HTTP Rules](../../sources/30-rest/6-http-rules.md)

[^rest-05]: sources/30-REST.md

