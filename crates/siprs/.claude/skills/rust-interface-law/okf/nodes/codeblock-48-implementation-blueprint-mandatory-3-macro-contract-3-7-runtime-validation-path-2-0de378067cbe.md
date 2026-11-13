---
type: CodeBlock
id: codeblock/48-implementation-blueprint-mandatory-3-macro-contract-3-7-runtime-validation-path/2/0de378067cbe
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 0de378067cbee6f9d437f94d6c578c501a6af2151358081f27045f3b8fe9cb80
source: sources/48-IMPLEMENTATION-BLUEPRINT.md
---
```text
authenticate / scope / deadline
        ↓
validate_json (deserialize + generated input validation)
        ↓
idempotency claim
        ├─ replay → replay_authorize → stored result
        └─ acquired → prepare_validated → execute → commit/outbox → result
```
