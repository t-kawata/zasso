---
type: "Section"
title: "6. Runtime Execution"
description: "All interfaces use the same validator:"
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "47-validation-6-runtime-execution"
    title: "6. Runtime Execution"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/47-VALIDATION.md"
x-source-span: "199-229"
---
## 6. Runtime Execution

All interfaces use the same validator:

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

Generated validation is stateless input validation. State-dependent
preconditions, resource loading, and ownership authorization belong in
`prepare`, which is not called on replay.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-11 | Adapters do not implement interface-specific input validation. | Forbidden. | Conversion details. | V2 scan; V3 test. |
| VAL-12 | The generated validator runs after typed conversion and before the idempotency claim; prepare runs only on the acquired branch. | Order. | Dispatch placement. | V3 test. |
| VAL-13 | Validation failures map to `invalid_input` with field, code, and English message. | Mapping. | Message text. | V3 test. |
| VAL-14 | The same input produces the same validation result through every interface. | Parity. | — | V3 conformance. |

---

