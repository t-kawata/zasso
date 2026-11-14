---
type: "Rule"
title: "GRPC-06 — Credentials come from gRPC metadata, not from the message body."
description: "Credentials come from gRPC metadata, not from the message body."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-06"
    title: "GRPC-06"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "grpc"
x-enforcement: "conformance driver"
x-parent: "GRPC"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "GRPC-06"
x-source-part: "Part III.9"
x-source-span: "157-157"
x-verification: "V3 test."
---
# GRPC-06

Credentials come from gRPC metadata, not from the message body.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 test. |
| Enforcement | conformance driver |

[6. Authentication](../../sources/part-iii-9/6-authentication.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [GRPC-07 — Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`.](grpc-07.md)
- [GRPC-08 — The adapter does not construct `VerifiedIdentity`.](grpc-08.md)
- [GRPC-09 — The interceptor does not authorize the target; the operation does.](grpc-09.md)

[^grpc-06]: sources/EXPERT-REVIEW-PACKAGE.md

