---
type: CodeBlock
id: codeblock/47-validation-contract-6-runtime-execution/1/a125426b7bca
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: a125426b7bca701494d64d7bea967ef61ff29085a4b18eb73476ef4e2407bec8
source: sources/47-VALIDATION.md
---
```text
REST / WS / CLI / gRPC / MCP / A2A
        ↓
typed request conversion (adapter)
        ↓
ContractValidate::validate() (generated, common operation path)
        ↓
idempotency claim
        ├─ replay → replay_authorize → stored result
        └─ acquired → prepare → execute
```
