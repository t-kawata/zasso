---
type: Rule
id: CONF-46
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: b20290dae79e8e320851daa29efa657a0eb946cf5db9219ff069b90df2724cbd
source: sources/15-RULE-REGISTRY.md
---
| `CONF-46` | P | conformance | CONF | Part III.12 | An expired lease owner cannot complete or commit after a new owner acquires the claim. | V3 test. | cargo test -p <project>-conformance |
