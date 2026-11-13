---
type: "Rule"
title: "GRPC-17 — Every reply message carries the operation's `request_id`."
description: "Every reply message carries the operation's `request_id`."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-17"
    title: "GRPC-17"
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
x-rule-id: "GRPC-17"
x-source-part: "Part III.9"
x-source-span: "137-137"
x-verification: "V3 test."
---
# GRPC-17

Every reply message carries the operation's `request_id`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[5. Generated Proto](../../sources/33-grpc/5-generated-proto.md)

[^grpc-17]: sources/33-GRPC.md

