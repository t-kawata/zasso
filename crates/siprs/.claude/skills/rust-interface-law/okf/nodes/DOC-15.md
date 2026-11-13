---
type: Rule
id: DOC-15
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: d0d76915a83996e601e2e7da027a0e0181a0134161505173d6aa81eeb2859c2b
source: sources/15-RULE-REGISTRY.md
---
| `DOC-15` | G | docs | DOC | Part III.16 | Documentation generation MUST be part of CI/conformance; a missing artifact fails the gate. | V3 test. | cargo run -p <project>-docgen -- --check all |
