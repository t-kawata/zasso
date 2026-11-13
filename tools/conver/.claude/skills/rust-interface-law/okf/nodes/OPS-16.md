---
type: Rule
id: OPS-16
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 00ec7e2192155ba22dcfdcc0f946dd63079df5527b2475e15985528932c00d41
source: sources/15-RULE-REGISTRY.md
---
| `OPS-16` | C | all | OPS | Part II | Every operation MUST have a conformance identifier and at least one oracle for normal and failure behavior. | V3 rule coverage. | cargo test -p <project>-operation/core |
