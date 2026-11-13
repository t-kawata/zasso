---
type: "Section"
title: "11. Generated and Hand-Written"
description: "| Generated | Hand-written |"
sources: 
  - resource: "sources/20-CORE.md"
    id: "20-core-11-generated-and-hand-written"
    title: "11. Generated and Hand-Written"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/20-CORE.md"
x-source-span: "211-220"
---
## 11. Generated and Hand-Written

| Generated | Hand-written |
|---|---|
| `lib.rs` module declarations from the catalog (optional). | Model types, invariants, transitions, ports. |
| None of the domain behavior. | All of the domain behavior. |

The core crate is almost entirely hand-written. The generator only ensures the
module skeleton exists and that the catalog references resolve.

