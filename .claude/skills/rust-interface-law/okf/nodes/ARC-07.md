---
type: Rule
id: ARC-07
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 1612853275e5a0b02e8e6a1a7c0b02aff5fec6f1a365076f9f94b9ac291f24e5
source: sources/15-RULE-REGISTRY.md
---
| `ARC-07` | C | all | ARC | Part II | `*-core` MUST define ports (traits) for external effects; it MUST NOT call infrastructure directly. | V1/V3; review of public traits and tests with fakes. | cargo metadata / check-deps |
