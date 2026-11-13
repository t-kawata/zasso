---
type: Rule
id: CORE-09
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: a0cbf4588b47dd9d6335d687d64de5b874254f91fc475ee2874b402cbd1c72bb
source: sources/15-RULE-REGISTRY.md
---
| `CORE-09` | C | all | CORE | Part III.3 | Core does not serialize wire envelopes or know protocol status codes. | V2 scan. | cargo test -p <project>-operation/core |
