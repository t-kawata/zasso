---
type: "Rule"
title: "REST-17 — Anonymous operations use the public router and `execute_anonymous`; they are not a dispatcher bypass."
description: "Anonymous operations use the public router and `execute_anonymous`; they are not a dispatcher bypass."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-17"
    title: "REST-17"
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
x-rule-id: "REST-17"
x-source-part: "Part III.6"
x-source-span: "168-168"
x-verification: "V3 bypass test."
---
# REST-17

Anonymous operations use the public router and `execute_anonymous`; they are not a dispatcher bypass.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 bypass test. |
| Enforcement | conformance driver |

[6. HTTP Rules](../../sources/30-rest/6-http-rules.md)

[^rest-17]: sources/30-REST.md

