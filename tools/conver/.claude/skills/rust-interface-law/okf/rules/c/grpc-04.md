---
type: "Rule"
title: "GRPC-04 — `Context` uses the fixed field numbers from Part III.2 §8.1."
description: "`Context` uses the fixed field numbers from Part III.2 §8.1."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-04"
    title: "GRPC-04"
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
x-rule-id: "GRPC-04"
x-source-part: "Part III.9"
x-source-span: "135-135"
x-verification: "V2 schema check."
---
# GRPC-04

`Context` uses the fixed field numbers from Part III.2 §8.1.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V2 schema check. |
| Enforcement | conformance driver |

[5. Generated Proto](../../sources/33-grpc/5-generated-proto.md)

[^grpc-04]: sources/33-GRPC.md

