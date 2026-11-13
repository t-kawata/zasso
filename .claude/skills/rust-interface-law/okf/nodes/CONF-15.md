---
type: Rule
id: CONF-15
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 6ade94feddf641b2f865f32d9d54a33a8af8a84f6ba7183629df8d6a91ae0e3e
source: sources/15-RULE-REGISTRY.md
---
| `CONF-15` | P | conformance | CONF | Part III.12 | An expired binding is rejected even when the signature is valid. | V3 test. | cargo test -p <project>-conformance |
