---
type: "Rule"
title: "REST-19 — REST adapters MUST use the admitted HTTP crate and call the shared dispatcher through the adapter bridge."
description: "REST adapters MUST use the admitted HTTP crate and call the shared dispatcher through the adapter bridge."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-19"
    title: "REST-19"
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
x-rule-id: "REST-19"
x-source-part: "Part III.6"
x-source-span: "274-274"
x-verification: "V2 source; V3 route test."
---
# REST-19

REST adapters MUST use the admitted HTTP crate and call the shared dispatcher through the adapter bridge.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V2 source; V3 route test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/30-rest/11-implementation-contract.md)

[^rest-19]: sources/30-REST.md

