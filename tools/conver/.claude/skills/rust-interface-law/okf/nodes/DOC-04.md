---
type: Rule
id: DOC-04
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: fe4168b22374249d693cf4c0f6a65c94f0386ff53074c4da3ab3d9b0c5169815
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `DOC-04` | C | docs | DOC | Part III.16 | `utoipa`/OpenAPI MAY be used as a schema source and REST output, but MUST NOT be the only source for non-REST interfaces. | V3 test. | cargo run -p <project>-docgen -- --check all |
