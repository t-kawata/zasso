---
type: Rule
id: ARC-01
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2e71c8c7e008df4e6accd85e727324dd5c8d1c0284a058ae2c2d7cb92217d2fd
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `ARC-01` | C | all | ARC | Part II | Each crate MUST have one primary runtime role from §3.1. Additional roles (`tooling`, `test-support`, `build-support`, `utility`) are allowed when declared in `RULES-PROFILE.toml` with their allowed dependency edges. A crate MUST NOT mix incompatible runtime roles. | V4 review; crate manifest and module layout. | cargo metadata / check-deps |
