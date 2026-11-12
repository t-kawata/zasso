---
type: Rule
id: SSO-01
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 76b1f69d990ee8fbdfa7b9bfc24d19780c11155a89f29eca56feec11e0aa25da
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `SSO-01` | O/C | auth-sso | SSO | Part II | SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or `*-core`. | V2 dependency check. | negative-auth suite |
