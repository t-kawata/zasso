---
type: Rule
id: AUTH-15
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2a371767c600edf6e710f7b2e3b0f12a44aee8fa73828d5891b37c8220bbd7e2
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-15` | C | all | AUTH | Part II | Refresh tokens MUST be opaque random values, stored only as hashes, rotated on every use, and revoked as a session family on reuse detection. | V3 test. | negative-auth suite |
