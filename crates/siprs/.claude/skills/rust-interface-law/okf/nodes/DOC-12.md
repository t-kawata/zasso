---
type: Rule
id: DOC-12
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 7c7dcb2ca57e86cb72a5433027194eae84af03462518cb7434d231ece94e1075
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `DOC-12` | G | docs | DOC | Part III.16 | Generation MUST be deterministic for the same inputs and version. | V3 digest test. | cargo run -p <project>-docgen -- --check all |
