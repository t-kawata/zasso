---
type: "Rule"
title: "GRPC-03 — Scalars that need presence are declared `optional`."
description: "Scalars that need presence are declared `optional`."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-03"
    title: "GRPC-03"
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
x-rule-id: "GRPC-03"
x-source-part: "Part III.9"
x-source-span: "134-134"
x-verification: "V2 schema check."
---
# GRPC-03

Scalars that need presence are declared `optional`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V2 schema check. |
| Enforcement | conformance driver |

[5. Generated Proto](../../sources/33-grpc/5-generated-proto.md)

[^grpc-03]: sources/33-GRPC.md

