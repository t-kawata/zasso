---
type: Rule
id: AUTHZ-03
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 59c04890783cb09a578beec11ce781b259e27ad8ac2e60bf027d92399404d613
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTHZ-03` | C | all | AUTHZ | Part II | Tenant and owner checks MUST use the identity and the loaded resource, not request-supplied IDs. | V3 cross-tenant test. | negative-auth suite |
