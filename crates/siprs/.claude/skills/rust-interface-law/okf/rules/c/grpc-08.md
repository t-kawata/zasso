---
type: "Rule"
title: "GRPC-08 — The adapter does not construct `VerifiedIdentity`."
description: "The adapter does not construct `VerifiedIdentity`."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-08"
    title: "GRPC-08"
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
x-rule-id: "GRPC-08"
x-source-part: "Part III.9"
x-source-span: "159-159"
x-verification: "V1; V3 compile-fail."
---
# GRPC-08

The adapter does not construct `VerifiedIdentity`.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V1; V3 compile-fail. |
| Enforcement | conformance driver |

[6. Authentication](../../sources/33-grpc/6-authentication.md)

[^grpc-08]: sources/33-GRPC.md

