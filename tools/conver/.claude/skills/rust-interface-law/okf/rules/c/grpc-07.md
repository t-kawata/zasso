---
type: "Rule"
title: "GRPC-07 — Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`."
description: "Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-07"
    title: "GRPC-07"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-applies-to: "grpc"
x-enforcement: "conformance driver"
x-parent: "GRPC"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "GRPC-07"
x-source-part: "Part III.9"
x-source-span: "158-158"
x-verification: "V3 test."
---
# GRPC-07

Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[6. Authentication](../../sources/33-grpc/6-authentication.md)

[^grpc-07]: sources/33-GRPC.md

