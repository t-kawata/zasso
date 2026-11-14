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

[5. Generated Proto](../../sources/part-iii-9/5-generated-proto.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [GRPC-01 — The proto is generated from the catalog and checked in.](../g/grpc-01.md)
- [GRPC-02 — Field numbers are never reused. Removed numbers are `reserved`.](grpc-02.md)
- [GRPC-04 — `Context` uses the fixed field numbers from Part III.2 §8.1.](grpc-04.md)
- [GRPC-05 — Generated protobuf types do not appear in `*-core` or `*-operation`.](../g/grpc-05.md)
- [GRPC-17 — Every reply message carries the operation's `request_id`.](grpc-17.md)
- [GRPC-18 — Typed protobuf messages are the gRPC binding; the universal JSON-bytes envelo...](grpc-18.md)
- [GRPC-19 — A cancelled operation's result is queryable through the authorized result loo...](grpc-19.md)

[^grpc-03]: sources/EXPERT-REVIEW-PACKAGE.md

