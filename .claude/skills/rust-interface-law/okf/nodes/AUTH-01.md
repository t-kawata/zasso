---
type: Rule
id: AUTH-01
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 40ebe10e3e079adbc53259aeb9a852cc8a4c60eb76ea91bdaac6f388db02f45e
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-01` | C | all | AUTH | Part II | Token verification MUST be expressed as a protocol-independent `AccessTokenVerifier` trait in `identity-core`. | V1 trait; V2 import scan. | negative-auth suite |
