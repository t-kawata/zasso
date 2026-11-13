---
type: Rule
id: AUTH-12
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 6b59a8431e6657b4870b1fe713c09e9975ae6735075c6e4edb14573bb5ae2fbb
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-12` | C | all | AUTH | Part II | Validation order MUST be: algorithm allowlist → signature → `iss` → `aud` → `exp`/`nbf` → `typ` → `sub` → tenant/delegation → `ver` → `jti`. | V3 instrumented test. | negative-auth suite |
