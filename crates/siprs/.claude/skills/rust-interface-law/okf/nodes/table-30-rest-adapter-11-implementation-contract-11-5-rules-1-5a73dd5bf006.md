---
type: Table
id: table/30-rest-adapter-11-implementation-contract-11-5-rules/1/5a73dd5bf006
phase: adapter
delivery: reference
applies_to: rest
requires: []
references: []
content_sha256: 5a73dd5bf00624197eefd8ad3349e787106564da9307d78706c313752548c033
source: docs/archive/IMPLEMENTATION-SPEC/30-REST.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| REST-19 | REST adapters MUST use the admitted HTTP crate and call the shared dispatcher through the adapter bridge. | Admission. | Handler conversion. | V2 source; V3 route test. |
| REST-20 | Every REST rejection path MUST use the shared semantic error renderer and the canonical request_id. | Shared renderer. | Error text. | V3 rejection fixtures. |
| REST-21 | OpenAPI operations and schemas MUST be generated from the same operation and validation manifest used at runtime. | Generation source. | Descriptions. | V3 equality test. |
