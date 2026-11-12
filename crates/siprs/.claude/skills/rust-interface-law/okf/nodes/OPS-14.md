---
type: Rule
id: OPS-14
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 6e2e3de40ed57861c7018e78280b153b69c8fbf60b60503a83828775b214cab7
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-14` | C | all | OPS | Part II | An operation MUST declare `AuthenticationRequirement::Required` or `AuthenticationRequirement::Anonymous`. Anonymous is not a scope, and `Option<Identity>` or an implicit anonymous path is forbidden. | V1 type; V3 test. | cargo test -p <project>-operation/core |
