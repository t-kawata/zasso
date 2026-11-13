---
type: "Rule"
title: "GRPC-19 — A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient."
description: "A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-19"
    title: "GRPC-19"
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
x-rule-id: "GRPC-19"
x-source-part: "Part III.9"
x-source-span: "139-139"
x-verification: "V3 test."
---
# GRPC-19

A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[5. Generated Proto](../../sources/33-grpc/5-generated-proto.md)

[^grpc-19]: sources/33-GRPC.md

