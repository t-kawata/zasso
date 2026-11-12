---
type: Rule
id: SSO-07
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: bfae6e46565decaff19a0a23e0fa1b4c09a47c9ea069a02b658820be2d24d7fc
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `SSO-07` | O/C | auth-sso | SSO | Part II | SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer` to issue an internal access token. | V1 type; V3 test. | negative-auth suite |
