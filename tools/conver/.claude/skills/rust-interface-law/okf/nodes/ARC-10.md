---
type: Rule
id: ARC-10
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b48ef953d0f67bd5105fff4f0c6f49513e9139074d7d17992376104eb52ef30d
source: sources/15-RULE-REGISTRY.md
---
| `ARC-10` | C | all | ARC | Part II | Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`. | V4 review. | cargo metadata / check-deps |
