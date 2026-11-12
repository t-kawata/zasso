---
type: Rule
id: APP-06
phase: scope
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 63005bac736e72bb78fe4c93af8c2dece83ef0e096b04904b034df33d8583528
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `APP-06` | O | all | APP | Part II | Adoption order SHOULD, within the interface profiles a project selects, be: identity-core and identity-jwt → operation authorization and conformance → REST → WebSocket → CLI → gRPC → MCP → A2A. A project MAY select any subset. | V4 review; project plan. | rules coverage check |
