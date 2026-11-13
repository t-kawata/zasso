---
type: "Section"
title: "4. Generated Mechanics"
description: "The generator consumes the operation catalog and emits the parts that are"
sources: 
  - resource: "sources/00-FOUNDATION.md"
    id: "00-foundation-4-generated-mechanics"
    title: "4. Generated Mechanics"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/00-FOUNDATION.md"
x-source-span: "89-112"
---
## 4. Generated Mechanics

The generator consumes the operation catalog and emits the parts that are
identical or mechanically derivable in every project.

| Input | Generated output |
|---|---|
| Operation catalog entry | `Operation` trait implementation skeleton in `*-operation`. |
| Request/response types | Serde attributes, JSON schema, protobuf messages, CLI flags, MCP tool schema. |
| REST binding | Router registration, path/method, extractor wiring, OpenAPI entry. |
| WebSocket binding | Operation dispatch entry, envelope conversion, correlation. |
| CLI binding | Subcommand, flag parsing, output formatter. |
| gRPC binding | Proto service method, metadata extraction, status mapping. |
| MCP binding | Tool registration, input/output schema, error mapping. |
| A2A binding | Skill/task mapping, event conversion. |
| Catalog entry | Conformance matrix row and test skeleton. |
| Rule ID | Gate command mapping and coverage row. |

Generated files are marked as generated. They are not hand-edited. A project
changes behavior by changing the catalog, the hand-written handler body, or an
extension trait, not by editing generated code.

---

