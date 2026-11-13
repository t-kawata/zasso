---
type: "Rule"
title: "REST-18 — The reply `request_id` is the operation's `request_id`, including on errors."
description: "The reply `request_id` is the operation's `request_id`, including on errors."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-18"
    title: "REST-18"
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
x-rule-id: "REST-18"
x-source-part: "Part III.6"
x-source-span: "169-169"
x-verification: "V3 test."
---
# REST-18

The reply `request_id` is the operation's `request_id`, including on errors.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[6. HTTP Rules](../../sources/30-rest/6-http-rules.md)

[^rest-18]: sources/30-REST.md

