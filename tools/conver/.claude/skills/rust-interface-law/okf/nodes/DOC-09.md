---
type: Rule
id: DOC-09
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 84f291d30220cfd5d0971983a6e990c938ccc3dc7bc12ccd7bf4de37ab410bff
source: sources/15-RULE-REGISTRY.md
---
| `DOC-09` | G | docs | DOC | Part III.16 | OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references. | V3 diff test. | cargo run -p <project>-docgen -- --check all |
