---
type: "Rule"
title: "GRPC-09 — The interceptor does not authorize the target; the operation does."
description: "The interceptor does not authorize the target; the operation does."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-09"
    title: "GRPC-09"
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
x-rule-id: "GRPC-09"
x-source-part: "Part III.9"
x-source-span: "160-160"
x-verification: "V3 bypass test."
---
# GRPC-09

The interceptor does not authorize the target; the operation does.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 bypass test. |
| Enforcement | conformance driver |

[6. Authentication](../../sources/33-grpc/6-authentication.md)

[^grpc-09]: sources/33-GRPC.md

