---
type: Rule
id: ARC-09
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 4bc5b918521cf0eb35276e2ccdfb46791e2ac2bfe968991d5b1f9948158a44c7
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `ARC-09` | C | all | ARC | Part II | Crate names MUST use the project prefix and the role suffix (`<project-c>-core`, `<project-c>-operation`, `<project-c>-rest`, and so on). | V4 review; manifest check. | cargo metadata / check-deps |
