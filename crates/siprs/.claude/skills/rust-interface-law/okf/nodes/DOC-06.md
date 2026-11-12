---
type: Rule
id: DOC-06
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 524b9226528fb1fddb70314a9d5e6f5f96f6b656268d850cb55da6c4cb8fae20
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `DOC-06` | G | docs | DOC | Part III.16 | Documentation generation MUST NOT require a running REST server or REST adapter. | V2/V3 test. | cargo run -p <project>-docgen -- --check all |
