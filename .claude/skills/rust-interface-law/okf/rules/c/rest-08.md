---
type: "Rule"
title: "REST-08 — Mutating requests accept `Idempotency-Key` and pass it in `WireContext`."
description: "Mutating requests accept `Idempotency-Key` and pass it in `WireContext`."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-08"
    title: "REST-08"
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
x-rule-id: "REST-08"
x-source-part: "Part III.6"
x-source-span: "159-159"
x-verification: "V3 test."
---
# REST-08

Mutating requests accept `Idempotency-Key` and pass it in `WireContext`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[6. HTTP Rules](../../sources/30-rest/6-http-rules.md)

[^rest-08]: sources/30-REST.md

