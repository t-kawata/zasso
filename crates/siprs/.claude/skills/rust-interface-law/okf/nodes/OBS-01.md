---
type: Rule
id: OBS-01
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 55522aa42e25718ab1f9d77e77af1da44d4d428f69ad3c0bac939a9bb1c6c630
source: sources/15-RULE-REGISTRY.md
---
| `OBS-01` | C | all | OBS | Part II | Logs MUST be structured and include `request_id`, `operation_id`, `subject`, result, and duration. | V3 log test. | mapping / redaction / audit tests |
