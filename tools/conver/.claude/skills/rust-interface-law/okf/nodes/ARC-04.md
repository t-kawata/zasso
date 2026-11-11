---
type: Rule
id: ARC-04
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0121f128e858a772acd65f13b80e222c74bf99e39ca78032c8cace5de60c6bde
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `ARC-04` | C | all | ARC | Part II | An interface crate MUST NOT depend on another interface crate. | V2 `cargo metadata` edge check. | cargo metadata / check-deps |
