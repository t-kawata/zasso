---
type: Rule
id: CONF-55
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: ae3722dd1c46529212a4664aac2e4eec75c0479e28c9d825816905671c9ce223
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-55` | P | conformance | CONF | Part III.12 | Documentation generation is deterministic for the same inputs and version. | V3 digest test. | cargo test -p <project>-conformance |
