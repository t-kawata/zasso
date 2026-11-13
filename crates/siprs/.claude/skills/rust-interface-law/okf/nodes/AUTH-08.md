---
type: Rule
id: AUTH-08
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: e879cc0db453de6a80d31ce10acf54eea0d0506dd5599ce677b95b7d2883f1a4
source: sources/15-RULE-REGISTRY.md
---
| `AUTH-08` | C | all | AUTH | Part II | `aud` MUST identify one interface or resource. Wildcard audiences are forbidden. A token for one interface MUST be rejected by another. | V3 audience-isolation test. | negative-auth suite |
