---
type: "Rule"
title: "GRPC-05 — Generated protobuf types do not appear in `*-core` or `*-operation`."
description: "Generated protobuf types do not appear in `*-core` or `*-operation`."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-05"
    title: "GRPC-05"
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
x-rule-id: "GRPC-05"
x-source-part: "Part III.9"
x-source-span: "136-136"
x-verification: "V2 scan."
---
# GRPC-05

Generated protobuf types do not appear in `*-core` or `*-operation`.

| Field | Value |
|---|---|
| Class | G |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V2 scan. |
| Enforcement | conformance driver |

[5. Generated Proto](../../sources/33-grpc/5-generated-proto.md)

[^grpc-05]: sources/33-GRPC.md

