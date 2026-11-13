---
type: "Rule"
title: "REST-01 — Credentials come only from `Authorization: Bearer`."
description: "Credentials come only from `Authorization: Bearer`."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-01"
    title: "REST-01"
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
x-rule-id: "REST-01"
x-source-part: "Part III.6"
x-source-span: "152-152"
x-verification: "V3 test."
---
# REST-01

Credentials come only from `Authorization: Bearer`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[6. HTTP Rules](../../sources/30-rest/6-http-rules.md)

[^rest-01]: sources/30-REST.md

