---
type: "Rule"
title: "REST-09 — List endpoints define `limit`, `offset`, and optional `cursor`."
description: "List endpoints define `limit`, `offset`, and optional `cursor`."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-09"
    title: "REST-09"
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
x-rule-id: "REST-09"
x-source-part: "Part III.6"
x-source-span: "160-160"
x-verification: "V3 schema test."
---
# REST-09

List endpoints define `limit`, `offset`, and optional `cursor`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 schema test. |
| Enforcement | conformance driver |

[6. HTTP Rules](../../sources/30-rest/6-http-rules.md)

[^rest-09]: sources/30-REST.md

