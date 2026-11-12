---
type: Rule
id: SSO-08
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 51055565dc215104f323df1f780d3964c6dc65c7b170c97a5a0183858db9f1e6
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `SSO-08` | O/C | auth-sso | SSO | Part II | External accounts MUST be stored in `external_identities` with `UNIQUE(issuer, subject)`. Business tables MUST NOT store external provider IDs. | V2 schema check; V3 test. | negative-auth suite |
