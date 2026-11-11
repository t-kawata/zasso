---
type: Rule
id: CONF-36
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 03c51a854991cfc96111c95269cb6d289769802d69a3bda5a1b600c0afec521a
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-36` | P | conformance | CONF | Part III.12 | A driver that cannot exercise a required boundary reports `Fail`, not `NotApplicable`. | V3 test. | cargo test -p <project>-conformance |
