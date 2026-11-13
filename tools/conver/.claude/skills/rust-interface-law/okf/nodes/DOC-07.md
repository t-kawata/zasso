---
type: Rule
id: DOC-07
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: f15d5d53310a68d6ed2cd7270f3fd28a46ae3e3f60ba683401024c85d4ef9ee3
source: sources/15-RULE-REGISTRY.md
---
| `DOC-07` | C | docs | DOC | Part III.16 | Every operation section MUST include schema, examples, auth, errors, idempotency, streaming, authorization, and conformance ID. | V3 completeness test. | cargo run -p <project>-docgen -- --check all |
