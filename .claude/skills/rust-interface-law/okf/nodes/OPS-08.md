---
type: Rule
id: OPS-08
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 9f335eb1dc1a2119d8fb62ea634c6d44f019e3aba1778f70c6921f13f526bd05
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `OPS-08` | C | all | OPS | Part II | Tenant and ownership MUST be derived from `VerifiedIdentity` and the target resource, never from request-supplied IDs alone. | V3 cross-tenant test. | cargo test -p <project>-operation/core |
