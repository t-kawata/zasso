---
type: "Rule"
title: "REST-21 — OpenAPI operations and schemas MUST be generated from the same operation and validation manifest used at runtime."
description: "OpenAPI operations and schemas MUST be generated from the same operation and validation manifest used at runtime."
sources: 
  - resource: "sources/30-REST.md"
    id: "rest-21"
    title: "REST-21"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "rest"
x-enforcement: "conformance driver"
x-parent: "REST"
x-phase: "adapter"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "C"
x-rule-id: "REST-21"
x-source-part: "Part III.6"
x-source-span: "276-276"
x-verification: "V3 equality test."
---
# REST-21

OpenAPI operations and schemas MUST be generated from the same operation and validation manifest used at runtime.

| Field | Value |
|---|---|
| Class | C |
| Applies to | rest |
| Parent | REST |
| Source part | Part III.6 |
| Verification | V3 equality test. |
| Enforcement | conformance driver |

[11. Implementation Contract](../../sources/30-rest/11-implementation-contract.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](arc-01.md)
- [REST-19 — REST adapters MUST use the admitted HTTP crate and call the shared dispatcher...](rest-19.md)
- [REST-20 — Every REST rejection path MUST use the shared semantic error renderer and the...](rest-20.md)

[^rest-21]: sources/30-REST.md

