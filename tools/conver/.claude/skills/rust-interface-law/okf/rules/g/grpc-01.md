---
type: "Rule"
title: "GRPC-01 — The proto is generated from the catalog and checked in."
description: "The proto is generated from the catalog and checked in."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-01"
    title: "GRPC-01"
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
x-rule-class: "G"
x-rule-id: "GRPC-01"
x-source-part: "Part III.9"
x-source-span: "132-132"
x-verification: "V2 diff."
---
# GRPC-01

The proto is generated from the catalog and checked in.

| Field | Value |
|---|---|
| Class | G |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V2 diff. |
| Enforcement | conformance driver |

[5. Generated Proto](../../sources/33-grpc/5-generated-proto.md)

[^grpc-01]: sources/33-GRPC.md

