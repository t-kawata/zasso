---
type: Rule
id: AUTH-22
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 835c0fd58b5db6c0e4d18407ca1b43db455610d049b3b6695450a1744e7cd9fa
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-22` | C | all | AUTH | Part II | WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. Long-lived JWT query parameters are forbidden. | V3 test. | negative-auth suite |
