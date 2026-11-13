---
type: Rule
id: SSO-11
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 05990cc9d953b9ce8fd4ef06067cd6caf65a4bd773b1cc37dcdc210f2a56db0e
source: sources/15-RULE-REGISTRY.md
---
| `SSO-11` | O/C | auth-sso | SSO | Part II | Adding SSO MUST change only: the `identity-sso` crate, authentication adapters, assembly wiring, configuration, and `external_identities`. Business operations, `VerifiedIdentity`, and business tables MUST remain unchanged. | V3 regression test; V4 review. | negative-auth suite |
