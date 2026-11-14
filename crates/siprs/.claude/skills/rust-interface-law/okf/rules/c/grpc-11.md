---
type: "Rule"
title: "GRPC-11 — Rich details are encoded as `google.rpc.Status` details or the JSON detail field; they never contain secrets."
description: "Rich details are encoded as `google.rpc.Status` details or the JSON detail field; they never contain secrets."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-11"
    title: "GRPC-11"
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
x-rule-id: "GRPC-11"
x-source-part: "Part III.9"
x-source-span: "185-185"
x-verification: "V3 redaction test."
---
# GRPC-11

Rich details are encoded as `google.rpc.Status` details or the JSON detail field; they never contain secrets.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 redaction test. |
| Enforcement | conformance driver |

[7. Error Mapping](../../sources/part-iii-9/7-error-mapping.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [GRPC-10 — Every category maps to the status above.](grpc-10.md)

[^grpc-11]: sources/EXPERT-REVIEW-PACKAGE.md

