---
type: "Rule"
title: "GRPC-10 — Every category maps to the status above."
description: "Every category maps to the status above."
sources: 
  - resource: "sources/33-GRPC.md"
    id: "grpc-10"
    title: "GRPC-10"
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
x-rule-id: "GRPC-10"
x-source-part: "Part III.9"
x-source-span: "184-184"
x-verification: "V3 mapping test."
---
# GRPC-10

Every category maps to the status above.

| Field | Value |
|---|---|
| Class | C |
| Applies to | grpc |
| Parent | GRPC |
| Source part | Part III.9 |
| Verification | V3 mapping test. |
| Enforcement | conformance driver |

[7. Error Mapping](../../sources/part-iii-9/7-error-mapping.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [GRPC-11 — Rich details are encoded as `google.rpc.Status` details or the JSON detail fi...](grpc-11.md)

[^grpc-10]: sources/EXPERT-REVIEW-PACKAGE.md

