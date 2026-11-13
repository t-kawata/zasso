---
type: Rule
id: CONF-18
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 74154699deadac4e3c13873dfa8aaf1c05dc74204c93e48d97cf89dcd932bc8f
source: sources/15-RULE-REGISTRY.md
---
| `CONF-18` | P | conformance | CONF | Part III.12 | Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation. | V3 test. | cargo test -p <project>-conformance |
