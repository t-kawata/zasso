---
type: Rule
id: ARC-03
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: c3c4d223406a821334edbc047549fa5dc54e710fed60b2eaaff83b2024d49498
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `ARC-03` | C | all | ARC | Part II | `*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*`, `clap`, or any protocol SDK. | V2 dependency and import scan. | cargo metadata / check-deps |
