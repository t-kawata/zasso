---
type: Rule
id: CONF-21
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0b31148893d2f3fb14c2879c045f48c899f47c422b78d1b17204ff7aaf57359c
source: sources/15-RULE-REGISTRY.md
---
| `CONF-21` | P | conformance | CONF | Part III.12 | The trusted constructor is not reachable from adapter crates; allowed call sites are audited. | V2 scan; V4 review. | cargo test -p <project>-conformance |
