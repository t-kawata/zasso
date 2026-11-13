---
type: Rule
id: CONF-04
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 7534314194e8f9b835a8eed993944dfc986bec244961a51497ea08edbafc2219
source: sources/15-RULE-REGISTRY.md
---
| `CONF-04` | P | conformance | CONF | Part III.12 | A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell. | V3 test. | cargo test -p <project>-conformance |
