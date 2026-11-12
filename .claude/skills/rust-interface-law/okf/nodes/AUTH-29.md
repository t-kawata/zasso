---
type: Rule
id: AUTH-29
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0998fd21c426a01ff623043409812bbbc117d9a3ddf0e4050916fd8e2a682e5c
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-29` | C | all | AUTH | Part II | `VerifiedIdentity` MUST carry the credential binding: interface, audience, method, authentication time, expiry, token ID, and token version. The dispatcher MUST reject a binding mismatch. | V1 type; V3 test. | negative-auth suite |
