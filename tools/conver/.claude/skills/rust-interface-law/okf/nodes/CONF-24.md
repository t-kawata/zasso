---
type: Rule
id: CONF-24
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: ec743d34224c1dde1091cfad429238d56dc4f7a1cce5569efd6208c630099d24
source: sources/15-RULE-REGISTRY.md
---
| `CONF-24` | P | conformance | CONF | Part III.12 | Concurrent claims for the same namespace and key produce one execution. | V3 concurrency test. | cargo test -p <project>-conformance |
