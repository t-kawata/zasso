---
type: Rule
id: CONF-17
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 799026b7c0175c8febf729e9545e4fb7b87a49b5e55a5ab057908141b95a829a
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-17` | P | conformance | CONF | Part III.12 | Delegation preserves `actor` and `on_behalf_of` and rejects unauthorized delegation. | V3 test. | cargo test -p <project>-conformance |
