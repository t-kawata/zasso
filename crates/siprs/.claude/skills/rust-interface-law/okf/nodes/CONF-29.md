---
type: Rule
id: CONF-29
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: c22df540c11044397797a440015760f70de4fa9c3b3c92bc46e7f133d5e474bf
source: sources/15-RULE-REGISTRY.md
---
| `CONF-29` | P | conformance | CONF | Part III.12 | No unrelated external API wait occurs inside a database transaction; transaction-required DB communication is allowed. | V2 architecture scan; V3 test. | cargo test -p <project>-conformance |
