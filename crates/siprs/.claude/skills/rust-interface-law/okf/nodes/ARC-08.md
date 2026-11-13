---
type: Rule
id: ARC-08
phase: core
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 57bf537be9bcea1011374a4cb6ac47c6804c0bf0ae7a6562ed443bd0d28c5967
source: sources/15-RULE-REGISTRY.md
---
| `ARC-08` | C | all | ARC | Part II | `*-operation` MUST depend on `identity-core` traits, never on `identity-jwt` or `identity-sso`. | V2 dependency check. | cargo metadata / check-deps |
