---
type: Rule
id: CORE-02
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 7b03bcee7c3655823892ff100affdf616d42ee7efceb7ca17738e775e135ae03
source: sources/15-RULE-REGISTRY.md
---
| `CORE-02` | C | all | CORE | Part III.3 | Illegal states are unrepresentable. A state transition returns `Result<NextState, DomainError>`. | V1; V3 transition tests. | cargo test -p <project>-operation/core |
