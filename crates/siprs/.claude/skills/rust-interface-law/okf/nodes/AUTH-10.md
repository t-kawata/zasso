---
type: Rule
id: AUTH-10
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b7c8692c4b99c573e274e94e9cd87c117b6d71a81c821d7cfbce0ecfd7644824
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `AUTH-10` | C | all | AUTH | Part II | Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multiple active public keys MUST be supported for rotation. | V1 trait; V3 rotation test. | negative-auth suite |
