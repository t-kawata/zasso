---
type: Rule
id: IDN-14
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 9eb8ac10e6ceb5126769b4d78a936f98a6ee8794e58de88be102bef58ada2f7b
source: sources/15-RULE-REGISTRY.md
---
| `IDN-14` | O/C | auth-jwt | IDN | Part III.5 | The loser of concurrent refresh receives `invalid_grant`; idempotent grace requires an encrypted replacement cache, not a hash-only record. | V3 test. | negative-auth suite |
