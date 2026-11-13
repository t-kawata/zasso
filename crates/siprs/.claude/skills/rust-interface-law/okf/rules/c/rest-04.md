---
type: "Rule"
title: "REST-04 — The audience is configured per router and passed to the verifier."
description: "The audience is configured per router and passed to the verifier."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-04"
    title: "REST-04"
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
x-rule-id: "REST-04"
x-source-part: "Part III.6"
x-source-span: "155-155"
x-verification: "V3 audience test."
---
# REST-04

The audience is configured per router and passed to the verifier.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 audience test. |
| Enforcement | conformance driver |

[6. HTTP Rules](../../sources/30-rest/6-http-rules.md)

[^rest-04]: sources/30-REST.md

