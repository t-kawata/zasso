---
type: Rule
id: ERR-03
phase: operation
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 2a68e46bf568b046d4189a07bbb6ec663564ad0f70408e9969f724e60c83ebd7
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `ERR-03` | C | all | ERR | Part II | Error values MUST NOT contain secrets, tokens, passwords, or raw provider responses. | V2 scan; V3 redaction test. | mapping / redaction / audit tests |
