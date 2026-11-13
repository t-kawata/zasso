---
type: Rule
id: CONF-60
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: db11b413786a7084d54c4083b5965248ec3db8c591f8828b8cc02b948eac4f13
source: sources/15-RULE-REGISTRY.md
---
| `CONF-60` | P | conformance | CONF | Part III.12 | Unknown or type-incompatible rules fail compilation; no rule is silently omitted. | V3 compile-fail test. | cargo test -p <project>-conformance |
