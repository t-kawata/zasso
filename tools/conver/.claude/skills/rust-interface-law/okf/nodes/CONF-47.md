---
type: Rule
id: CONF-47
phase: conformance
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 66d95ab260b12de802358915ca8f74b79c2ee090fd48744ae05605a77476c9d9
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `CONF-47` | P | conformance | CONF | Part III.12 | A replay after a successful delete, create, or approve returns the stored result with current authorization, not a state-precondition error. | V3 test. | cargo test -p <project>-conformance |
